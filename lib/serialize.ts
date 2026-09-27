import { parseDepends } from "@/lib/depends";
import type { ActivityEventDTO, AgentDTO, ProjectDTO, TaskDTO } from "@/lib/types";

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
  createdAt: Date;
};

type ProjectRecord = {
  id: string;
  name: string;
  brief: string;
  createdAt: Date;
  agents: AgentRecord[];
  tasks: TaskRecord[];
  events: EventRecord[];
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
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
    createdAt: task.createdAt.toISOString(),
  };
}

export function serializeEvent(event: EventRecord): ActivityEventDTO {
  return {
    id: event.id,
    projectId: event.projectId,
    type: event.type,
    message: event.message,
    taskId: event.taskId,
    createdAt: event.createdAt.toISOString(),
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
    createdAt: project.createdAt.toISOString(),
    agents: agents.map(serializeAgent),
    tasks: project.tasks.map(serializeTask),
    events: project.events.map(serializeEvent),
  };
}
