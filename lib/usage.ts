import "server-only";

import { TaskRunError } from "@/lib/errors";
import { DAILY_MODEL_RUNS } from "@/lib/limits";
import { getPrisma } from "@/lib/prisma";

export { DAILY_MODEL_RUNS };

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
 * Atomically reserves one model run for `day`. The check and the increment are a
 * single conditional UPDATE (`runs < limit`), so concurrent runs cannot overshoot
 * the daily quota. A reservation is released again with `releaseModelRun` when
 * the run fails, is discarded, or is reclaimed as stuck, so only successful runs
 * end up counted.
 */
export async function reserveModelRun(userId: string, day = utcDay()) {
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

/** Gives back a reservation made by `reserveModelRun` on the same UTC day. Never goes below 0. */
export async function releaseModelRun(userId: string, day: string) {
  const prisma = await getPrisma();
  await prisma.usageDay.updateMany({
    where: { userId, day, runs: { gt: 0 } },
    data: { runs: { decrement: 1 } },
  });
}
