import "server-only";

import { TaskRunError } from "@/lib/errors";
import { DAILY_MODEL_RUNS, SITE_DAILY_MODEL_RUNS } from "@/lib/limits";
import { getPrisma } from "@/lib/prisma";

export { DAILY_MODEL_RUNS, SITE_DAILY_MODEL_RUNS };

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
async function reserveUserRun(userId: string, day: string) {
  const prisma = await getPrisma();
  const tryReserve = async () =>
    (
      await prisma.usageDay.updateMany({
        where: { userId, day, runs: { lt: DAILY_MODEL_RUNS } },
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
      `Daily limit of ${DAILY_MODEL_RUNS} model runs is used up. Nothing was sent to Claude or GPT.`,
      429,
    );
  }
}

/**
 * Reserves one model run for `userId`: first the per-account quota (`reserveUserRun`,
 * 429 when used up), then the site-wide ceiling. The site check reads the day's total
 * AFTER this reservation; if it is over SITE_DAILY_MODEL_RUNS the reservation is given
 * back and the run is refused with a 503. Concurrent runs at the edge can only refuse
 * each other (each sees the other's reservation), never push the total past the ceiling.
 * Like the per-account quota, a failed, discarded or reclaimed run releases its unit.
 */
export async function reserveModelRun(userId: string, day = utcDay()) {
  await reserveUserRun(userId, day);
  const prisma = await getPrisma();
  const total = await prisma.usageDay.aggregate({ where: { day }, _sum: { runs: true } });
  if ((total._sum.runs ?? 0) > SITE_DAILY_MODEL_RUNS) {
    await releaseModelRun(userId, day);
    throw new TaskRunError(
      `Ariadne has spun all ${SITE_DAILY_MODEL_RUNS} runs it makes in a day across every account, so nothing was sent to Claude or GPT.`,
      503,
      { scope: "site", limit: SITE_DAILY_MODEL_RUNS, retryAfterSeconds: secondsUntilNextUtcDay() },
    );
  }
}

function secondsUntilNextUtcDay(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now) / 1000));
}

/** Gives back a reservation made by `reserveModelRun` on the same UTC day. Never goes below 0. */
export async function releaseModelRun(userId: string, day: string) {
  const prisma = await getPrisma();
  await prisma.usageDay.updateMany({
    where: { userId, day, runs: { gt: 0 } },
    data: { runs: { decrement: 1 } },
  });
}
