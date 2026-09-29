import { displayModel } from "@/lib/model-label";
import { canRunTask, dependenciesMet } from "@/lib/task-rules";
import type { ActivityEventDTO, ProjectDTO, TaskDTO } from "@/lib/types";

export type TreeNodeKind = "root" | "branch" | "gate" | "pruned" | "output";
export type TreeStatus = "active" | "done" | "locked" | "pruned" | "waiting";
export type EdgeKind = "thread" | "plain" | "dead";

export type TreeNode = {
  id: string;
  kind: TreeNodeKind;
  label: string;
  role?: string;
  model?: string;
  status?: TreeStatus;
  since?: string | null;
  elapsedSec?: number;
  note?: string;
  taskId?: string;
  sourceTaskId?: string;
  taskStatus?: string;
  runnable?: boolean;
};

export type TreeEdge = {
  from: string;
  to: string;
  kind: EdgeKind;
};

export type TreeWorkflow = {
  nodes: TreeNode[];
  edges: TreeEdge[];
};

const REMOVED = new Set(["cancelled", "canceled", "pruned", "removed"]);

function durationSec(task: TaskDTO): number | undefined {
  if (!task.startedAt || !task.completedAt) return undefined;
  const start = Date.parse(task.startedAt);
  const end = Date.parse(task.completedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;
  return Math.max(0, Math.round((end - start) / 1000));
}

function waitingSince(task: TaskDTO, events: ActivityEventDTO[]): string | null {
  const requested = events.find((event) => event.type === "approval_requested" && event.taskId === task.id);
  return requested?.createdAt ?? task.startedAt;
}

function nodeStatus(task: TaskDTO, tasks: TaskDTO[]): TreeStatus | undefined {
  if (REMOVED.has(task.status)) return "pruned";
  if (task.status === "running") return "active";
  if (task.status === "done") return "done";
  if (task.status === "awaiting_approval") return "waiting";
  if (task.status === "pending" && !dependenciesMet(task, tasks)) return "locked";
  return undefined;
}

function isGate(task: TaskDTO, provider: string | undefined): boolean {
  return provider === "human" || task.requiresApproval;
}

function moved(status: string): boolean {
  return status === "running" || status === "done" || status === "awaiting_approval" || status === "failed";
}

function linkKind(fromStatus: string | undefined, pruned: boolean, thread: boolean): EdgeKind {
  if (pruned || (fromStatus !== undefined && REMOVED.has(fromStatus))) return "dead";
  return thread ? "thread" : "plain";
}

export function workflowTree(project: ProjectDTO): TreeWorkflow {
  const tasks = project.tasks;
  const taskIds = new Set(tasks.map((task) => task.id));
  const agents = new Map(project.agents.map((agent) => [agent.id, agent]));
  const nodes: TreeNode[] = [
    {
      id: "root",
      kind: "root",
      label: project.brief.trim() || project.name,
      note: project.name,
    },
  ];

  for (const task of tasks) {
    const agent = agents.get(task.agentId);
    const status = nodeStatus(task, tasks);
    const gate = isGate(task, agent?.provider);
    const pruned = status === "pruned";
    const waiting = task.status === "awaiting_approval";
    const active = task.status === "running";
    let note: string | undefined;
    if (pruned) note = "pruned";
    else if (status === "locked") note = "Locked until the tasks it needs are finished.";
    else if (waiting) note = "Nothing moves until you decide.";
    else if (task.status === "failed") note = "This run failed.";

    nodes.push({
      id: task.id,
      kind: pruned ? "pruned" : gate ? "gate" : "branch",
      label: task.title,
      role: agent?.provider === "human" ? "You" : agent?.name,
      model: displayModel(task.model ?? agent?.model, agent?.provider) ?? undefined,
      status,
      since: active ? task.startedAt : waiting ? waitingSince(task, project.events) : null,
      elapsedSec: task.status === "done" ? durationSec(task) : undefined,
      note,
      taskId: task.id,
      taskStatus: task.status,
      runnable: canRunTask(task, tasks),
    });
  }

  const finished = tasks
    .filter((task) => task.status === "done" && task.output)
    .sort((a, b) => Date.parse(b.completedAt ?? b.createdAt) - Date.parse(a.completedAt ?? a.createdAt));
  const latest = finished[0];
  const outputReady = Boolean(latest);
  nodes.push({
    id: "output",
    kind: "output",
    label: latest?.title ?? "No output yet",
    status: outputReady ? "done" : "locked",
    note: outputReady ? "artifact" : "no output yet",
    sourceTaskId: latest?.id,
  });

  const edges: TreeEdge[] = [];
  const sources = tasks.filter((task) => task.dependsOn.every((id) => !taskIds.has(id)));
  for (const task of sources) {
    const pruned = REMOVED.has(task.status);
    edges.push({
      from: "root",
      to: task.id,
      kind: linkKind(undefined, pruned, moved(task.status)),
    });
  }

  for (const task of tasks) {
    for (const parentId of task.dependsOn) {
      if (!taskIds.has(parentId)) continue;
      const parent = tasks.find((item) => item.id === parentId);
      const pruned = REMOVED.has(task.status) || (parent ? REMOVED.has(parent.status) : false);
      edges.push({
        from: parentId,
        to: task.id,
        kind: linkKind(parent?.status, pruned, parent?.status === "done"),
      });
    }
  }

  const sinks = tasks.filter((task) => !tasks.some((other) => other.dependsOn.includes(task.id)));
  const tails = sinks.length > 0 ? sinks : sources;
  for (const task of tails) {
    const pruned = REMOVED.has(task.status);
    edges.push({
      from: task.id,
      to: "output",
      kind: linkKind(task.status, pruned, task.status === "done" && outputReady),
    });
  }
  if (tasks.length === 0) {
    edges.push({ from: "root", to: "output", kind: "plain" });
  }

  return { nodes, edges };
}
