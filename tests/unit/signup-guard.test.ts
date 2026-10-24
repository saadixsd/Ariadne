// Unit tests for the sign-up gate: Turnstile siteverify handling and the INVITE_CODES switch.
// No network: siteverify is a stub passed in as `fetcher`.
// Run: npx tsx --conditions=react-server --test tests/unit/signup-guard.test.ts
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { checkInvite, inviteCodes, verifyTurnstile } from "../../lib/signup-guard";

const saved = { ...process.env };
afterEach(() => {
  for (const key of ["TURNSTILE_SECRET", "TURNSTILE_HOSTNAMES", "TURNSTILE_VERIFY_URL", "INVITE_CODES", "NODE_ENV"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

type Call = { url: string; body: URLSearchParams };
function stub(status: number, json: unknown, calls: Call[] = []) {
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as URLSearchParams });
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetcher, calls };
}

test("turnstile: no secret outside production skips the check; in production it refuses", async () => {
  const { fetcher, calls } = stub(200, { success: true });
  setEnv({ TURNSTILE_SECRET: undefined, NODE_ENV: "development" });
  assert.equal(await verifyTurnstile("anything", "1.2.3.4", fetcher), "off");
  setEnv({ NODE_ENV: "production" });
  assert.equal(await verifyTurnstile("anything", "1.2.3.4", fetcher), "unreachable");
  assert.equal(calls.length, 0, "never called siteverify without a secret");
});

test("turnstile: a passing token is ok; secret, token and IP are sent to siteverify", async () => {
  setEnv({ TURNSTILE_SECRET: "sekrit", NODE_ENV: "production", TURNSTILE_VERIFY_URL: "http://127.0.0.1:1/ignored-in-production" });
  const { fetcher, calls } = stub(200, { success: true, hostname: "example.com" });
  assert.equal(await verifyTurnstile("tok", "203.0.113.9", fetcher), "ok");
  assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify", "the override is ignored in production");
  assert.equal(calls[0].body.get("secret"), "sekrit");
  assert.equal(calls[0].body.get("response"), "tok");
  assert.equal(calls[0].body.get("remoteip"), "203.0.113.9");
});

test("turnstile: missing, oversized or rejected tokens fail; wrong hostname fails", async () => {
  setEnv({ TURNSTILE_SECRET: "sekrit", NODE_ENV: "production" });
  const ok = stub(200, { success: true, hostname: "evil.example" });
  assert.equal(await verifyTurnstile("", "1.1.1.1", ok.fetcher), "failed");
  assert.equal(await verifyTurnstile("x".repeat(2049), "1.1.1.1", ok.fetcher), "failed");
  assert.equal(ok.calls.length, 0);
  assert.equal(await verifyTurnstile("tok", "1.1.1.1", stub(200, { success: false, "error-codes": ["invalid-input-response"] }).fetcher), "failed");
  setEnv({ TURNSTILE_HOSTNAMES: "example.com, www.example.com" });
  assert.equal(await verifyTurnstile("tok", "1.1.1.1", ok.fetcher), "failed");
  assert.equal(await verifyTurnstile("tok", "1.1.1.1", stub(200, { success: true, hostname: "www.example.com" }).fetcher), "ok");
});

test("turnstile: our misconfiguration or Cloudflare being down is 'unreachable', never a pass", async () => {
  setEnv({ TURNSTILE_SECRET: "wrong", NODE_ENV: "production" });
  assert.equal(await verifyTurnstile("tok", "1.1.1.1", stub(400, { success: false, "error-codes": ["invalid-input-secret"] }).fetcher), "unreachable");
  assert.equal(await verifyTurnstile("tok", "1.1.1.1", stub(503, {}).fetcher), "unreachable");
  const throwing = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  assert.equal(await verifyTurnstile("tok", "1.1.1.1", throwing), "unreachable");
});

test("turnstile: tests may point siteverify at a local stand-in outside production", async () => {
  setEnv({ TURNSTILE_SECRET: "test", NODE_ENV: "development", TURNSTILE_VERIFY_URL: "http://127.0.0.1:4197/turnstile/v0/siteverify" });
  const { fetcher, calls } = stub(200, { success: true });
  assert.equal(await verifyTurnstile("tok", "unknown", fetcher), "ok");
  assert.equal(calls[0].url, "http://127.0.0.1:4197/turnstile/v0/siteverify");
  assert.equal(calls[0].body.get("remoteip"), null, "no IP is sent when there is none");
});

test("invites: unset or empty INVITE_CODES = open sign-up; a listed code is still recognised", () => {
  setEnv({ INVITE_CODES: undefined });
  assert.deepEqual(inviteCodes(), []);
  assert.equal(checkInvite(""), null);
  assert.equal(checkInvite("anything"), null);
  setEnv({ INVITE_CODES: " , " });
  assert.deepEqual(inviteCodes(), []);
  assert.equal(checkInvite(""), null);
});

test("invites: INVITE_CODES set = invite-only; codes match trimmed and case-insensitively", () => {
  setEnv({ INVITE_CODES: "Minotaur, labyrinth" });
  assert.deepEqual(inviteCodes(), ["minotaur", "labyrinth"]);
  assert.equal(checkInvite("  MINOTAUR "), "minotaur");
  assert.equal(checkInvite("labyrinth"), "labyrinth");
  assert.throws(
    () => checkInvite(""),
    (error: { status?: number; message?: string; details?: Record<string, unknown> }) =>
      error.status === 403 && error.details?.invite === true && /invite-only/.test(error.message ?? ""),
  );
  assert.throws(
    () => checkInvite("minotaurs"),
    (error: { status?: number; message?: string; details?: Record<string, unknown> }) =>
      error.status === 403 && error.details?.invite === true && /isn't valid/.test(error.message ?? ""),
  );
});
