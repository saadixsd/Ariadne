// HTTP-level acceptance checks against a running `next dev` server (local SQLite,
// mock LLM). Start them first, e.g.:
//   node tests/integration/mock-llm.mjs 4197 &
//   ANTHROPIC_API_KEY=test OPENAI_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:4197 \
//   OPENAI_BASE_URL=http://127.0.0.1:4197/v1 npx next dev -p 3197 &
//   BASE_URL=http://127.0.0.1:3197 node --test tests/integration/http.test.mjs
// Requests carry `cf-connecting-ip`, the header Cloudflare's edge sets in prod.
import assert from "node:assert/strict";
import path from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3197";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dbFile = path.join(root, "prisma/dev.db");
const run = Date.now().toString(36);
// Fresh /24 per test run, so re-running within the hour is not throttled by the last run.
const subnet = Math.floor(Math.random() * 250) + 1;
const ip = (n) => `198.51.${subnet}.${n}`;

async function call(method, url, { body, cookie, from = ip(200), headers = {} } = {}) {
  const response = await fetch(`${BASE}${url}`, {
    method,
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": from,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const setCookie = response.headers.get("set-cookie") ?? "";
  const session = setCookie.match(/ariadne_session=([^;]+)/)?.[1];
  return { status: response.status, json, text, headers: response.headers, cookie: session ? `ariadne_session=${session}` : undefined };
}

function sql(query, ...params) {
  const db = new DatabaseSync(dbFile);
  try {
    const stmt = db.prepare(query);
    return /^\s*select/i.test(query) ? stmt.all(...params) : stmt.run(...params);
  } finally {
    db.close();
  }
}

const state = {};

before(async () => {
  // Warm up the dev server (first compile is slow).
  await call("GET", "/sign-in");
  // Safety: make sure BASE_URL is THIS checkout (the runs route only exists here),
  // not some other dev server on the shared machine.
  const probe = await call("GET", "/api/tasks/probe/runs");
  if (probe.status !== 401) throw new Error(`BASE_URL ${BASE} is not this Ariadne checkout (probe got ${probe.status})`);
  // Fixtures for the ownership check: an orphan project (userId NULL) and a project owned by someone else.
  sql(`INSERT INTO "User" (id,email,passwordHash,passwordSalt,emailVerified,createdAt) VALUES (?,?,?,?,1,?)`, `owner-${run}`, `owner-${run}@test.dev`, "h", "s", new Date().toISOString());
  sql(`INSERT INTO "Project" (id,userId,name,brief,template,createdAt) VALUES (?,NULL,'Orphan','b','own',?)`, `orphan-${run}`, new Date().toISOString());
  sql(`INSERT INTO "Project" (id,userId,name,brief,template,createdAt) VALUES (?,?,'Owned','b','own',?)`, `owned-${run}`, `owner-${run}`, new Date().toISOString());
});

test("1a. 6 rapid signups from one IP: 5 succeed, the 6th is throttled (429 + Retry-After)", async () => {
  const statuses = [];
  let last;
  for (let i = 1; i <= 6; i++) {
    last = await call("POST", "/api/auth/sign-up", { body: { email: `burst${i}-${run}@test.dev`, password: "password123", turnstileToken: "pass" }, from: ip(7) });
    statuses.push(last.status);
  }
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
  assert.match(last.json.error, /Too many sign-up attempts/);
  assert.ok(Number(last.headers.get("retry-after")) > 0);
  const created = sql(`SELECT count(*) AS n FROM "User" WHERE email LIKE ?`, `burst%-${run}@test.dev`)[0].n;
  assert.equal(created, 5, "the throttled attempt created no user");
  state.burst = statuses;
});

test("1b. legitimate signup from another IP still works and gets a session", async () => {
  const res = await call("POST", "/api/auth/sign-up", { body: { email: `legit-${run}@test.dev`, password: "password123", turnstileToken: "pass" }, from: ip(8) });
  assert.equal(res.status, 201);
  assert.ok(res.cookie);
  state.cookie = res.cookie;
});

test("1c. sign-in: 10 attempts per hour per IP, the 11th is throttled even with the right password", async () => {
  const statuses = [];
  for (let i = 0; i < 10; i++) {
    statuses.push((await call("POST", "/api/auth/sign-in", { body: { email: `legit-${run}@test.dev`, password: "wrong-password" }, from: ip(9) })).status);
  }
  const eleventh = await call("POST", "/api/auth/sign-in", { body: { email: `legit-${run}@test.dev`, password: "password123" }, from: ip(9) });
  assert.deepEqual(statuses, Array(10).fill(401));
  assert.equal(eleventh.status, 429);
  const elsewhere = await call("POST", "/api/auth/sign-in", { body: { email: `legit-${run}@test.dev`, password: "password123" }, from: ip(10) });
  assert.equal(elsewhere.status, 200, "correct password from another IP works");
  assert.ok(elsewhere.cookie);
});

test("O. API writes from another site are refused (403); same-site and Origin-less writes pass", async () => {
  const evil = await call("POST", "/api/auth/sign-in", { body: { email: "x@test.dev", password: "wrong-password" }, from: ip(31), headers: { origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  assert.match(evil.json?.error ?? "", /another site/);
  const nullOrigin = await call("POST", "/api/feedback", { body: { kind: "bug", message: "x" }, from: ip(31), headers: { origin: "null" } });
  assert.equal(nullOrigin.status, 403);
  const crossFetch = await call("POST", "/api/auth/sign-out", { from: ip(31), headers: { "sec-fetch-site": "cross-site" } });
  assert.equal(crossFetch.status, 403);
  const own = await call("POST", "/api/auth/sign-in", { body: { email: "x@test.dev", password: "wrong-password" }, from: ip(32), headers: { origin: BASE } });
  assert.equal(own.status, 401, "same-origin request reaches the route (wrong password -> 401)");
  const reads = await call("GET", "/api/projects", { from: ip(31), headers: { origin: "https://evil.example" } });
  assert.equal(reads.status, 401, "reads are not blocked by the Origin check (no session -> 401)");
});

test("2. no project changes owners on sign-up / sign-in", () => {
  const rows = Object.fromEntries(sql(`SELECT id, userId FROM "Project" WHERE id IN (?,?)`, `orphan-${run}`, `owned-${run}`).map((r) => [r.id, r.userId]));
  assert.equal(rows[`orphan-${run}`], null, "orphan project was NOT claimed");
  assert.equal(rows[`owned-${run}`], `owner-${run}`, "owned project untouched");
});

test("L1. signed out: / is the public landing page; /dashboard and other app pages go to /sign-in", async () => {
  const landing = await call("GET", "/", { from: ip(40) });
  assert.equal(landing.status, 200);
  assert.match(landing.text, /Check Your First Question/);
  assert.match(landing.text, /Stop <em>Second-Guessing<\/em> Your Research\./);
  assert.match(landing.text, /Every Key Claim, Checked Against Its Source\./);
  assert.match(landing.text, /<title>Ariadne · Stop Second-Guessing Your Research<\/title>/);
  assert.match(landing.text, /Ariadne drafts a sourced answer to your research question/, "the one-liner");
  assert.match(landing.text, /Already have an account\? <a href="\/sign-in">Sign in<\/a>/);
  assert.doesNotMatch(landing.text, /DNS|hallucinat|beta|early access/i);
  assert.match(landing.text, /href="\/sign-up"/);
  assert.match(landing.text, /instagram\.com\/ariadne_agents/);
  assert.match(landing.text, /x\.com\/ariadne_agents/);
  // Roles by name only: no model or vendor names, no test-phase wording.
  assert.doesNotMatch(landing.text.replace(/<script[\s\S]*?<\/script>/g, ""), /\b(Claude|GPT|ChatGPT|Gemini|OpenAI|Anthropic)\b|\bbeta\b|early access|\btesters?\b|\bpilot\b|small group/i);
  assert.match(landing.text, /Odysseus writes/);
  assert.match(landing.text, /Daedalus checks/);
  assert.match(landing.text, /Supported, Unsupported, Wrong, or Sources disagree/);
  assert.match(landing.text, /checks the key claims/, "copy matches the checker's claim cap");
  assert.doesNotMatch(landing.text, /every claim/i);
  assert.doesNotMatch(landing.text, /Daedalus drafts|Odysseus challenges|\bScout\b|\bMaker\b/);
  assert.doesNotMatch(landing.text.replaceAll("saad@ariadneagents.si", ""), /try to break|tries to break|prove (it|the draft) wrong|\bBoard\b|Saad/i, "no adversarial or stale wording");
  assert.doesNotMatch(landing.text, /eliminates hallucinations|hallucination-free|guaranteed accura/i, "no reliability claims");
  for (const path of ["/dashboard", "/dashboard?project=abc", "/tree", "/settings"]) {
    const res = await call("GET", path, { from: ip(40) });
    assert.equal(res.status, 307, path);
    assert.equal(new URL(res.headers.get("location"), BASE).pathname, "/sign-in", path);
  }
  // Old board links still resolve (to the Workspace door, which asks a signed-out visitor to sign in).
  const old = await call("GET", "/?project=abc&new=1", { from: ip(40) });
  assert.equal(old.status, 307);
  const to = new URL(old.headers.get("location"), BASE);
  assert.equal(to.pathname, "/dashboard");
  assert.equal(to.search, "?project=abc&new=1");
  const signUp = await call("GET", "/sign-up", { from: ip(40) });
  assert.equal(signUp.status, 200);
  assert.match(signUp.text, /Daedalus fact-checks each claim against your sources and the web, and you judge only what it flags/, "sign-up says what comes next");
});

test("T1. sign-up needs a Turnstile pass; shape errors come first; nothing is created on failure", async () => {
  const email = `turnstile-${run}@test.dev`;
  const none = await call("POST", "/api/auth/sign-up", { body: { email, password: "password123" }, from: ip(41) });
  assert.equal(none.status, 403);
  assert.equal(none.json.code, "turnstile");
  const failed = await call("POST", "/api/auth/sign-up", { body: { email, password: "password123", turnstileToken: "fail-token" }, from: ip(42) });
  assert.equal(failed.status, 403);
  assert.equal(failed.cookie, undefined);
  assert.equal(sql(`SELECT count(*) AS n FROM "User" WHERE email = ?`, email)[0].n, 0, "no account without a pass");
  const badEmail = await call("POST", "/api/auth/sign-up", { body: { email: "not-an-email", password: "password123" }, from: ip(43) });
  assert.equal(badEmail.status, 400, "a typo is reported before the Turnstile token is spent");
  const ok = await call("POST", "/api/auth/sign-up", { body: { email, password: "password123", turnstileToken: "pass-1" }, from: ip(44) });
  assert.equal(ok.status, 201);
  assert.ok(ok.cookie);
  assert.equal(sql(`SELECT inviteCode FROM "User" WHERE email = ?`, email)[0].inviteCode, null, "open sign-up records no invite");
});

test("workspace door: old board/tree URLs redirect; /new and the workspace load; a new project has four steps", async () => {
  const home = await call("GET", "/", { cookie: state.cookie });
  assert.equal(home.status, 200);
  assert.match(home.text, /Open Your Projects/);
  // No project yet: the old Board and Tree URLs send you to /new.
  for (const door of ["/dashboard", "/tree"]) {
    const res = await call("GET", door, { cookie: state.cookie });
    const where = res.status === 307 ? new URL(res.headers.get("location"), BASE).pathname : (res.text.match(/NEXT_REDIRECT[^"]*?(\/[a-z]+)/)?.[1] ?? "");
    assert.equal(where, "/new", door);
  }
  const intro = await call("GET", "/new", { cookie: state.cookie });
  assert.equal(intro.status, 200);
  assert.match(intro.text, /What do you need fact-checked\?/);
  assert.match(intro.text, /exercise therapy for chronic low back pain\?/, "the sample question");
  const created = await call("POST", "/api/projects", { cookie: state.cookie, body: { name: "Coffee cart", brief: "Landing page for a coffee cart." } });
  assert.equal(created.status, 201, created.text);
  state.projectId = created.json.project?.id ?? created.json.id;
  const ws = await call("GET", `/p/${state.projectId}`, { cookie: state.cookie });
  assert.equal(ws.status, 200);
  assert.match(ws.text, /Coffee cart/);
  const dash = await call("GET", `/dashboard?project=${state.projectId}`, { cookie: state.cookie });
  const where = dash.status === 307 ? new URL(dash.headers.get("location"), BASE).pathname : (dash.text.match(/NEXT_REDIRECT[^"]*?(\/p\/[a-z0-9]+)/)?.[1] ?? "");
  assert.equal(where, `/p/${state.projectId}`, "old board link opens the Workspace");
  const settings = await call("GET", "/settings", { cookie: state.cookie });
  assert.equal(settings.status, 200);
  const project = await call("GET", `/api/projects/${state.projectId}`, { cookie: state.cookie });
  state.tasks = project.json.tasks;
  state.agents = project.json.agents;
  assert.equal(state.tasks.length, 4);
});

test("8. over-long brief / title / instructions / note rejected server-side with a clear error", async () => {
  const pid = state.projectId;
  const c = state.cookie;
  let res = await call("PATCH", `/api/projects/${pid}`, { cookie: c, body: { brief: "b".repeat(5001) } });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, "Brief is too long (5,001 characters). The limit is 5,000.");
  res = await call("PATCH", `/api/projects/${pid}`, { cookie: c, body: { brief: "b".repeat(5000) } });
  assert.equal(res.status, 200, "exactly at the cap is fine");
  res = await call("PATCH", `/api/projects/${pid}`, { cookie: c, body: { brief: "Landing page for a coffee cart." } });
  assert.equal(res.status, 200);
  res = await call("POST", `/api/projects`, { cookie: c, body: { name: "X", brief: "b".repeat(5001) } });
  assert.equal(res.status, 400);
  assert.match(res.json.error, /^Brief is too long/);
  const agentId = state.agents.find((a) => a.name === "Odysseus").id;
  res = await call("POST", `/api/projects/${pid}/tasks`, { cookie: c, body: { title: "t".repeat(201), agentId, instructions: "do it" } });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, "Title is too long (201 characters). The limit is 200.");
  res = await call("POST", `/api/projects/${pid}/tasks`, { cookie: c, body: { title: "Extra", agentId, instructions: "i".repeat(5001) } });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, "Instructions is too long (5,001 characters). The limit is 5,000.");
  state.capsChecked = true;
});

test("full HTTP flow: draft -> fact-check -> judge -> request changes -> history kept -> approve -> tie off", async () => {
  const c = state.cookie;
  const [draft, review, gate, build] = state.tasks;
  for (const t of [draft, review]) {
    const res = await call("POST", `/api/tasks/${t.id}/run`, { cookie: c });
    assert.equal(res.status, 200, res.text);
  }
  let project = (await call("GET", `/api/projects/${state.projectId}`, { cookie: c })).json;
  assert.equal(project.tasks.find((t) => t.id === gate.id).status, "awaiting_approval");
  const firstDraftOutput = project.tasks.find((t) => t.id === draft.id).output;

  let res = await call("POST", `/api/tasks/${gate.id}/approve`, { cookie: c, body: { approved: false, note: "n".repeat(2001) } });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, "Note is too long (2,001 characters). The limit is 2,000.");

  res = await call("POST", `/api/tasks/${gate.id}/approve`, { cookie: c, body: { approved: false, note: "Shorter answer." } });
  assert.equal(res.status, 200, res.text);
  const history = await call("GET", `/api/tasks/${draft.id}/runs`, { cookie: c });
  assert.equal(history.status, 200);
  assert.equal(history.json.output, null, "task is pending again");
  assert.equal(history.json.runs.length, 1);
  assert.equal(history.json.runs[0].output, firstDraftOutput, "prior output preserved as a run row");

  for (const t of [draft, review]) assert.equal((await call("POST", `/api/tasks/${t.id}/run`, { cookie: c })).status, 200);
  // Tie Off waits for a decision on every flagged claim (server-enforced).
  res = await call("POST", `/api/tasks/${gate.id}/approve`, { cookie: c, body: { approved: true } });
  assert.equal(res.status, 409, res.text);
  assert.match(res.json.error, /^Decide \d+ flagged claims? first/);
  for (const flagKey of res.json.flagKeys) {
    const d = await call("PUT", `/api/projects/${state.projectId}/issues`, { cookie: c, body: { flagKey, taskId: res.json.taskId, state: "rejected" } });
    assert.equal(d.status, 200, d.text);
  }
  res = await call("POST", `/api/tasks/${gate.id}/approve`, { cookie: c, body: { approved: true } });
  assert.equal(res.status, 200, res.text);
  assert.equal((await call("POST", `/api/tasks/${build.id}/run`, { cookie: c })).status, 200);
  project = (await call("GET", `/api/projects/${state.projectId}`, { cookie: c })).json;
  assert.deepEqual(project.tasks.map((t) => t.status), ["done", "done", "done", "done"]);
  const draftRuns = (await call("GET", `/api/tasks/${draft.id}/runs`, { cookie: c })).json;
  assert.equal(draftRuns.runs.length, 2);
  assert.equal(draftRuns.output, draftRuns.runs[1].output, "latest shown");
  const approved = project.events.find((e) => e.type === "approved");
  assert.equal(approved.payload.approver, "You");

  // The thread endpoint returns the run history; export waits for the final approval.
  const thread = await call("GET", `/api/projects/${state.projectId}/thread`, { cookie: c });
  assert.equal(thread.status, 200);
  assert.ok(thread.json.runs.length >= 5);
  assert.equal((await call("GET", `/api/projects/${state.projectId}/export`, { cookie: c })).status, 409);

  // Runs, thread and export are private.
  const stranger = await call("POST", "/api/auth/sign-up", { body: { email: `stranger-${run}@test.dev`, password: "password123", turnstileToken: "pass" }, from: ip(11) });
  assert.equal((await call("GET", `/api/tasks/${draft.id}/runs`, { cookie: stranger.cookie })).status, 404);
  assert.equal((await call("GET", `/api/projects/${state.projectId}/thread`, { cookie: stranger.cookie })).status, 404);
  assert.equal((await call("GET", `/api/projects/${state.projectId}/export`, { cookie: stranger.cookie })).status, 404);
});

test("P2. the project poll answers 304 while nothing changed, 200 when something did; reset is gone", async () => {
  const c = state.cookie;
  const first = await call("GET", `/api/projects/${state.projectId}`, { cookie: c });
  assert.equal(first.status, 200);
  const etag = first.headers.get("etag");
  assert.match(etag ?? "", /^W\/"p-[0-9a-f]{16}"$/);
  const again = await call("GET", `/api/projects/${state.projectId}`, { cookie: c, headers: { "if-none-match": etag } });
  assert.equal(again.status, 304, "unchanged -> 304");
  assert.equal(again.text, "", "no body on 304");
  // A brief edit changes the fingerprint.
  const patched = await call("PATCH", `/api/projects/${state.projectId}`, { cookie: c, body: { brief: `${first.json.brief} (edited)` } });
  assert.equal(patched.status, 200);
  const changed = await call("GET", `/api/projects/${state.projectId}`, { cookie: c, headers: { "if-none-match": etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("etag"), etag);
  // Someone else's ETag guess still gets 404, not 304.
  const stranger = await call("POST", "/api/auth/sign-up", { body: { email: `etag-${run}@test.dev`, password: "password123", turnstileToken: "pass" }, from: ip(12) });
  assert.equal((await call("GET", `/api/projects/${state.projectId}`, { cookie: stranger.cookie, headers: { "if-none-match": etag } })).status, 404);
  // The demo reset endpoint no longer exists.
  assert.equal((await call("POST", `/api/projects/${state.projectId}/reset`, { cookie: c })).status, 404);
});

test("P2b. the conditional poll still recovers a stuck run (and then reports a change)", async () => {
  const c = state.cookie;
  const research = state.tasks[0];
  const before = await call("GET", `/api/projects/${state.projectId}`, { cookie: c });
  const task = before.json.tasks.find((t) => t.id === research.id);
  sql(`UPDATE "Task" SET status='running', startedAt=? WHERE id=?`, new Date(Date.now() - 10 * 60 * 1000).toISOString().replace("Z", "+00:00"), research.id);
  const polled = await call("GET", `/api/projects/${state.projectId}`, { cookie: c, headers: { "if-none-match": before.headers.get("etag") } });
  assert.equal(polled.status, 200, "recovery is a change");
  assert.equal(polled.json.tasks.find((t) => t.id === research.id).status, "pending");
  assert.ok(polled.json.events.some((e) => e.taskId === research.id && e.payload?.reason === "stuck_run_reclaimed"));
  // Put it back the way the next test expects (it re-stages the stuck run itself).
  sql(`UPDATE "Task" SET status=?, startedAt=?, completedAt=?, output=? WHERE id=?`, task.status, task.startedAt ? task.startedAt.replace("Z", "+00:00") : null, task.completedAt ? task.completedAt.replace("Z", "+00:00") : null, task.output, research.id);
});

test("3. stuck running task is recovered on the next poll and can run again", async () => {
  const c = state.cookie;
  const research = state.tasks[0];
  sql(`UPDATE "Task" SET status='running', startedAt=? WHERE id=?`, new Date(Date.now() - 10 * 60 * 1000).toISOString().replace("Z", "+00:00"), research.id);
  const events = await call("GET", `/api/projects/${state.projectId}/events`, { cookie: c });
  assert.equal(events.status, 200);
  const recovery = events.json.find((e) => e.taskId === research.id && e.payload?.reason === "stuck_run_reclaimed");
  assert.ok(recovery, "recovery event on the poll");
  const project = (await call("GET", `/api/projects/${state.projectId}`, { cookie: c })).json;
  assert.equal(project.tasks.find((t) => t.id === research.id).status, "pending");
  assert.equal((await call("POST", `/api/tasks/${research.id}/run`, { cookie: c })).status, 200);
});

test("R1. forgot/reset pages are public; without an email sender the API says so (503) instead of pretending", async () => {
  for (const page of ["/forgot-password", "/reset-password"]) {
    const res = await call("GET", page);
    assert.equal(res.status, 200, page);
  }
  const signIn = await call("GET", "/sign-in");
  assert.match(signIn.text, /href="\/forgot-password"/);
  const res = await call("POST", "/api/auth/forgot", { body: { email: "someone@test.dev" }, from: ip(77) });
  assert.equal(res.status, 503);
  assert.equal(res.json.code, "email_off");
  const bad = await call("POST", "/api/auth/reset", { body: { token: "nope", password: "password123" }, from: ip(78) });
  assert.equal(bad.status, 400);
});

test("R2. landing: a session cookie sets the readable ariadne_in marker; signed out clears it", async () => {
  const signedIn = await call("GET", "/", { cookie: state.cookie });
  assert.match(signedIn.headers.get("set-cookie") ?? "", /ariadne_in=1/);
  const out = await call("GET", "/", { cookie: "ariadne_in=1" });
  assert.match(out.headers.get("set-cookie") ?? "", /ariadne_in=;/);
  assert.match(out.text, /data-when="in"/);
});
