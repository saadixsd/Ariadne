import "server-only";

import { TaskRunError } from "@/lib/errors";
import { DAILY_MODEL_RUNS } from "@/lib/limits";
import { getPrisma } from "@/lib/prisma";

export { DAILY_MODEL_RUNS };

function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function modelRunsToday(userId: string) {
  const prisma = await getPrisma();
  const row = await prisma.usageDay.findUnique({
    where: { userId_day: { userId, day: utcDay() } },
  });
  return row?.runs ?? 0;
}

export async function consumeModelRun(userId: string) {
  const prisma = await getPrisma();
  const day = utcDay();
  const row = await prisma.usageDay.findUnique({
    where: { userId_day: { userId, day } },
  });
  if ((row?.runs ?? 0) >= DAILY_MODEL_RUNS) {
    throw new TaskRunError(
      `Daily limit of ${DAILY_MODEL_RUNS} model runs is used up. Nothing was sent to Claude or GPT.`,
      429,
    );
  }
  await prisma.usageDay.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, runs: 1 },
    update: { runs: { increment: 1 } },
  });
}
