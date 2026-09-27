import { providerLabel, taskNumber } from "@/lib/task-rules";
import type { ActivityEventDTO, AgentDTO, ProjectDTO, TaskDTO } from "@/lib/types";

export type LineageApproval = {
  approver: string | null;
  message: string;
  at: string;
};

export type LineageBriefNode = {
  kind: "brief";
  id: "brief";
  title: string;
  body: string;
};

export type LineageWorkNode = {
  kind: "task" | "decision";
  id: string;
  number: number;
  title: string;
  badge: string;
  agentName: string;
  status: string;
  timestamp: string | null;
  duration: string | null;
  body: string | null;
  approval: LineageApproval | null;
  selected: boolean;
};

export type LineageNode = LineageBriefNode | LineageWorkNode;

export type LineageStep = {
  handoffLabels: string[];
  node: LineageNode;
};

function agentFor(task: TaskDTO, agents: AgentDTO[]): AgentDTO | undefined {
  return agents.find((agent) => agent.id === task.agentId);
}

function agentName(task: TaskDTO, agents: AgentDTO[]): string {
  return agentFor(task, agents)?.name ?? "Unassigned";
}

export function orderedLineageTasks(taskId: string, tasks: TaskDTO[]): TaskDTO[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const selected = byId.get(taskId);
  if (!selected) return [];

  const result: TaskDTO[] = [];
  const seen = new Set<string>();

  function visit(id: string) {
    if (seen.has(id)) return;
    const task = byId.get(id);
    if (!task) return;
    seen.add(id);
    for (const parentId of task.dependsOn) visit(parentId);
    result.push(task);
  }

  for (const parentId of selected.dependsOn) visit(parentId);
  const ancestors = result.filter((task) => task.id !== selected.id);
  return [...ancestors, selected];
}

function possessive(name: string): string {
  if (name.toLowerCase() === "you") return "Your";
  return `${name}'s`;
}

export function handoffConnector(fromName: string, toName: string): string {
  return `${possessive(fromName)} output → ${possessive(toName)} prompt`;
}

function durationLabel(task: TaskDTO): string | null {
  if (!task.startedAt || !task.completedAt) return null;
  const start = new Date(task.startedAt).getTime();
  const end = new Date(task.completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function latestEvent(
  events: ActivityEventDTO[],
  taskId: string,
  type: string,
): ActivityEventDTO | null {
  let latest: ActivityEventDTO | null = null;
  for (const event of events) {
    if (event.taskId !== taskId || event.type !== type) continue;
    if (!latest || event.createdAt > latest.createdAt) latest = event;
  }
  return latest;
}

function approvalFromEvents(taskId: string, events: ActivityEventDTO[]): LineageApproval | null {
  const approved = latestEvent(events, taskId, "approved");
  const requested = latestEvent(events, taskId, "approval_requested");
  const event = approved ?? requested;
  if (!event) return null;
  const match = approved ? event.message.match(/^(.+?) approved "/) : null;
  return {
    approver: match?.[1] ?? null,
    message: event.message,
    at: event.createdAt,
  };
}

function isDecision(task: TaskDTO, agent: AgentDTO | undefined, events: ActivityEventDTO[]): boolean {
  if (agent?.provider === "human") return true;
  if (task.status === "awaiting_approval") return true;
  return events.some(
    (event) =>
      event.taskId === task.id &&
      (event.type === "approved" || event.type === "approval_requested"),
  );
}

function incomingLabels(task: TaskDTO, prior: TaskDTO[], agents: AgentDTO[]): string[] {
  const target = agentName(task, agents);
  return prior
    .filter((source) => task.dependsOn.includes(source.id))
    .map((source) => handoffConnector(agentName(source, agents), target));
}

export function buildLineage(project: ProjectDTO, taskId: string): LineageStep[] | null {
  const ordered = orderedLineageTasks(taskId, project.tasks);
  if (ordered.length === 0) return null;

  const steps: LineageStep[] = [
    {
      handoffLabels: [],
      node: {
        kind: "brief",
        id: "brief",
        title: "Project brief",
        body: project.brief,
      },
    },
  ];

  ordered.forEach((task, index) => {
    const agent = agentFor(task, project.agents);
    const approval = approvalFromEvents(task.id, project.events);
    const decision = isDecision(task, agent, project.events);
    const prior = ordered.slice(0, index);
    steps.push({
      handoffLabels: incomingLabels(task, prior, project.agents),
      node: {
        kind: decision ? "decision" : "task",
        id: task.id,
        number: taskNumber(task.id, project.tasks),
        title: task.title,
        badge: `${agent?.name ?? "Unassigned"} · ${providerLabel(agent?.provider ?? "")}`,
        agentName: agent?.name ?? "Unassigned",
        status: task.status,
        timestamp: task.completedAt ?? task.startedAt,
        duration: durationLabel(task),
        body: task.output,
        approval,
        selected: task.id === taskId,
      },
    });
  });

  return steps;
}

export function excerptText(value: string, limit = 220): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}
