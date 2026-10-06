import "server-only";

import { TaskRunError } from "@/lib/errors";
import { MAX_INVITE_CODE_CHARS } from "@/lib/limits";

/*
  What stands between the open internet and a new account, checked by
  POST /api/auth/sign-up after the per-IP rate limit:

  1. Turnstile. The sign-up form carries a Cloudflare Turnstile token; the server checks it
     with siteverify using TURNSTILE_SECRET (a Worker secret). In production a missing
     secret refuses every sign-up (503) rather than silently letting bots through. Local
     `next dev` without the secret skips the check so the app still runs offline.
  2. The invite switch. INVITE_CODES (comma-separated) turns sign-up invite-only: without
     a listed code, sign-up is refused with 403 and `invite: true`, and the form asks for
     one. Empty or unset = open sign-up. A listed code given during open sign-up is still
     recorded, and an invited account skips the first-day trial cap (lib/limits.ts).

  Both are read from process.env, which OpenNext fills from the Worker's vars and secrets
  on every request, so flipping either needs no deploy:
    npx wrangler secret put INVITE_CODES      # e.g. "minotaur,labyrinth"
    npx wrangler secret delete INVITE_CODES   # back to open sign-up
*/

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function list(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const production = () => process.env.NODE_ENV === "production";

export type TurnstileOutcome = "ok" | "failed" | "unreachable" | "off";
type Siteverify = { success?: boolean; hostname?: string; "error-codes"?: string[] };

/**
 * Checks a Turnstile token with siteverify. "off" only outside production when no secret is
 * set. "unreachable" covers our own misconfiguration (missing or rejected secret) and
 * Cloudflare being down: the visitor is told to try again later, never let through.
 */
export async function verifyTurnstile(token: string, ip: string, fetcher: typeof fetch = fetch): Promise<TurnstileOutcome> {
  const secret = env("TURNSTILE_SECRET");
  if (!secret) {
    if (!production()) return "off";
    console.error("[ariadne] TURNSTILE_SECRET is not set, so sign-up is refused");
    return "unreachable";
  }
  if (!token || token.length > 2048) return "failed";
  // Tests point this at a local stand-in. Ignored in production.
  const url = (!production() && env("TURNSTILE_VERIFY_URL")) || SITEVERIFY;
  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") form.set("remoteip", ip);
  let result: Siteverify;
  try {
    const response = await fetcher(url, { method: "POST", body: form });
    // Siteverify answers a bad secret with HTTP 400 and a JSON body, so read 4xx too.
    if (response.status >= 500) return "unreachable";
    result = (await response.json()) as Siteverify;
  } catch {
    return "unreachable";
  }
  const codes = result["error-codes"] ?? [];
  if (codes.some((code) => code.endsWith("-secret") || code === "internal-error")) {
    console.error("[ariadne] turnstile siteverify refused the secret:", codes.join(","));
    return "unreachable";
  }
  if (!result.success) return "failed";
  const hosts = list(env("TURNSTILE_HOSTNAMES"));
  if (hosts.length && (!result.hostname || !hosts.includes(result.hostname))) return "failed";
  return "ok";
}

/** Throws a readable 403 / 503 unless the Turnstile token checks out. */
export async function requireHuman(token: string, ip: string) {
  const outcome = await verifyTurnstile(token, ip);
  if (outcome === "ok" || outcome === "off") return;
  if (outcome === "failed") {
    throw new TaskRunError("We couldn't confirm you're human. Wait for the check to finish and try again.", 403, { code: "turnstile" });
  }
  throw new TaskRunError("Sign-up is unavailable for a moment. Try again in a few minutes.", 503, { code: "turnstile_unavailable" });
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

/** The configured invite codes, normalized. Empty means sign-up is open. */
export function inviteCodes(): string[] {
  return list(env("INVITE_CODES")).map(normalizeCode);
}

/**
 * Returns the matching invite code (normalized) or null. When INVITE_CODES is set, a missing
 * or wrong code is refused with 403 and `invite: true`, which tells the form to ask for one.
 */
export function checkInvite(input: string): string | null {
  const codes = inviteCodes();
  const given = normalizeCode(input).slice(0, MAX_INVITE_CODE_CHARS);
  const match = given && codes.includes(given) ? given : null;
  if (codes.length === 0 || match) return match;
  throw new TaskRunError(
    given ? "That invite code isn't valid. Check it and try again." : "Ariadne is invite-only right now. Enter your invite code to create an account.",
    403,
    { code: "invite", invite: true },
  );
}
