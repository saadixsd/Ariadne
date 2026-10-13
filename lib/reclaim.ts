import "server-only";

import { syncAgentStatus } from "@/lib/agent-status";
import { STUCK_RUN_TIMEOUT_MS } from "@/lib/limits";
import { getPrisma } from "@/lib/prisma";
import { emitEvent, recordRun } from "@/lib/run-history";
import { releaseModelRun, utcDay } from "@/lib/usage";

type RunningTask = {
  id: string;
  startedAt: Date | null;
};

/**
 * Is this `running` task dead? Today runs are synchronous inside the HTTP request
 * (max ~120s), so age alone is a safe signal.
 *
 * LEASE HOOK: a future async engine (not designed yet; parked until usage needs it)
 * would give engine runs a `TaskRun.leaseExpiresAt` and could legitimately run longer
 * than 5 minutes. When that lands, this is the single place to change: for a task with
 * an engine run, return `leaseExpiresAt < now` instead of checking age (and let the
 * DO lease sweeper own reclaim for those runs). Keep the age rule only for legacy
 * synchronous runs.
 */
export function isStuck(task: RunningTask, now = Date.now()): boolean {
  if (!task.startedAt) return true;
  return now - task.startedAt.getTime() > STUCK_RUN_TIMEOUT_MS;
}

/**
 * Lazy recovery, no cron: called on every task read path (project/tree load,
 * event polling, run/rerun/decide). A task stuck in `running` past the timeout is
 * treated as a failed attempt:
 *  - status goes back to `pending` so Run works again (upstream outputs untouched),
 *  - its quota reservation is released (reclaimed runs never count),
 *  - a `reclaimed` TaskRun row and a `failed` event record what happened.
 * The status flip is guarded on (status, startedAt age), so two concurrent readers
 * cannot both reclaim, and a run that finishes meanwhile is not clobbered.
 */
export async function reclaimStuckTasks(projectId: string, now = Date.now()) {
  const prisma = await getPrisma();
  const candidates = await prisma.task.findMany({
    where: { projectId, status: "running" },
    include: { agent: true, project: { select: { userId: true } } },
  });
  let reclaimed = 0;
  for (const task of candidates) {
    if (!isStuck(task, now)) continue;
    // Guard on "still running and still old" rather than startedAt equality: a
    // concurrent reader that already reclaimed it, or a fresh claim (new startedAt),
    // both make this a no-op.
    const cutoff = new Date(now - STUCK_RUN_TIMEOUT_MS);
    const flipped = await prisma.task.updateMany({
      where: {
        id: task.id,
        status: "running",
        OR: [{ startedAt: null }, { startedAt: { lt: cutoff } }],
      },
      data: { status: "pending", startedAt: null, completedAt: null, output: null, model: null },
    });
    if (flipped.count !== 1) continue;
    reclaimed++;

    const isModel = task.agent.provider !== "human";
    // Model runs reserve one quota unit (on the UTC day of startedAt) before they
    // claim the task, so a task stuck in `running` always holds a reservation.
    if (isModel && task.project.userId && task.startedAt) {
      await releaseModelRun(task.project.userId, utcDay(task.startedAt), task.projectId);
    }

    // Reuse the dead attempt's run id (carried on its "started" event) so the
    // started/handoff events and the reclaimed TaskRun row line up.
    const started = await prisma.activityEvent.findFirst({
      where: {
        taskId: task.id,
        type: "started",
        runId: { not: null },
        ...(task.startedAt ? { createdAt: { gte: task.startedAt } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { runId: true },
    });
    const minutes = Math.round(STUCK_RUN_TIMEOUT_MS / 60000);
    const error = `Run stopped responding (no result after ${minutes} minutes; the request was likely cut off by a disconnect or deploy).`;
    const reuseId =
      started?.runId && !(await prisma.taskRun.findUnique({ where: { id: started.runId }, select: { id: true } }))
        ? started.runId
        : undefined;
    const run = await recordRun({
      id: reuseId,
      taskId: task.id,
      projectId: task.projectId,
      outcome: "reclaimed",
      provider: task.agent.provider,
      model: null,
      error,
      startedAt: task.startedAt,
      completedAt: new Date(now),
    });

    await emitEvent(
      task.projectId,
      "failed",
      `Recovered "${task.title}": ${error} It is ready to run again.${isModel ? " This attempt did not use a daily run." : ""}`,
      task.id,
      { runId: run.id, payload: { reason: "stuck_run_reclaimed", timeoutMs: STUCK_RUN_TIMEOUT_MS } },
    );

    await syncAgentStatus(task.agentId);
  }
  return reclaimed;
}
