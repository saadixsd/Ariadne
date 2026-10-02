import { attributionFor, attributionLine } from "@/lib/attribution";
import { hideModelIds } from "@/lib/model-label";
import { providerLabel, taskNumber } from "@/lib/task-rules";
import type { ActivityEventDTO, AgentDTO, ProjectDTO, TaskDTO } from "@/lib/types";

export type LineageApproval = {
  approver: string | null;
  message: string;
  at: string;
};

/** A change you asked for at a knot, carried forward into the steps it sent back. */
export type LineageNote = {
  note: string;
  at: string;
  /** The knot where you wrote it. */
  gateTitle: string | null;
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
  /** Your change notes that reached this step (newest last). */
  notes: LineageNote[];
  /** "Made by GPT · Daedalus — Reviewed by Claude · Odysseus", once the step has output. */
  attribution: string | null;
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
  // Structured column, not message parsing. Events written before the payload
  // column existed (and not backfilled) simply show the message instead.
  const approver = approved && typeof event.payload?.approver === "string" ? event.payload.approver : null;
  return {
    approver,
    message: hideModelIds(event.message),
    at: event.createdAt,
  };
}

/**
 * Change notes that concern a task: written at its own knot, or sent back to it as
 * a root to redo. Read from the structured payload, never from message text.
 */
export function changeNotesFor(taskId: string, project: Pick<ProjectDTO, "events" | "tasks">): LineageNote[] {
  const notes: LineageNote[] = [];
  for (const event of project.events) {
    if (event.type !== "note" || event.payload?.decision !== "changes_requested") continue;
    const note = typeof event.payload.note === "string" ? event.payload.note : null;
    if (!note) continue;
    const roots = Array.isArray(event.payload.rootTaskIds) ? event.payload.rootTaskIds : [];
    if (event.taskId !== taskId && !roots.includes(taskId)) continue;
    const gate = project.tasks.find((task) => task.id === event.taskId);
    notes.push({ note, at: event.createdAt, gateTitle: gate?.title ?? null });
  }
  return notes.sort((a, b) => a.at.localeCompare(b.at));
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
        notes: changeNotesFor(task.id, project),
        attribution: agent?.provider !== "human" && (task.output || task.status === "done") ? attributionLine(attributionFor(task, project)) : null,
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
