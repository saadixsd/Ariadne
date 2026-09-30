import "server-only";

import { TaskRunError } from "@/lib/errors";
import {
  MAX_SIGNINS_PER_HOUR_PER_IP,
  MAX_SIGNUPS_PER_HOUR_PER_IP,
  MAX_VERIFY_ATTEMPTS_PER_HOUR_PER_IP,
  RATE_LIMIT_WINDOW_MS,
} from "@/lib/limits";
import { getPrisma } from "@/lib/prisma";

export type RateLimitAction = "signup" | "signin" | "verify";

const LIMITS: Record<RateLimitAction, { max: number; message: string }> = {
  signup: {
    max: MAX_SIGNUPS_PER_HOUR_PER_IP,
    message: "Too many sign-up attempts from this network. Wait an hour, then try again.",
  },
  signin: {
    max: MAX_SIGNINS_PER_HOUR_PER_IP,
    message: "Too many sign-in attempts from this network. Wait an hour, then try again.",
  },
  verify: {
    max: MAX_VERIFY_ATTEMPTS_PER_HOUR_PER_IP,
    message: "Too many code attempts from this network. Wait an hour, then try again.",
  },
};

/**
 * Client IP. On Cloudflare, `cf-connecting-ip` is set by the edge and cannot be
 * spoofed by the client. `x-forwarded-for` / `x-real-ip` are only consulted when it
 * is absent (local `next dev`).
 */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Fixed one-hour window counter in D1. Every attempt counts (successful or not),
 * which is what stops scripted sign-ups and password guessing. The increment is a
 * single atomic UPDATE, so parallel requests cannot all slip under the cap.
 */
export async function enforceRateLimit(request: Request, action: RateLimitAction) {
  const { max, message } = LIMITS[action];
  const now = Date.now();
  const windowStart = now - (now % RATE_LIMIT_WINDOW_MS);
  const key = `${action}:${clientIp(request)}:${windowStart}`;
  const prisma = await getPrisma();

  // Atomic increment first; create the window row only if it does not exist yet.
  // No upsert: Prisma may wrap it in a transaction, which D1 and the local SQLite
  // adapter cannot run concurrently. Every step here is one atomic statement.
  const increment = () => prisma.rateLimit.updateMany({ where: { key }, data: { count: { increment: 1 } } });
  let first = false;
  if ((await increment()).count === 0) {
    try {
      await prisma.rateLimit.create({ data: { key, count: 1, expiresAt: new Date(windowStart + RATE_LIMIT_WINDOW_MS) } });
      first = true;
    } catch (error) {
      // Lost the insert race: the row exists now, so count this attempt on it.
      if ((await increment()).count === 0) throw error;
    }
  }
  // Read after our own increment. Under concurrency this can only over-count.
  const row = await prisma.rateLimit.findUnique({ where: { key }, select: { count: true } });
  const count = row?.count ?? 1;

  // Opportunistic cleanup of finished windows (cheap, indexed, keeps the table tiny).
  if (first) {
    await prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => undefined);
  }

  if (count > max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000));
    throw new TaskRunError(message, 429, { retryAfterSeconds });
  }
}
