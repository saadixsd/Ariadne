/*
  Versions of one step, read from its immutable run history (TaskRun rows from
  GET /api/tasks/:id/runs). A version is a run that produced output: a successful
  attempt, or a `legacy` row preserved from before run history existed. Frayed,
  recovered and discarded attempts are not versions. Nothing here deletes or writes.
*/
import type { ProjectDTO, TaskDTO, TaskRunDTO } from "@/lib/types";

export type Version = { label: string; number: number; run: TaskRunDTO };

export function versionsOf(runs: TaskRunDTO[]): Version[] {
  return runs
    .filter((run) => (run.outcome === "succeeded" || run.outcome === "legacy") && !!run.output?.trim())
    .sort((a, b) => a.attempt - b.attempt)
    .map((run, index) => ({ label: `v${index + 1}`, number: index + 1, run }));
}

function at(run: TaskRunDTO): number {
  const value = Date.parse(run.completedAt ?? run.createdAt);
  return Number.isNaN(value) ? 0 : value;
}

function startOf(run: TaskRunDTO): number {
  const value = Date.parse(run.startedAt ?? run.createdAt);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

/**
 * The review that sat between two versions: the newest review version finished
 * before `after` started (and not before `before` was made). That is the critique
 * the human read at the knot before sending the work back.
 */
export function critiqueBetween(reviews: Version[], before: Version, after: Version): Version | null {
  const from = at(before.run);
  const until = startOf(after.run);
  const between = reviews.filter((review) => at(review.run) >= from && at(review.run) <= until);
  return between.at(-1) ?? null;
}

/**
 * Cheap hint, from data the board already has, that a step was spun more than once
 * (so a v1 → v2 is worth fetching): two completions, a rerun that cleared it, or a
 * change note that sent it back.
 */
export function mayHaveEarlierVersion(task: TaskDTO, project: Pick<ProjectDTO, "events">): boolean {
  if (!task.output) return false;
  let finished = 0;
  for (const event of project.events) {
    if (event.taskId === task.id && (event.type === "completed" || event.type === "approval_requested")) finished += 1;
    const payload = event.payload;
    if (!payload) continue;
    const cleared = Array.isArray(payload.taskIds) ? payload.taskIds : Array.isArray(payload.clearedTaskIds) ? payload.clearedTaskIds : [];
    if (cleared.includes(task.id)) return true;
  }
  return finished >= 2;
}
