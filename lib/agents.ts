import { cleanCitations } from "@/lib/critique";
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Prisma } from "@prisma/client";
import { syncAgentStatus } from "@/lib/agent-status";
import { appendChangeNote, latestChangeNote } from "@/lib/change-notes";
import { dependentTasks, directDependencies, transitiveDependencies, unmetDependencyIds } from "@/lib/depends";
import { safeErrorMessage, TaskRunError } from "@/lib/errors";
import { handName } from "@/lib/hands";
import { assertMaxLength } from "@/lib/input-caps";
import { briefWithSources } from "@/lib/sources";
import { MAX_NOTE_CHARS, MAX_OUTPUT_TOKENS_ANTHROPIC, MAX_OUTPUT_TOKENS_OPENAI } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { isStuck, reclaimStuckTasks } from "@/lib/reclaim";
import { emitEvent, emitEvents, preserveLegacyOutputs, recordRun, type EventStructure } from "@/lib/run-history";
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
    agentName: handName(task.agent.name),
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
    max_tokens: MAX_OUTPUT_TOKENS_ANTHROPIC,
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

/**
 * Daedalus fact-checks with OpenAI's hosted web search (Responses API) when the model
 * and account allow it. The search runs on OpenAI's side, so the Worker only waits on
 * one fetch (wall time, not CPU). Any failure falls back to the plain call below,
 * which says it cannot search. OPENAI_WEB_SEARCH=off turns it off.
 */
async function callOpenAIWithSearch(client: OpenAI, model: string, system: string, user: string) {
  const response = await client.responses.create(
    {
      model,
      instructions: system,
      input: `${user}\n\n(Web search is available for this check. Cite the URLs you used.)`,
      tools: [{ type: "web_search" }],
      max_output_tokens: MAX_OUTPUT_TOKENS_OPENAI,
    },
    { timeout: 150_000 },
  );
  const text = cleanCitations(response.output_text?.trim() ?? "");
  if (!text) throw new Error("OpenAI returned an empty response");
  return text;
}

async function callOpenAI(model: string, system: string, user: string) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 60_000,
  });
  if (process.env.OPENAI_WEB_SEARCH !== "off") {
    try {
      return await callOpenAIWithSearch(client, model, system, user);
    } catch (error) {
      console.warn("web search check unavailable, using plain check:", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    }
  }
  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: MAX_OUTPUT_TOKENS_OPENAI,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `${user}\n\n(Web search is not available for this check.)` },
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

/**
 * The project's tasks with their agents, plus the project brief, in three queries.
 * Ownership is part of the first query (project of this user that has this task).
 */
async function loadRunContext(taskId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { userId, tasks: { some: { id: taskId } } },
    select: { id: true, brief: true },
  });
  if (!project) return null;
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    include: { agent: true },
  });
  return { project, tasks };
}

/**
 * `dailyLimit` is the account's own model-run cap for today (lib/limits.ts dailyRunLimit:
 * lower during a new account's trial). Defaults to the normal DAILY_MODEL_RUNS.
 */
export async function runTask(taskId: string, userId: string, dailyLimit?: number) {
  let context = await loadRunContext(taskId, userId);
  if (!context) throw new TaskRunError("Task not found", 404);
  // Lazy stuck-run recovery, as before, but only when a loaded task is actually
  // `running` past the timeout (reclaimStuckTasks acts on nothing else); then reload.
  const checkedAt = Date.now();
  if (context.tasks.some((item) => item.status === "running" && isStuck(item, checkedAt))) {
    await reclaimStuckTasks(context.project.id, checkedAt);
    context = await loadRunContext(taskId, userId);
    if (!context) throw new TaskRunError("Task not found", 404);
  }
  const { project, tasks } = context;
  const found = tasks.find((item) => item.id === taskId);
  if (!found) throw new TaskRunError("Task not found", 404);
  const task = { ...found, project };
  if (task.status === "running") throw new TaskRunError("Task is already running", 409);
  if (task.status === "awaiting_approval") {
    throw new TaskRunError("Task is awaiting approval", 409);
  }

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
  if (isModel) await reserveModelRun(userId, usageDay, dailyLimit, task.projectId);

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
    if (isModel) await releaseModelRun(userId, usageDay, task.projectId);
    throw new TaskRunError("Task is already running", 409);
  }

  await prisma.agent.updateMany({
    where: { id: task.agentId },
    data: { status: "working" },
  });

  const sourceTasks =
    task.agent.provider === "human"
      ? transitiveDependencies(task.dependsOn, byId).filter((item) => item.status === "done")
      : directDependencies(task.dependsOn, byId);
  const handoffs = sourceTasks.map(toHandoff);

  // "started" and every "handoff" in one INSERT, in the same order as before.
  await emitEvents([
    {
      projectId: task.projectId,
      type: "started",
      message: `${handName(task.agent.name)} started "${task.title}"`,
      taskId: task.id,
      runId,
      payload: { agent: handName(task.agent.name) },
    },
    ...sourceTasks.map((source) => ({
      projectId: task.projectId,
      type: "handoff",
      message: `Handoff: ${handName(source.agent.name)} handed "${source.title}" to ${handName(task.agent.name)}`,
      taskId: task.id,
      fromTaskId: source.id,
      toTaskId: task.id,
      runId,
      payload: {
        fromAgent: handName(source.agent.name),
        toAgent: handName(task.agent.name),
        fromTitle: source.title,
        toTitle: task.title,
      },
    })),
  ]);

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
    await syncAgentStatus(task.agentId, task.agent.provider);
    // The row exactly as the guarded commit above wrote it (no re-read).
    return serializeTask({ ...task, status: "awaiting_approval", output, model: "human", startedAt, completedAt: null });
  }

  const model = modelForProvider(task.agent.provider);
  const system = composeSystemPrompt({ name: handName(task.agent.name), role: task.agent.role });
  // Text the user added from their files (lib/sources.ts) rides along with the brief.
  const sources = await prisma.sourceFile.findMany({
    where: { projectId: task.projectId },
    orderBy: { createdAt: "asc" },
    select: { name: true, text: true },
  });
  const user = composeUserPrompt({
    brief: briefWithSources(task.project.brief, sources),
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
    await releaseModelRun(userId, usageDay, task.projectId);
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
      await emit(task.projectId, "failed", `${handName(task.agent.name)} failed "${task.title}": ${message}`, task.id, {
        runId,
        payload: { error: message },
      });
    }
    await syncAgentStatus(task.agentId, task.agent.provider);
    throw new TaskRunError(message, 502);
  }

  const latencyMs = Date.now() - startedAt.getTime();
  const status = task.requiresApproval ? "awaiting_approval" : "done";
  const completedAt = status === "done" ? new Date() : null;
  const committed = await commitIfOwned(claim, {
    output,
    status,
    model,
    completedAt,
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
  // The agent's model and its status in one write (was: update model, emit, then sync status).
  await syncAgentStatus(task.agentId, task.agent.provider, { model });
  await emit(
    task.projectId,
    status === "done" ? "completed" : "approval_requested",
    status === "done"
      ? `${handName(task.agent.name)} completed "${task.title}"`
      : `Waiting on YOU to approve "${task.title}"`,
    task.id,
    { runId, payload: status === "done" ? { agent: handName(task.agent.name) } : { gate: false } },
  );
  if (status === "done") await openReadyHumanGates(task.projectId, userId, tasks);
  // The row exactly as the guarded commit above wrote it (no re-read).
  return serializeTask({ ...task, status, output, model, startedAt, completedAt });
}

async function openReadyHumanGates(projectId: string, userId: string, known: { id: string; agent: { provider: string } }[]) {
  // Fresh statuses (another run may have finished meanwhile); providers come from the
  // agents already loaded, since a task's agent never changes during a run.
  const provider = new Map(known.map((item) => [item.id, item.agent.provider]));
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: { id: true, status: true, dependsOn: true, agentId: true },
  });
  const humanAgents = new Set(
    (await humanAgentIds(projectId, tasks.filter((item) => !provider.has(item.id)).map((item) => item.agentId))),
  );
  const byId = new Map(tasks.map((item) => [item.id, item]));
  for (const candidate of tasks) {
    const human = provider.has(candidate.id) ? provider.get(candidate.id) === "human" : humanAgents.has(candidate.agentId);
    if (!human) continue;
    if (candidate.status !== "pending") continue;
    if (unmetDependencyIds(candidate.dependsOn, byId).length > 0) continue;
    await runTask(candidate.id, userId);
  }
}

/** Agents (of tasks added after the run loaded its context) that are the human. Usually no query. */
async function humanAgentIds(projectId: string, agentIds: string[]): Promise<string[]> {
  if (agentIds.length === 0) return [];
  const agents = await prisma.agent.findMany({
    where: { projectId, id: { in: [...new Set(agentIds)] }, provider: "human" },
    select: { id: true },
  });
  return agents.map((agent) => agent.id);
}

export async function rerunTask(taskId: string, userId: string, dailyLimit?: number) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { agent: true, project: true },
  });
  if (!task || task.project.userId !== userId) throw new TaskRunError("Task not found", 404);
  await reclaimStuckTasks(task.projectId);
  if (task.status !== "done" && task.status !== "failed") {
    throw new TaskRunError("Only a finished or frayed step can be re-run", 409);
  }

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
  return runTask(task.id, userId, dailyLimit);
}

/**
 * Per-step Intervene: append a structured note into this model step's instructions
 * (same marker as Ask for changes), then re-run it so the packet includes the note.
 * Downstream steps clear like a normal re-run. Pending steps only store the note
 * for the next Run. Human/knot steps are refused — use the knot note there.
 */
export async function steerTask(taskId: string, note: string, userId: string, dailyLimit?: number) {
  const trimmed = note.trim();
  if (!trimmed) throw new TaskRunError("Write a short note first", 400);
  assertMaxLength("Note", trimmed, MAX_NOTE_CHARS);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { agent: true, project: true },
  });
  if (!task || task.project.userId !== userId) throw new TaskRunError("Task not found", 404);
  await reclaimStuckTasks(task.projectId);
  if (task.agent.provider === "human") {
    throw new TaskRunError("At the knot, add your note and Ask for changes — Intervene steers a model step.", 409);
  }
  if (task.status === "running") {
    throw new TaskRunError("Wait until this step finishes, then Intervene again.", 409);
  }
  if (task.status === "awaiting_approval") {
    throw new TaskRunError("Open the knot to judge this step.", 409);
  }

  const withNote = appendChangeNote(task.instructions, trimmed);
  await prisma.task.update({ where: { id: task.id }, data: { instructions: withNote } });
  await emit(
    task.projectId,
    "note",
    `You steered "${task.title}": ${trimmed}`,
    task.id,
    { payload: { kind: "step_steer", note: trimmed } },
  );

  // Never spun yet: the note waits for the next Run.
  if (task.status === "pending") {
    return serializeTask(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
  }

  // done / failed: clear this step and downstream, then run it with the note in the packet.
  return rerunTask(task.id, userId, dailyLimit);
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
