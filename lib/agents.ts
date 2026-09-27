import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { dependentTasks, directDependencies, transitiveDependencies, unmetDependencyIds } from "@/lib/depends";
import { safeErrorMessage, TaskRunError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { consumeModelRun } from "@/lib/usage";
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

async function syncAgentStatus(agentId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return;
  const tasks = await prisma.task.findMany({ where: { agentId } });
  const working = tasks.some(
    (task) =>
      task.status === "running" ||
      (agent.provider === "human" && task.status === "awaiting_approval"),
  );
  const status = working
    ? "working"
    : tasks.length > 0 && tasks.every((task) => task.status === "done")
      ? "done"
      : "idle";
  if (agent.status !== status) {
    await prisma.agent.update({ where: { id: agentId }, data: { status } });
  }
}

async function emit(
  projectId: string,
  type: string,
  message: string,
  taskId: string,
) {
  await prisma.activityEvent.create({
    data: { projectId, type, message, taskId },
  });
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
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

async function withOneRetry(fn: () => Promise<string>) {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

async function failTask(taskId: string, agentId: string, projectId: string, agentName: string, title: string, error: unknown) {
  const message = safeErrorMessage(error);
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "failed", model: null },
  });
  await emit(projectId, "failed", `${agentName} failed "${title}": ${message}`, taskId);
  await syncAgentStatus(agentId);
  return message;
}

export async function runTask(taskId: string, userId: string) {
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

  const claimed = await prisma.task.updateMany({
    where: { id: task.id, status: { notIn: ["running", "awaiting_approval"] } },
    data: {
      status: "running",
      startedAt: new Date(),
      output: null,
      completedAt: null,
      model: null,
    },
  });
  if (claimed.count !== 1) throw new TaskRunError("Task is already running", 409);

  if (task.agent.provider !== "human") {
    try {
      await consumeModelRun(userId);
    } catch (error) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "pending", startedAt: null, output: null, model: null },
      });
      await syncAgentStatus(task.agentId);
      throw error;
    }
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
    );
  }

  if (task.agent.provider === "human") {
    const output = packageDependencyOutputs(handoffs);
    await prisma.task.update({
      where: { id: task.id },
      data: { output, status: "awaiting_approval", model: "human" },
    });
    await emit(
      task.projectId,
      "approval_requested",
      `Waiting on YOU to approve "${task.title}"`,
      task.id,
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

  let output: string;
  try {
    assertConfigured(task.agent.provider, model);
    output = await withOneRetry(() => callProvider(task.agent.provider, model, system, user));
  } catch (error) {
    const message = await failTask(
      task.id,
      task.agentId,
      task.projectId,
      task.agent.name,
      task.title,
      error,
    );
    throw new TaskRunError(message, 502);
  }

  const status = task.requiresApproval ? "awaiting_approval" : "done";
  await prisma.task.update({
    where: { id: task.id },
    data: {
      output,
      status,
      model,
      completedAt: status === "done" ? new Date() : null,
    },
  });
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
  if (task.status !== "done") throw new TaskRunError("Only a finished task can be re-run", 409);

  const tasks = await prisma.task.findMany({ where: { projectId: task.projectId } });
  const downstream = dependentTasks(task.id, tasks);
  const wipe = [task, ...downstream];
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
  if (task.status !== "awaiting_approval") {
    throw new TaskRunError("Task is not awaiting approval", 409);
  }

  if (approved) {
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "done", completedAt: new Date() },
    });
    await emit(task.projectId, "approved", `You approved "${task.title}"`, task.id);
  } else {
    const trimmed = note?.trim() ?? "";
    if (!trimmed) throw new TaskRunError("A note is required to request changes", 400);
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "pending",
        instructions: `${task.instructions}\n\nHuman requested changes: ${trimmed}`,
        output: null,
        startedAt: null,
        completedAt: null,
        model: null,
      },
    });
    await emit(
      task.projectId,
      "note",
      `You requested changes on "${task.title}": ${trimmed}`,
      task.id,
    );
  }

  await syncAgentStatus(task.agentId);
  return serializeTask(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
}
