import { handName } from "@/lib/hands";
import type { ActivityEventDTO, AgentDTO, TaskDTO } from "@/lib/types";

export function previewChips(output: string, limit = 3): string[] {
  const lines = output
    .split(/\n+/)
    .map((line) => line.replace(/^[#>*\-\d.)\s]+/, "").trim())
    .filter((line) => line.length > 0);
  const parts = lines.length >= 2 ? lines : output.split(/(?<=[.!?])\s+/).map((part) => part.trim());
  return parts
    .filter((part) => part.length > 0)
    .slice(0, limit)
    .map((part) => (part.length > 90 ? `${part.slice(0, 87)}…` : part));
}

export type HandoffDetails = {
  fromTaskId: string;
  toTaskId: string | null;
  from: string;
  title: string;
  to: string;
};

type HandoffEvent = Pick<ActivityEventDTO, "type" | "taskId" | "fromTaskId" | "toTaskId" | "payload">;
type HandoffTask = Pick<TaskDTO, "id" | "title" | "agentId">;
type HandoffAgent = Pick<AgentDTO, "id" | "name">;

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads a handoff from the event's structured columns (fromTaskId / toTaskId and
 * the JSON payload). The human-readable message is never parsed. Names come from
 * the payload snapshot, falling back to the current task/agent rows. Returns null
 * for events without structure (callers show the plain message, as before).
 */
export function handoffFromEvent(
  event: HandoffEvent,
  tasks: readonly HandoffTask[],
  agents: readonly HandoffAgent[] = [],
): HandoffDetails | null {
  if (event.type !== "handoff" || !event.fromTaskId) return null;
  const source = tasks.find((task) => task.id === event.fromTaskId);
  const toTaskId = event.toTaskId ?? event.taskId;
  const target = toTaskId ? tasks.find((task) => task.id === toTaskId) : undefined;
  const agentName = (task: HandoffTask | undefined) =>
    task ? agents.find((agent) => agent.id === task.agentId)?.name ?? null : null;
  const payload = event.payload ?? {};
  const from = text(payload.fromAgent) ?? agentName(source);
  const to = text(payload.toAgent) ?? agentName(target);
  const title = text(payload.fromTitle) ?? source?.title ?? null;
  if (!from || !to || !title) return null;
  return { fromTaskId: event.fromTaskId, toTaskId: toTaskId ?? null, from: handName(from), title, to: handName(to) };
}
