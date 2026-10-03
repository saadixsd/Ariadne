#!/usr/bin/env node
/*
  End-to-end checks against a running `wrangler dev` (local D1). Usage:
    npm run dev                                          # in another terminal (test key)
    node tests/smoke.mjs                                  # main cases
    TURNSTILE_FAILS=1 node tests/smoke.mjs                # dev started with --var TURNSTILE_SECRET:2x0000000000000000000000000000000AA
  The rate-limit case uses up this IP's hourly window; it is cleared at the start with
    npx wrangler d1 execute ariadne-early-access --local --command "DELETE FROM rate_limits"
*/
import { execSync } from "node:child_process";
const BASE = process.env.BASE || "http://127.0.0.1:8787";
const ORIGIN = new URL(BASE).origin;
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX"; // what Turnstile's test site keys hand out
let failed = 0;
const sql = (q) => JSON.parse(execSync(`npx wrangler d1 execute ariadne-early-access --local --json --command "${q}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString())[0].results;

async function call(method, body, headers = {}) {
  const response = await fetch(`${BASE}/api/early-access`, {
    method,
    redirect: "manual",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})), headers: response.headers };
}
const post = (body, headers) => call("POST", body, headers);
const patch = (body, headers) => call("PATCH", body, headers);
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
  if (!ok) failed += 1;
}

sql("DELETE FROM rate_limits");
const email = `Smoke-${Date.now()}@Example.com`;
const lower = email.toLowerCase();
const start = { email, turnstileToken: TOKEN, referrer: "https://news.ycombinator.com/x", utm: { source: "prof" } };

if (process.env.TURNSTILE_FAILS) {
  const r = await post(start);
  check("Turnstile failure -> 403 turnstile", r.status === 403 && r.body.code === "turnstile", r);
} else {
  // step 1: email only -> row saved, token back
  let r = await post(start);
  check("step 1 -> 201 received + token + 3 questions left", r.status === 201 && r.body.code === "received" && typeof r.body.token === "string" && r.body.remaining.length === 3, r);
  const token = r.body.token;
  let row = sql(`SELECT * FROM requests WHERE email = '${lower}'`)[0];
  check("step 1 saved a partial row (email lowercased, status new, no answers yet)", row && row.status === "new" && row.uses_ai_for === null && row.referrer === "news.ycombinator.com" && row.utm_source === "prof", row);

  // steps 2-4 by token
  r = await patch({ token, usesAiFor: "Research and copy" });
  check("PATCH answer 1 -> saved, 2 left", r.status === 200 && r.body.code === "saved" && r.body.remaining.length === 2, r);
  r = await patch({ token, usesAiFor: "overwrite attempt" });
  row = sql(`SELECT uses_ai_for FROM requests WHERE email = '${lower}'`)[0];
  check("a second PATCH cannot rewrite an answer", row.uses_ai_for === "Research and copy", row);
  r = await patch({ token, tools: ["claude", "gpt", "other", "evil"], toolsOther: "Perplexity" });
  check("PATCH answer 2 -> saved", r.body.code === "saved", r);
  r = await patch({ token, switching: "several_daily", done: true });
  row = sql(`SELECT * FROM requests WHERE email = '${lower}'`)[0];
  check("PATCH answer 3 + done -> row complete", r.body.code === "saved" && row.tools === "claude,gpt,other" && row.tools_other === "Perplexity" && row.switching === "several_daily" && row.completed_at, row);

  r = await patch({ token: token.slice(0, -3) + "AAA", usesAiFor: "x" });
  check("tampered token -> 401 bad_token", r.status === 401 && r.body.code === "bad_token", r);
  r = await patch({ usesAiFor: "x" });
  check("missing token -> 401 bad_token", r.status === 401, r);

  // duplicates
  r = await post({ ...start, email: `  ${email.toUpperCase()} ` });
  check("same email again (completed) -> 200 already, no token", r.status === 200 && r.body.code === "already" && r.body.token === null, r);
  const partial = `partial-${Date.now()}@example.com`;
  await post({ ...start, email: partial });
  r = await post({ ...start, email: partial });
  check("same email again (unfinished) -> 200 already + token to finish", r.status === 200 && r.body.code === "already" && typeof r.body.token === "string" && r.body.remaining.length === 3, r);

  // bad input
  r = await post({ ...start, email: "not-an-email" });
  check("invalid email -> 400 invalid_email", r.status === 400 && r.body.code === "invalid_email", r);
  r = await post({ ...start, email: `x-${Date.now()}@example.com`, turnstileToken: "" });
  check("missing Turnstile token -> 403 turnstile", r.status === 403 && r.body.code === "turnstile", r);
  r = await post(start, { origin: "https://evil.example" });
  check("foreign Origin -> 403 forbidden", r.status === 403 && r.body.code === "forbidden", r);
  r = await post("{not json");
  check("broken JSON -> 400 bad_request", r.status === 400 && r.body.code === "bad_request", r);
  r = await post(JSON.stringify({ ...start, pad: "x".repeat(5000) }));
  check("oversized body -> 413", r.status === 413, r.status);

  // the page without its script: a URL-encoded post of the whole form
  const formEmail = `nojs-${Date.now()}@example.com`;
  const f = await fetch(`${BASE}/api/early-access`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN }, body: new URLSearchParams([["email", formEmail], ["usesAiFor", "Code"], ["tools", "cursor"], ["switching", "weekly"], ["cf-turnstile-response", TOKEN]]).toString() });
  row = sql(`SELECT * FROM requests WHERE email = '${formEmail}'`)[0];
  check("form post -> 303 to /thanks/ and a complete row", f.status === 303 && f.headers.get("location").endsWith("/thanks/") && row && row.tools === "cursor" && row.completed_at, { status: f.status, row });
  const g = await fetch(`${BASE}/api/early-access`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN }, body: `email=${formEmail.replace("@", "%40")}x` });
  check("form post without Turnstile -> 303 back to the page with ?e=", g.status === 303 && /\?e=(human|email)/.test(g.headers.get("location")), g.status);

  const get = await fetch(`${BASE}/api/early-access`);
  check("GET on the endpoint -> 405", get.status === 405, get.status);
  const page = await fetch(`${BASE}/`);
  check("page has CSP header", (page.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'"), [...page.headers]);
  const thanks = await fetch(`${BASE}/thanks/`);
  check("/thanks/ page exists", thanks.status === 200, thanks.status);
  const missing = await fetch(`${BASE}/some/old/app/path`);
  check("unknown path -> 404 page", missing.status === 404, missing.status);

  // rate limit: 8 POSTs per hashed IP per hour (the posts above already count)
  let limited = null;
  for (let i = 0; i < 12 && !limited; i += 1) {
    const x = await post({ ...start, email: `rl-${i}-${Date.now()}@example.com` });
    if (x.status === 429) limited = x;
  }
  check("rate limit -> 429 rate_limited with Retry-After", limited && limited.body.code === "rate_limited" && Number(limited.headers.get("retry-after")) > 0, limited);
  sql("DELETE FROM rate_limits");
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
