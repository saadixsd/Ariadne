import "server-only";

import { TaskRunError } from "@/lib/errors";
import { DAILY_MODEL_RUNS, MAX_RERUNS_PER_WORKFLOW, MAX_RUNS_PER_WORKFLOW, SITE_DAILY_MODEL_RUNS, WORKFLOWS_PER_DAY, dailyRunLimit } from "@/lib/limits";
import { getPrisma } from "@/lib/prisma";

export { DAILY_MODEL_RUNS, SITE_DAILY_MODEL_RUNS, dailyRunLimit };

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function modelRunsToday(userId: string) {
  const prisma = await getPrisma();
  const row = await prisma.usageDay.findUnique({
    where: { userId_day: { userId, day: utcDay() } },
  });
  return row?.runs ?? 0;
}

/**
 * Atomically reserves one of the user's own model runs for `day`. The check and the increment are a
 * single conditional UPDATE (`runs < limit`), so concurrent runs cannot overshoot
 * the daily quota. A reservation is released again with `releaseModelRun` when
 * the run fails, is discarded, or is reclaimed as stuck, so only successful runs
 * end up counted.
 */
async function reserveUserRun(userId: string, day: string, limit: number) {
  const prisma = await getPrisma();
  const tryReserve = async () =>
    (
      await prisma.usageDay.updateMany({
        where: { userId, day, runs: { lt: limit } },
        data: { runs: { increment: 1 } },
      })
    ).count === 1;
  // Usual case: today's row exists and has room, one conditional UPDATE.
  if (await tryReserve()) return;
  // No row yet (first run of the day) or the limit is reached. Make sure today's row
  // exists without a transaction (Prisma's upsert may open one, and neither D1 nor the
  // local SQLite adapter handles concurrent ones), then try the same conditional UPDATE once more.
  const existing = await prisma.usageDay.findUnique({ where: { userId_day: { userId, day } }, select: { id: true } });
  if (!existing) {
    try {
      await prisma.usageDay.create({ data: { userId, day, runs: 0 } });
    } catch (error) {
      // Lost the insert race to a concurrent first run of the day: fine if the row exists now.
      const now = await prisma.usageDay.findUnique({ where: { userId_day: { userId, day } }, select: { id: true } });
      if (!now) throw error;
    }
  }
  if (!(await tryReserve())) {
    throw new TaskRunError(
      limit < DAILY_MODEL_RUNS
        ? `Your first day includes ${limit} model runs, and they are used up. From 24 hours after you signed up you get ${DAILY_MODEL_RUNS} a day. Nothing was sent to the models.`
        : `Daily limit of ${limit} model runs is used up. Nothing was sent to the models.`,
      429,
      { limit },
    );
  }
}

/**
 * Reserves one model run for `userId`: first the per-account quota (`reserveUserRun`,
 * 429 when used up; `limit` is the account's cap from lib/limits.ts dailyRunLimit, which is
 * lower during a new account's trial), then the site-wide ceiling. The site check reads the day's total
 * AFTER this reservation; if it is over SITE_DAILY_MODEL_RUNS the reservation is given
 * back and the run is refused with a 503. Concurrent runs at the edge can only refuse
 * each other (each sees the other's reservation), never push the total past the ceiling.
 * Like the per-account quota, a failed, discarded or reclaimed run releases its unit.
 */
export async function reserveModelRun(userId: string, day = utcDay(), limit = DAILY_MODEL_RUNS, projectId?: string) {
  if (projectId) {
    // Workflow quota: the account limit is workflows per day, not runs. UsageDay still
    // counts every run (no per-account cap on it here) for the site ceiling and metrics.
    await reserveWorkflowRun(userId, projectId, day);
    try {
      await reserveUserRun(userId, day, Number.MAX_SAFE_INTEGER);
    } catch (error) {
      await releaseWorkflowRun(projectId);
      throw error;
    }
  } else {
    await reserveUserRun(userId, day, Math.min(limit, DAILY_MODEL_RUNS));
  }
  const prisma = await getPrisma();
  const total = await prisma.usageDay.aggregate({ where: { day }, _sum: { runs: true } });
  if ((total._sum.runs ?? 0) > SITE_DAILY_MODEL_RUNS) {
    await releaseModelRun(userId, day, projectId);
    throw new TaskRunError(
      `Ariadne has spun all ${SITE_DAILY_MODEL_RUNS} runs it makes in a day across every account, so nothing was sent to the models.`,
      503,
      { scope: "site", limit: SITE_DAILY_MODEL_RUNS, retryAfterSeconds: secondsUntilNextUtcDay() },
    );
  }
}

function nextUtcDay(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

/** "00:00 UTC (in 5 h 20 min)": when the daily project count resets. */
function resetLabel(now = Date.now()) {
  const mins = Math.max(1, Math.ceil((nextUtcDay(now).getTime() - now) / 60_000));
  const h = Math.floor(mins / 60);
  return `00:00 UTC (in ${h ? `${h} h ` : ""}${mins % 60} min)`;
}

function secondsUntilNextUtcDay(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now) / 1000));
}

/** Gives back a reservation made by `reserveModelRun` on the same UTC day. Never goes below 0. */
export async function releaseModelRun(userId: string, day: string, projectId?: string) {
  const prisma = await getPrisma();
  if (projectId) await releaseWorkflowRun(projectId);
  await prisma.usageDay.updateMany({
    where: { userId, day, runs: { gt: 0 } },
    data: { runs: { decrement: 1 } },
  });
}

/** Workflows this account started on `day` (UTC). */
export async function workflowsStarted(userId: string, day = utcDay()) {
  const prisma = await getPrisma();
  return prisma.workflow.count({ where: { userId, day } });
}

export async function workflowsLeft(userId: string, day = utcDay()) {
  return Math.max(0, WORKFLOWS_PER_DAY - (await workflowsStarted(userId, day)));
}

/**
 * One model run inside the project's open workflow. With no open workflow, a new one is
 * started, which counts against WORKFLOWS_PER_DAY. Runs inside a workflow are free up to
 * MAX_RUNS_PER_WORKFLOW. Check-and-increment is one conditional UPDATE, as for UsageDay.
 * Two first runs racing on one project could each open a workflow; the second sees the
 * first on its next run (findFirst picks the oldest open one), so at worst one extra counts.
 */
async function reserveWorkflowRun(userId: string, projectId: string, day: string) {
  const prisma = await getPrisma();
  let open = await prisma.workflow.findFirst({ where: { projectId, status: "open" }, orderBy: { createdAt: "asc" } });
  if (!open) {
    if ((await workflowsStarted(userId, day)) >= WORKFLOWS_PER_DAY) {
      throw new TaskRunError(
        `You have used today's ${WORKFLOWS_PER_DAY === 1 ? "project" : `${WORKFLOWS_PER_DAY} projects`}. You can start a new one from ${resetLabel()}. Steps on a project you already started still run, and nothing was sent to the models.`,
        429,
        { limit: WORKFLOWS_PER_DAY, scope: "workflows", retryAfterSeconds: secondsUntilNextUtcDay(), resetsAt: nextUtcDay().toISOString() },
      );
    }
    open = await prisma.workflow.create({ data: { userId, projectId, day, runs: 0 } });
  }
  const bumped = await prisma.workflow.updateMany({
    where: { id: open.id, status: "open", runs: { lt: MAX_RUNS_PER_WORKFLOW } },
    data: { runs: { increment: 1 } },
  });
  if (bumped.count !== 1) {
    throw new TaskRunError(
      `This project has used its ${MAX_RERUNS_PER_WORKFLOW} reruns for this pass. Review and approve the deliverable to finish it; you can start a new project from ${resetLabel()}. Nothing was sent to the models.`,
      429,
      { scope: "workflow_runs" },
    );
  }
}

/**
 * Gives back one run of the project's open workflow. A workflow whose only runs all
 * failed is removed, so a failed first run does not use up one of the day's workflows.
 */
async function releaseWorkflowRun(projectId: string) {
  const prisma = await getPrisma();
  const open = await prisma.workflow.findFirst({ where: { projectId, status: "open" }, orderBy: { createdAt: "asc" } });
  if (!open) return;
  await prisma.workflow.updateMany({ where: { id: open.id, runs: { gt: 0 } }, data: { runs: { decrement: 1 } } });
  await prisma.workflow.deleteMany({ where: { id: open.id, runs: 0 } });
}

/** Approving the deliverable finishes the workflow; the next model run on it starts a new one. */
export async function closeWorkflow(projectId: string) {
  const prisma = await getPrisma();
  await prisma.workflow.updateMany({ where: { projectId, status: "open" }, data: { status: "closed", closedAt: new Date() } });
}
