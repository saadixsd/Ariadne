import { parseDepends } from "@/lib/depends";
import type { ActivityEventDTO, AgentDTO, ProjectDTO, TaskDTO, TaskRunDTO } from "@/lib/types";

const AGENT_RANK: Record<string, number> = { Scout: 0, Maker: 1, You: 2 };

type AgentRecord = {
  id: string;
  projectId: string;
  name: string;
  provider: string;
  model: string;
  role: string;
  status: string;
};

type TaskRecord = {
  id: string;
  projectId: string;
  agentId: string;
  title: string;
  instructions: string;
  status: string;
  dependsOn: string;
  requiresApproval: boolean;
  output: string | null;
  model: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

type EventRecord = {
  id: string;
  projectId: string;
  type: string;
  message: string;
  taskId: string | null;
  fromTaskId?: string | null;
  toTaskId?: string | null;
  runId?: string | null;
  payload?: string | null;
  createdAt: Date;
};

type TaskRunRecord = Omit<TaskRunDTO, "startedAt" | "completedAt" | "createdAt"> & {
  projectId: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

type ProjectRecord = {
  id: string;
  name: string;
  brief: string;
  template: string;
  createdAt: Date;
  agents: AgentRecord[];
  tasks: TaskRecord[];
  events: EventRecord[];
};

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

export function serializeAgent(agent: AgentRecord): AgentDTO {
  return {
    id: agent.id,
    projectId: agent.projectId,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    role: agent.role,
    status: agent.status,
  };
}

export function serializeTask(task: TaskRecord): TaskDTO {
  return {
    id: task.id,
    projectId: task.projectId,
    agentId: task.agentId,
    title: task.title,
    instructions: task.instructions,
    status: task.status,
    dependsOn: parseDepends(task.dependsOn),
    requiresApproval: task.requiresApproval,
    output: task.output,
    model: task.model,
    startedAt: iso(task.startedAt),
    completedAt: iso(task.completedAt),
    createdAt: iso(task.createdAt) ?? new Date(0).toISOString(),
  };
}

export function serializeEvent(event: EventRecord): ActivityEventDTO {
  return {
    id: event.id,
    projectId: event.projectId,
    type: event.type,
    message: event.message,
    taskId: event.taskId,
    fromTaskId: event.fromTaskId ?? null,
    toTaskId: event.toTaskId ?? null,
    runId: event.runId ?? null,
    payload: parsePayload(event.payload),
    createdAt: iso(event.createdAt) ?? new Date(0).toISOString(),
  };
}

function parsePayload(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function serializeTaskRun(run: TaskRunRecord): TaskRunDTO {
  return {
    id: run.id,
    taskId: run.taskId,
    attempt: run.attempt,
    outcome: run.outcome,
    provider: run.provider,
    model: run.model,
    systemPrompt: run.systemPrompt,
    prompt: run.prompt,
    output: run.output,
    error: run.error,
    latencyMs: run.latencyMs,
    tries: run.tries,
    startedAt: iso(run.startedAt),
    completedAt: iso(run.completedAt),
    createdAt: iso(run.createdAt) ?? new Date(0).toISOString(),
  };
}

export function serializeProject(project: ProjectRecord): ProjectDTO {
  const agents = [...project.agents].sort((a, b) => {
    const rank = (AGENT_RANK[a.name] ?? 9) - (AGENT_RANK[b.name] ?? 9);
    return rank !== 0 ? rank : a.name.localeCompare(b.name);
  });

  return {
    id: project.id,
    name: project.name,
    brief: project.brief,
    template: project.template,
    createdAt: iso(project.createdAt) ?? new Date(0).toISOString(),
    agents: agents.map(serializeAgent),
    tasks: project.tasks.map(serializeTask),
    events: project.events.map(serializeEvent),
  };
}
