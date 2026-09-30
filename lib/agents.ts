import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { syncAgentStatus } from "@/lib/agent-status";
import { appendChangeNote, latestChangeNote } from "@/lib/change-notes";
import { dependentTasks, directDependencies, transitiveDependencies, unmetDependencyIds } from "@/lib/depends";
import { safeErrorMessage, TaskRunError } from "@/lib/errors";
import { assertMaxLength } from "@/lib/input-caps";
import { MAX_NOTE_CHARS } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { reclaimStuckTasks } from "@/lib/reclaim";
import { emitEvent, preserveLegacyOutputs, recordRun, type EventStructure } from "@/lib/run-history";
import { releaseModelRun, reserveModelRun, utcDay } from "@/lib/usage";
import {
  composeSystemPrompt,
  composeUserPrompt,
  packageDependencyOutputs,
  type HandoffInput,
} from "@/lib/prompt";
import { serializeTask } from "@/lib/serialize";

type TaskWithAgent = {
  id: string;
  title: string;
  status: string;
  output: string | null;
  dependsOn: string;
  agent: { name: string };
};

async function emit(
  projectId: string,
  type: string,
  message: string,
  taskId: string,
  structure?: EventStructure,
) {
  await emitEvent(projectId, type, message, taskId, structure);
}

function toHandoff(task: TaskWithAgent): HandoffInput {
  return {
    agentName: task.agent.name,
    taskTitle: task.title,
    output: task.output ?? "",
  };
}

function modelForProvider(provider: string): string {
  if (provider === "openai") return process.env.OPENAI_MODEL?.trim() ?? "";
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL?.trim() ?? "";
  return "";
}

function assertConfigured(provider: string, model: string) {
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    if (!model) throw new Error("ANTHROPIC_MODEL is not set");
    return;
  }
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
    if (!model) throw new Error("OPENAI_MODEL is not set");
    return;
  }
  throw new Error(`Unknown provider "${provider}"`);
}

async function callAnthropic(model: string, system: string, user: string) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 0,
    timeout: 60_000,
  });
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Anthropic returned an empty response");
  return text;
}

async function callOpenAI(model: string, system: string, user: string) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 60_000,
  });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const text = response.choices[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("OpenAI returned an empty response");
  return text;
}

async function callProvider(provider: string, model: string, system: string, user: string) {
  if (provider === "anthropic") return callAnthropic(model, system, user);
  if (provider === "openai") return callOpenAI(model, system, user);
  throw new Error(`Unknown provider "${provider}"`);
}

class ProviderError extends Error {
  constructor(
    readonly original: unknown,
    readonly tries: number,
  ) {
    super(original instanceof Error ? original.message : "Provider request failed");
  }
}

async function withOneRetry(fn: () => Promise<string>): Promise<{ text: string; tries: number }> {
  try {
    return { text: await fn(), tries: 1 };
  } catch {
    try {
      return { text: await fn(), tries: 2 };
    } catch (error) {
      throw new ProviderError(error, 2);
    }
  }
}

type RunClaim = { taskId: string; startedAt: Date };

/** Guarded write: only applies while this exact attempt still owns the task. */
async function commitIfOwned(claim: RunClaim, data: Prisma.TaskUpdateManyMutationInput) {
  const updated = await prisma.task.updateMany({
    where: { id: claim.taskId, status: "running", startedAt: claim.startedAt },
    data,
  });
  return updated.count === 1;
}

export async function runTask(taskId: string, userId: string) {
  const owner = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, project: { select: { userId: true } } },
  });
  if (!owner || owner.project.userId !== userId) throw new TaskRunError("Task not found", 404);
  await reclaimStuckTasks(owner.projectId);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { agent: true, project: true },
  });
  if (!task || task.project.userId !== userId) throw new TaskRunError("Task not found", 404);
  if (task.status === "running") throw new TaskRunError("Task is already running", 409);
  if (task.status === "awaiting_approval") {
    throw new TaskRunError("Task is awaiting approval", 409);
  }

  const tasks = await prisma.task.findMany({
    where: { projectId: task.projectId },
    include: { agent: true },
  });
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const unmet = unmetDependencyIds(task.dependsOn, byId);
  if (unmet.length > 0) {
    throw new TaskRunError("Dependencies are not done", 409, { unmet });
  }

  const isModel = task.agent.provider !== "human";
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const usageDay = utcDay(startedAt);
  const claim: RunClaim = { taskId: task.id, startedAt };

  // Quota: reserve BEFORE claiming, atomically. If the run later fails, is
  // discarded, or is reclaimed as stuck, the reservation is released, so only
  // successful runs count. Invariant: a model task in `running` holds exactly one
  // reservation on utcDay(startedAt) (lib/reclaim.ts relies on this).
  if (isModel) await reserveModelRun(userId, usageDay);

  const claimed = await prisma.task.updateMany({
    where: { id: task.id, status: { notIn: ["running", "awaiting_approval"] } },
    data: {
      status: "running",
      startedAt,
      output: null,
      completedAt: null,
      model: null,
    },
  });
  if (claimed.count !== 1) {
    if (isModel) await releaseModelRun(userId, usageDay);
    throw new TaskRunError("Task is already running", 409);
  }

  await prisma.agent.update({
    where: { id: task.agentId },
    data: { status: "working" },
  });
  await emit(
    task.projectId,
    "started",
    `${task.agent.name} started "${task.title}"`,
    task.id,
    { runId, payload: { agent: task.agent.name } },
  );

  const sourceTasks =
    task.agent.provider === "human"
      ? transitiveDependencies(task.dependsOn, byId).filter((item) => item.status === "done")
      : directDependencies(task.dependsOn, byId);
  const handoffs = sourceTasks.map(toHandoff);

  for (const source of sourceTasks) {
    await emit(
      task.projectId,
      "handoff",
      `Handoff: ${source.agent.name} handed "${source.title}" to ${task.agent.name}`,
      task.id,
      {
        fromTaskId: source.id,
        toTaskId: task.id,
        runId,
        payload: {
          fromAgent: source.agent.name,
          toAgent: task.agent.name,
          fromTitle: source.title,
          toTitle: task.title,
        },
      },
    );
  }

  if (task.agent.provider === "human") {
    const note = latestChangeNote(task.instructions);
    const output = note
      ? `${packageDependencyOutputs(handoffs)}\n\n## Changes you requested\n${note}`
      : packageDependencyOutputs(handoffs);
    const committed = await commitIfOwned(claim, { output, status: "awaiting_approval", model: "human" });
    await recordRun({
      id: runId,
      taskId: task.id,
      projectId: task.projectId,
      outcome: committed ? "succeeded" : "discarded",
      provider: "human",
      model: "human",
      output,
      error: committed ? null : "Task was reclaimed before the gate opened",
      latencyMs: Date.now() - startedAt.getTime(),
      startedAt,
      completedAt: new Date(),
    });
    if (!committed) throw new TaskRunError("Task changed while the gate was opening. Refresh and try again.", 409);
    await emit(
      task.projectId,
      "approval_requested",
      `Waiting on YOU to approve "${task.title}"`,
      task.id,
      { runId, payload: { gate: true } },
    );
    await syncAgentStatus(task.agentId);
    return serializeTask(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
  }

  const model = modelForProvider(task.agent.provider);
  const system = composeSystemPrompt(task.agent);
  const user = composeUserPrompt({
    brief: task.project.brief,
    instructions: task.instructions,
    handoffs,
  });

  const runBase = {
    id: runId,
    taskId: task.id,
    projectId: task.projectId,
    provider: task.agent.provider,
    model: model || null,
    systemPrompt: system,
    prompt: user,
    startedAt,
  };

  let output: string;
  let tries = 1;
  try {
    assertConfigured(task.agent.provider, model);
    const result = await withOneRetry(() => callProvider(task.agent.provider, model, system, user));
    output = result.text;
    tries = result.tries;
  } catch (thrown) {
    const error = thrown instanceof ProviderError ? thrown.original : thrown;
    const message = safeErrorMessage(error);
    // Failed runs never count against the daily quota.
    await releaseModelRun(userId, usageDay);
    await recordRun({
      ...runBase,
      outcome: "failed",
      error: message,
      tries: thrown instanceof ProviderError ? thrown.tries : 1,
      latencyMs: Date.now() - startedAt.getTime(),
      completedAt: new Date(),
    });
    const owned = await commitIfOwned(claim, { status: "failed", model: null });
    if (owned) {
      await emit(task.projectId, "failed", `${task.agent.name} failed "${task.title}": ${message}`, task.id, {
        runId,
        payload: { error: message },
      });
    }
    await syncAgentStatus(task.agentId);
    throw new TaskRunError(message, 502);
  }

  const latencyMs = Date.now() - startedAt.getTime();
  const status = task.requiresApproval ? "awaiting_approval" : "done";
  const committed = await commitIfOwned(claim, {
    output,
    status,
    model,
    completedAt: status === "done" ? new Date() : null,
  });
  if (!committed) {
    // The task was reclaimed as stuck (and its reservation released) while this
    // request was still waiting on the provider. Keep the output in history but
    // do not apply it over whatever happened since.
    await recordRun({
      ...runBase,
      outcome: "discarded",
      output,
      tries,
      latencyMs,
      error: "Finished after the task was recovered as stuck; output kept in history but not applied",
      completedAt: new Date(),
    });
    throw new TaskRunError(
      "This run finished after the task was recovered as stuck. Its output is saved in run history but was not applied. Run the task again.",
      409,
    );
  }
  await recordRun({ ...runBase, outcome: "succeeded", output, tries, latencyMs, completedAt: new Date() });
  await prisma.agent.update({
    where: { id: task.agentId },
    data: { model },
  });
  await emit(
    task.projectId,
    status === "done" ? "completed" : "approval_requested",
    status === "done"
      ? `${task.agent.name} completed "${task.title}"`
      : `Waiting on YOU to approve "${task.title}"`,
    task.id,
    { runId, payload: status === "done" ? { agent: task.agent.name } : { gate: false } },
  );
  await syncAgentStatus(task.agentId);
  if (status === "done") await openReadyHumanGates(task.projectId, userId);
  return serializeTask(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
}

async function openReadyHumanGates(projectId: string, userId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { agent: true },
  });
  const byId = new Map(tasks.map((item) => [item.id, item]));
  for (const candidate of tasks) {
    if (candidate.agent.provider !== "human") continue;
    if (candidate.status !== "pending") continue;
    if (unmetDependencyIds(candidate.dependsOn, byId).length > 0) continue;
    await runTask(candidate.id, userId);
  }
}

export async function rerunTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { agent: true, project: true },
  });
  if (!task || task.project.userId !== userId) throw new TaskRunError("Task not found", 404);
  await reclaimStuckTasks(task.projectId);
  if (task.status !== "done") throw new TaskRunError("Only a finished task can be re-run", 409);

  const tasks = await prisma.task.findMany({ where: { projectId: task.projectId } });
  const downstream = dependentTasks(task.id, tasks);
  const wipe = [task, ...downstream];
  // History survives: every output being cleared already has a TaskRun row
  // (older outputs get a `legacy` row here). Task.output only tracks the current run.
  await preserveLegacyOutputs(wipe);
  await prisma.$transaction(
    wipe.map((item) =>
      prisma.task.update({
        where: { id: item.id },
        data: {
          status: "pending",
          output: null,
          startedAt: null,
          completedAt: null,
          model: null,
        },
      }),
    ),
  );
  await emit(
    task.projectId,
    "note",
    `Re-run cleared: ${wipe.map((item) => item.title).join(", ")}`,
    task.id,
    { payload: { kind: "rerun_cleared", taskIds: wipe.map((item) => item.id) } },
  );
  const agentIds = [...new Set(wipe.map((item) => item.agentId))];
  for (const agentId of agentIds) await syncAgentStatus(agentId);
  return runTask(task.id, userId);
}

export async function decideTask(taskId: string, approved: boolean, note: string | undefined, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { agent: true, project: true },
  });
  if (!task || task.project.userId !== userId) throw new TaskRunError("Task not found", 404);
  await reclaimStuckTasks(task.projectId);
  if (task.status !== "awaiting_approval") {
    throw new TaskRunError("Task is not awaiting approval", 409);
  }

  if (approved) {
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "done", completedAt: new Date() },
    });
    await emit(task.projectId, "approved", `You approved "${task.title}"`, task.id, {
      payload: { decision: "approved", approver: "You" },
    });
    await syncAgentStatus(task.agentId);
    return serializeTask(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
  }

  const trimmed = note?.trim() ?? "";
  if (!trimmed) throw new TaskRunError("A note is required to request changes", 400);
  assertMaxLength("Note", trimmed, MAX_NOTE_CHARS);

  const tasks = await prisma.task.findMany({
    where: { projectId: task.projectId },
    include: { agent: true },
  });
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const direct = directDependencies(task.dependsOn, byId);
  const roots = (direct.length > 0 ? direct : [task]).map((item) => {
    const parent = directDependencies(item.dependsOn, byId).find((candidate) => candidate.agent.provider !== "human");
    return parent ?? item;
  });
  const rootIds = new Set(roots.map((item) => item.id));
  const wipeIds = new Set<string>([task.id]);
  for (const root of roots) {
    wipeIds.add(root.id);
    for (const later of dependentTasks(root.id, tasks)) wipeIds.add(later.id);
  }

  await preserveLegacyOutputs([...wipeIds].map((id) => byId.get(id) ?? task));
  await prisma.$transaction(
    [...wipeIds].map((id) => {
      const item = byId.get(id) ?? task;
      const keepNote = id === task.id || rootIds.has(id);
      return prisma.task.update({
        where: { id },
        data: {
          status: "pending",
          output: null,
          startedAt: null,
          completedAt: null,
          model: null,
          ...(keepNote ? { instructions: appendChangeNote(item.instructions, trimmed) } : {}),
        },
      });
    }),
  );

  const rootTitles = roots.map((item) => item.title).join(", ");
  await emit(
    task.projectId,
    "note",
    `You requested changes on "${task.title}": ${trimmed}. Run "${rootTitles}" again. Nothing was sent to Claude or GPT.`,
    task.id,
    {
      fromTaskId: task.id,
      toTaskId: roots.length === 1 ? roots[0].id : null,
      payload: {
        decision: "changes_requested",
        approver: "You",
        note: trimmed,
        rootTaskIds: roots.map((item) => item.id),
        clearedTaskIds: [...wipeIds],
      },
    },
  );
  const agentIds = [...new Set([...wipeIds].map((id) => (byId.get(id) ?? task).agentId))];
  for (const agentId of agentIds) await syncAgentStatus(agentId);
  return serializeTask(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
}
