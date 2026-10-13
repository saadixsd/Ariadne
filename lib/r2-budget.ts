import "server-only";
/*
  Hard guards that keep R2 inside Cloudflare's free tier (10 GB stored, 1M Class A and
  10M Class B operations a month), with wide margins:
  - one original: at most 10 MB (larger files keep their text, not the original);
  - one user: at most 50 MB of originals at a time;
  - the whole site: at most 5 GB of originals at a time, tracked in D1 (SourceFile.blobBytes);
  - the whole site: at most 2,000 R2 writes per UTC day (~60k/month, 6% of Class A).
  Stored bytes count until expiresAt plus a day, because the lifecycle rule can lag.
  Hitting any cap behaves like having no bucket: the text is kept and the UI says
  "Original not kept". Nothing here ever fails a run.
*/
import { getPrisma } from "@/lib/prisma";

export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
export const USER_ORIGINAL_BYTES = 50 * 1024 * 1024;
export const SITE_ORIGINAL_BYTES = 5 * 1024 * 1024 * 1024;
export const SITE_DAILY_R2_WRITES = 2_000;
const LIFECYCLE_LAG_MS = 24 * 60 * 60 * 1000;

export type BudgetRefusal = "too_large" | "user_full" | "site_full" | "daily_writes";

function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

async function storedBytes(userId: string | null, now: number) {
  const prisma = await getPrisma();
  const total = await prisma.sourceFile.aggregate({
    where: {
      blobKey: userId ? { startsWith: `u/${userId}/` } : { not: null },
      expiresAt: { gt: new Date(now - LIFECYCLE_LAG_MS) },
    },
    _sum: { blobBytes: true },
  });
  return total._sum.blobBytes ?? 0;
}

/** Checks the byte caps, then reserves one of today's writes. null = go ahead. */
export async function reserveOriginal(userId: string, bytes: number, now = Date.now()): Promise<BudgetRefusal | null> {
  if (bytes > MAX_ORIGINAL_BYTES) return "too_large";
  if ((await storedBytes(userId, now)) + bytes > USER_ORIGINAL_BYTES) return "user_full";
  if ((await storedBytes(null, now)) + bytes > SITE_ORIGINAL_BYTES) return "site_full";
  const prisma = await getPrisma();
  const day = utcDay(now);
  const row = await prisma.r2Day.upsert({ where: { day }, create: { day, writes: 1 }, update: { writes: { increment: 1 } } });
  if (row.writes > SITE_DAILY_R2_WRITES) {
    await prisma.r2Day.update({ where: { day }, data: { writes: { decrement: 1 } } });
    return "daily_writes";
  }
  return null;
}

/** Gives back a reserved write when the put itself failed. */
export async function releaseOriginal(now = Date.now()) {
  const prisma = await getPrisma();
  await prisma.r2Day.updateMany({ where: { day: utcDay(now), writes: { gt: 0 } }, data: { writes: { decrement: 1 } } });
}
