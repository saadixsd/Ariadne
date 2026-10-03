/*
  Ariadne early-access Worker. The page itself is static (public/) and never reaches
  this code: assets.run_worker_first is only /api/*, so a page view costs no Worker CPU.

    POST  /api/early-access  step 1: { email, turnstileToken, referrer?, utm? }
                             -> creates the row (email only) and returns an opaque,
                                signed token for that row, plus which questions are
                                still unanswered.
    PATCH /api/early-access  steps 2-4: { token, usesAiFor? | tools?, toolsOther? |
                             switching?, done? } -> fills the same row. Answers are only
                             ever written into empty columns, so a token can complete a
                             row but never rewrite one.

  POST order: origin check -> body -> per-IP rate limit (every attempt counts) ->
  email shape -> Turnstile -> insert. A URL-encoded POST (the page without its
  script) carries every answer at once and gets a redirect back instead of JSON.
  Nothing raw about the visitor is stored: the IP only as a salted hash for the
  hourly rate-limit window, the user agent only as a salted hash.
*/

import { readToken, signToken } from "./token";
import { MAX_BODY_BYTES, answers, fromForm, list, normalizeEmail } from "./validate";

export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET: string;
  HASH_SALT: string;
  TOKEN_SECRET: string;
  RATE_LIMIT_PER_HOUR?: string;
  ALLOWED_ORIGINS?: string;
  TURNSTILE_HOSTNAMES?: string;
}

const HOUR = 3_600_000;
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

type Code =
  | "received" | "already" | "saved" | "invalid_email" | "turnstile" | "rate_limited"
  | "bad_request" | "bad_token" | "forbidden" | "unavailable" | "not_found";

function reply(status: number, code: Code, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ ok: status < 300, code, message, ...extra }), { status, headers: { ...HEADERS, ...headers } });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let hex = "";
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Fixed one-hour window per salted IP hash; one atomic upsert per attempt. */
async function overLimit(env: Env, ip: string, now: number): Promise<number | null> {
  const max = Number(env.RATE_LIMIT_PER_HOUR) || 8;
  const windowStart = now - (now % HOUR);
  const ipHash = (await sha256Hex(`ip:${env.HASH_SALT}:${ip}`)).slice(0, 32);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2)
     ON CONFLICT (key) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(`${windowStart}:${ipHash}`, windowStart + HOUR)
    .first<{ count: number }>();
  const count = row?.count ?? 1;
  // First attempt in a new window: sweep finished windows (indexed, keeps the table tiny).
  if (count === 1) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?1").bind(now).run().catch(() => undefined);
  }
  return count > max ? Math.max(1, Math.ceil((windowStart + HOUR - now) / 1000)) : null;
}

type Siteverify = { success: boolean; hostname?: string; "error-codes"?: string[] };

async function turnstile(env: Env, token: string, ip: string): Promise<"ok" | "failed" | "unreachable"> {
  if (!token || token.length > 2048) return "failed";
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  let result: Siteverify;
  try {
    const response = await fetch(SITEVERIFY, { method: "POST", body: form });
    // Siteverify answers a bad secret with HTTP 400 and a JSON body, so read 4xx too.
    if (response.status >= 500) return "unreachable";
    result = await response.json<Siteverify>();
  } catch {
    return "unreachable";
  }
  const codes = result["error-codes"] ?? [];
  if (codes.some((code) => code.endsWith("-secret") || code === "internal-error")) {
    // Our side is misconfigured (wrong or missing TURNSTILE_SECRET): say "try later", log the codes.
    console.error("turnstile siteverify refused the secret:", codes.join(","));
    return "unreachable";
  }
  if (!result.success) return "failed";
  const hosts = list(env.TURNSTILE_HOSTNAMES);
  if (hosts.length && (!result.hostname || !hosts.includes(result.hostname))) return "failed";
  return "ok";
}

function ownHosts(env: Env): string[] {
  return list(env.ALLOWED_ORIGINS).map((value) => {
    try {
      return new URL(value).hostname;
    } catch {
      return value;
    }
  });
}

/** Body as an object, from JSON or (no-JS fallback) a URL-encoded form. */
async function readBody(req: Request): Promise<{ body: Record<string, unknown>; form: boolean } | Response> {
  const type = req.headers.get("content-type") ?? "";
  const form = type.includes("application/x-www-form-urlencoded");
  if (!form && !type.includes("application/json")) return reply(415, "bad_request", "Send the form as JSON.");
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return reply(413, "bad_request", "That request is too large.");
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, "bad_request", "That request is too large.");
  if (form) return { body: fromForm(new URLSearchParams(raw)), form };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return { body: parsed as Record<string, unknown>, form };
  } catch {
    return reply(400, "bad_request", "Something went wrong with the form. Reload and try again.");
  }
}

type Row = { id: number; uses_ai_for: string | null; tools: string | null; switching: string | null; completed_at: string | null };

/** Fill only the columns that are still empty. Returns the row after the update. */
async function fill(env: Env, id: number, body: Record<string, unknown>): Promise<Row | null> {
  const a = answers(body, ownHosts(env));
  const done = body.done === true ? 1 : 0;
  return env.DB.prepare(
    `UPDATE requests SET
       uses_ai_for  = COALESCE(uses_ai_for, ?2),
       tools        = COALESCE(tools, ?3),
       tools_other  = COALESCE(tools_other, ?4),
       switching    = COALESCE(switching, ?5),
       completed_at = CASE WHEN ?6 = 1 AND completed_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE completed_at END
     WHERE id = ?1
     RETURNING id, uses_ai_for, tools, switching, completed_at`,
  )
    .bind(id, a.usesAiFor, a.tools, a.toolsOther, a.switching, done)
    .first<Row>();
}

function remaining(row: Row): string[] {
  const left: string[] = [];
  if (!row.uses_ai_for) left.push("usesAiFor");
  if (!row.tools) left.push("tools");
  if (!row.switching) left.push("switching");
  return left;
}

function back(req: Request, path: string): Response {
  return new Response(null, { status: 303, headers: { location: new URL(path, req.url).toString(), "cache-control": "no-store" } });
}

// In-app browsers (Instagram, X, TikTok) can send `Origin: null` or their own
// origin for a same-site POST. Turnstile (hostname-checked) guards step 1 and a
// signed token guards steps 2-4, so only refuse a clearly foreign origin that the
// browser also marks as cross-site.
function foreignOrigin(req: Request, env: Env): boolean {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null" || list(env.ALLOWED_ORIGINS).includes(origin)) return false;
  const site = req.headers.get("sec-fetch-site");
  return site !== "same-origin" && site !== "same-site";
}

async function start(req: Request, env: Env): Promise<Response> {
  if (foreignOrigin(req, env)) return reply(403, "forbidden", "This form only works on the Ariadne site. Open ariadneagents.si in your browser and try again.");

  const read = await readBody(req);
  if (read instanceof Response) return read;
  const { body, form } = read;
  // the page without its script: send people back to a page instead of raw JSON
  const fail = (response: Response, slug: string) => (form ? back(req, `/?e=${slug}#early-access`) : response);

  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  const retryAfter = await overLimit(env, ip, Date.now());
  if (retryAfter !== null) {
    return fail(reply(429, "rate_limited", "Too many tries from this network. Give it an hour, then try again.", {}, { "retry-after": String(retryAfter) }), "rate");
  }

  const email = normalizeEmail(body.email);
  if (!email) return fail(reply(400, "invalid_email", "That email doesn't look right. Check it and try again."), "email");

  const human = await turnstile(env, typeof body.turnstileToken === "string" ? body.turnstileToken : "", ip);
  if (human === "unreachable") return fail(reply(503, "unavailable", "We couldn't check the form just now. Try again in a minute."), "later");
  if (human === "failed") return fail(reply(403, "turnstile", "We couldn't confirm you're human. Refresh the check and try again."), "human");

  const a = answers(body, ownHosts(env));
  const ua = req.headers.get("user-agent");
  const uaHash = ua ? (await sha256Hex(`ua:${env.HASH_SALT}:${ua}`)).slice(0, 16) : null;

  const inserted = await env.DB.prepare(
    `INSERT INTO requests (email, referrer, utm_source, utm_medium, utm_campaign, ua_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, uses_ai_for, tools, switching, completed_at`,
  )
    .bind(email, a.referrer, a.utmSource, a.utmMedium, a.utmCampaign, uaHash)
    .first<Row>();
  let row: Row | null = inserted;
  if (!row) {
    row = await env.DB.prepare("SELECT id, uses_ai_for, tools, switching, completed_at FROM requests WHERE email = ?1").bind(email).first<Row>();
    if (!row) return fail(reply(500, "unavailable", "Something broke on our side. Try again in a minute."), "later");
  }

  if (form) {
    await fill(env, row.id, body);
    return back(req, inserted ? "/thanks/" : "/thanks/?already=1");
  }

  const left = remaining(row);
  const token = await signToken(env.TOKEN_SECRET, row.id);
  if (!inserted && (row.completed_at || left.length === 0)) {
    return reply(200, "already", "We already have your request.", { token: null, remaining: [] });
  }
  return reply(inserted ? 201 : 200, inserted ? "received" : "already", inserted ? "Your request is in." : "Welcome back.", { token, remaining: left });
}

async function update(req: Request, env: Env): Promise<Response> {
  if (foreignOrigin(req, env)) return reply(403, "forbidden", "This form only works on the Ariadne site. Open ariadneagents.si in your browser and try again.");
  const read = await readBody(req);
  if (read instanceof Response) return read;
  if (read.form) return reply(415, "bad_request", "Send the answer as JSON.");
  const id = await readToken(env.TOKEN_SECRET, read.body.token);
  if (id === null) return reply(401, "bad_token", "This page has been open a while. Reload it to carry on.");
  const row = await fill(env, id, read.body);
  if (!row) return reply(401, "bad_token", "This page has been open a while. Reload it to carry on.");
  return reply(200, "saved", "Saved.", { remaining: remaining(row) });
}

export default {
  async fetch(req, env): Promise<Response> {
    const { pathname } = new URL(req.url);
    try {
      if (pathname === "/api/early-access") {
        if (req.method === "POST") return await start(req, env);
        if (req.method === "PATCH") return await update(req, env);
        return reply(405, "bad_request", "Use POST or PATCH.", {}, { allow: "POST, PATCH" });
      }
      return reply(404, "not_found", "Not found.");
    } catch (error) {
      console.error("early-access worker error", error instanceof Error ? error.message : String(error));
      return reply(500, "unavailable", "Something broke on our side. Try again in a minute.");
    }
  },
} satisfies ExportedHandler<Env>;
