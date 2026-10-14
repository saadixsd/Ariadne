// Pipeline acceptance tests at the lib level (run, approve, rerun, quota, recovery), against a throwaway SQLite DB
// built from migrations/0001 + 0002 (so this also proves the migrations produce a
// schema Prisma can use) and a mock LLM server (no real provider is ever called).
//
// Run: npx tsx --conditions=react-server --test tests/integration/pipeline.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { PrismaClient } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- plain JS helper
import { startMockLlm } from "./mock-llm.mjs";
import { createNodeSqliteAdapter } from "../../lib/node-sqlite";

type Mock = {
  url: string;
  state: { fail: boolean; calls: number; failures: number; lastBody: Record<string, Record<string, unknown>> };
  close: () => Promise<void>;
};

const root = path.resolve(__dirname, "../..");
const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "ariadne-sb-")), "test.db");
let mock: Mock;
let prisma: PrismaClient;

// Loaded after the DB and env are ready.
let agents: typeof import("../../lib/agents");
let project: typeof import("../../lib/project");
let usage: typeof import("../../lib/usage");
let reclaim: typeof import("../../lib/reclaim");
let starter: typeof import("../../lib/starter-thread");
let lineage: typeof import("../../lib/lineage");
let handoff: typeof import("../../lib/handoff-preview");
let liveTree: typeof import("../../lib/live-tree");
let notes: typeof import("../../lib/change-notes");
let limits: typeof import("../../lib/limits");

async function applyMigrations() {
  // @types/node 20 has no node:sqlite types; same dynamic import trick as lib/node-sqlite.ts.
  const loadSqlite = new Function("return import('node:sqlite')") as () => Promise<{
    DatabaseSync: new (file: string) => { exec(sql: string): void; close(): void };
  }>;
  const { DatabaseSync } = await loadSqlite();
  const db = new DatabaseSync(dbFile);
  for (const file of ["0001_baseline.sql", "0002_ship_blockers.sql", "0003_phase2.sql", "0004_invite_code.sql", "0005_attribution_feedback.sql", "0006_workspace.sql", "0007_r2_workflow_quota.sql", "0008_r2_budget.sql"]) {
    db.exec(readFileSync(path.join(root, "migrations", file), "utf8"));
  }
  db.close();
}

async function newUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "x", passwordSalt: "x", emailVerified: true },
  });
}

async function newProject(userId: string) {
  const id = await starter.createUserProject(userId, "Test project", "Build a landing page for a coffee cart.");
  const tasks = await prisma.task.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
  assert.equal(tasks.length, 4, "starter is Draft → Challenge → Judge → Tie Off writeup");
  const [draft, review, gate, build] = tasks;
  return { id, draft, review, gate, build };
}

async function runsFor(taskId: string) {
  return prisma.taskRun.findMany({ where: { taskId }, orderBy: { attempt: "asc" } });
}

async function runsToday(userId: string) {
  return usage.modelRunsToday(userId);
}

async function rejects(promise: Promise<unknown>, status: number, pattern?: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    const err = error as { status?: number; message?: string };
    assert.equal(err.status, status, `expected ${status}, got ${err.status}: ${err.message}`);
    if (pattern) assert.match(err.message ?? "", pattern);
    return true;
  });
}

before(async () => {
  await applyMigrations();
  mock = (await startMockLlm()) as Mock;
  process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";
  process.env.OPENAI_API_KEY = "test-not-a-real-key";
  process.env.ANTHROPIC_MODEL = "mock-claude";
  process.env.OPENAI_MODEL = "mock-gpt";
  process.env.ANTHROPIC_BASE_URL = mock.url;
  process.env.OPENAI_BASE_URL = `${mock.url}/v1`;
  prisma = new PrismaClient({ adapter: createNodeSqliteAdapter(dbFile) });
  (globalThis as unknown as { prisma?: PrismaClient }).prisma = prisma;

  agents = await import("../../lib/agents");
  project = await import("../../lib/project");
  usage = await import("../../lib/usage");
  reclaim = await import("../../lib/reclaim");
  starter = await import("../../lib/starter-thread");
  lineage = await import("../../lib/lineage");
  handoff = await import("../../lib/handoff-preview");
  liveTree = await import("../../lib/live-tree");
  notes = await import("../../lib/change-notes");
  limits = await import("../../lib/limits");
});

after(async () => {
  await prisma?.$disconnect();
  await mock?.close();
});

describe("3. stuck running recovery", () => {
  test("old running task is reclaimed on next read, with a recovery event, and becomes runnable", async () => {
    const user = await newUser("stuck@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.draft.id, user.id); // done, output kept
    const draftOutput = (await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } })).output;
    assert.ok(draftOutput);

    // Simulate a run that died mid-request 10 minutes ago: it had reserved a quota
    // unit and emitted "started" with its run id, then the request was cut off.
    const startedAt = new Date(Date.now() - 10 * 60 * 1000);
    await usage.reserveModelRun(user.id, usage.utcDay(startedAt));
    const quotaBefore = await runsToday(user.id);
    await prisma.task.update({ where: { id: p.review.id }, data: { status: "running", startedAt } });
    await prisma.activityEvent.create({
      data: { projectId: p.id, type: "started", message: "Maker started", taskId: p.review.id, runId: "dead-run-1", createdAt: new Date(startedAt.getTime() + 5) },
    });

    // A task that is running but young must NOT be reclaimed.
    await prisma.task.update({ where: { id: p.build.id }, data: { status: "running", startedAt: new Date(Date.now() - 60 * 1000) } });

    const dto = await project.getProject(p.id, user.id); // "next read"
    assert.ok(dto);
    const review = dto.tasks.find((t) => t.id === p.review.id)!;
    assert.equal(review.status, "pending", "stuck task back to pending");
    assert.equal(dto.tasks.find((t) => t.id === p.build.id)!.status, "running", "young run untouched");
    assert.equal(dto.tasks.find((t) => t.id === p.draft.id)!.output, draftOutput, "upstream work intact");

    const recovery = dto.events.find((e) => e.taskId === p.review.id && e.payload?.reason === "stuck_run_reclaimed");
    assert.ok(recovery, "recovery event emitted");
    assert.equal(recovery.type, "failed");
    assert.match(recovery.message, /Recovered "Fact-check the draft"/);
    assert.equal(recovery.runId, "dead-run-1");

    const rows = await runsFor(p.review.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].outcome, "reclaimed");
    assert.equal(rows[0].id, "dead-run-1");
    assert.ok(rows[0].error);

    assert.equal(await runsToday(user.id), quotaBefore - 1, "reclaimed run gave its quota back");

    // Reading again does not double-reclaim.
    await project.getEvents(p.id, user.id);
    assert.equal((await runsFor(p.review.id)).length, 1);

    // Runnable again.
    await prisma.task.update({ where: { id: p.build.id }, data: { status: "pending", startedAt: null } });
    const rerun = await agents.runTask(p.review.id, user.id);
    assert.equal(rerun.status, "done");
    assert.equal((await runsFor(p.review.id)).map((r) => r.outcome).join(","), "reclaimed,succeeded");
  });

  test("isStuck uses the 5-minute timeout", () => {
    const now = Date.now();
    assert.equal(limits.STUCK_RUN_TIMEOUT_MS, 5 * 60 * 1000);
    assert.equal(reclaim.isStuck({ id: "a", startedAt: new Date(now - 4 * 60 * 1000) }, now), false);
    assert.equal(reclaim.isStuck({ id: "a", startedAt: new Date(now - 6 * 60 * 1000) }, now), true);
  });
});

describe("quota: only successful runs count, increment is atomic", () => {
  test("failed run does not decrement the daily quota; success does", async () => {
    const user = await newUser("quota@test.dev");
    const p = await newProject(user.id);
    mock.state.fail = true;
    const callsBefore = mock.state.calls;
    await rejects(agents.runTask(p.draft.id, user.id), 502, /500|mock provider is down/);
    mock.state.fail = false;
    assert.equal(mock.state.calls - callsBefore, 2, "withOneRetry: two provider tries");
    assert.equal(await runsToday(user.id), 0, "failed run not charged");
    const failed = await runsFor(p.draft.id);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].outcome, "failed");
    assert.equal(failed[0].tries, 2);
    assert.ok(failed[0].error && failed[0].prompt, "failed row keeps prompt and error");
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } })).status, "failed");

    await agents.runTask(p.draft.id, user.id);
    assert.equal(await runsToday(user.id), 1, "successful run charged once");
  });

  test("workflow quota: the 11th workflow of the day is refused (429), task untouched, provider not called", async () => {
    const user = await newUser("limit@test.dev");
    const p = await newProject(user.id);
    for (let i = 0; i < limits.WORKFLOWS_PER_DAY; i++) {
      await prisma.workflow.create({ data: { userId: user.id, projectId: `other-${i}`, day: usage.utcDay(), runs: 3 } });
    }
    const callsBefore = mock.state.calls;
    await rejects(agents.runTask(p.draft.id, user.id), 429, /started 10 workflows today/);
    assert.equal(mock.state.calls, callsBefore);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } })).status, "pending");
    assert.equal(await runsToday(user.id), 0);
  });

  test("concurrent reservations never exceed the limit", async () => {
    const user = await newUser("race@test.dev");
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, () => usage.reserveModelRun(user.id)),
    );
    const unexpected = results.flatMap((r) =>
      r.status === "rejected" && (r.reason as { status?: number }).status !== 429 ? [String(r.reason).slice(-400)] : [],
    );
    assert.deepEqual(unexpected, [], "only quota rejections");
    assert.equal(results.filter((r) => r.status === "fulfilled").length, limits.DAILY_MODEL_RUNS);
    assert.equal(await runsToday(user.id), limits.DAILY_MODEL_RUNS);
  });

  test("workflow quota: runs inside one workflow count once; hidden rerun cap; approval closes it; failed first run is free", async () => {
    const user = await newUser("workflow@test.dev");
    const p = await newProject(user.id);
    mock.state.fail = true;
    await rejects(agents.runTask(p.draft.id, user.id), 502);
    mock.state.fail = false;
    assert.equal(await usage.workflowsStarted(user.id), 0, "a failed first run does not use a workflow");
    await agents.runTask(p.draft.id, user.id);
    await agents.runTask(p.review.id, user.id);
    await agents.rerunTask(p.review.id, user.id);
    await agents.steerTask(p.draft.id, "shorter", user.id);
    assert.equal(await usage.workflowsStarted(user.id), 1, "reruns and Intervene stay inside the workflow");
    assert.equal(await usage.workflowsLeft(user.id), limits.WORKFLOWS_PER_DAY - 1);
    const wf = await prisma.workflow.findFirstOrThrow({ where: { projectId: p.id } });
    assert.equal(wf.runs, 4);
    await prisma.workflow.update({ where: { id: wf.id }, data: { runs: limits.MAX_RUNS_PER_WORKFLOW } });
    const callsBefore = mock.state.calls;
    await rejects(agents.runTask(p.review.id, user.id), 429, /re-run many times/);
    assert.equal(mock.state.calls, callsBefore);
    await usage.closeWorkflow(p.id);
    await agents.runTask(p.review.id, user.id);
    assert.equal(await usage.workflowsStarted(user.id), 2, "after approval the next run starts a new workflow");
  });

  test("trial: concurrent reservations never exceed the first-day cap", async () => {
    const user = await newUser("trial-race@test.dev");
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => usage.reserveModelRun(user.id, usage.utcDay(), limits.dailyRunLimit(user))),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, limits.TRIAL_DAILY_MODEL_RUNS);
    assert.equal(await runsToday(user.id), limits.TRIAL_DAILY_MODEL_RUNS);
  });

  test("trial: invited accounts and accounts older than a day get the full allowance", async () => {
    const invited = await prisma.user.create({
      data: { email: "invited@test.dev", passwordHash: "x", passwordSalt: "x", emailVerified: true, inviteCode: "minotaur" },
    });
    assert.equal(limits.dailyRunLimit(invited), limits.DAILY_MODEL_RUNS);
    const now = Date.now();
    assert.equal(limits.dailyRunLimit({ createdAt: new Date(now - limits.TRIAL_PERIOD_MS + 60_000) }, now), limits.TRIAL_DAILY_MODEL_RUNS);
    assert.equal(limits.dailyRunLimit({ createdAt: new Date(now - limits.TRIAL_PERIOD_MS) }, now), limits.DAILY_MODEL_RUNS);
    assert.equal(limits.dailyRunLimit({ createdAt: new Date(now - limits.TRIAL_PERIOD_MS).toISOString() }, now), limits.DAILY_MODEL_RUNS);
    // A limit above the normal cap is clamped: the trial can only ever lower it.
    const user = await newUser("clamp@test.dev");
    await prisma.usageDay.create({ data: { userId: user.id, day: usage.utcDay(), runs: limits.DAILY_MODEL_RUNS } });
    await rejects(usage.reserveModelRun(user.id, usage.utcDay(), 999), 429, /Daily limit of 10/);
  });
});

describe("site-wide daily ceiling and output caps", () => {
  async function fillSite(runs: number) {
    const filler = await newUser(`filler-${runs}-${Date.now()}@test.dev`);
    // Whatever other tests already used today counts toward the site total too.
    const used = (await prisma.usageDay.aggregate({ where: { day: usage.utcDay() }, _sum: { runs: true } }))._sum.runs ?? 0;
    await prisma.usageDay.create({ data: { userId: filler.id, day: usage.utcDay(), runs: runs - used } });
    return () => prisma.usageDay.deleteMany({ where: { userId: filler.id } });
  }

  test("site total at the ceiling: 503, nothing sent, task and the user's own quota untouched", async () => {
    const cleanup = await fillSite(limits.SITE_DAILY_MODEL_RUNS);
    try {
      const user = await newUser("site-cap@test.dev");
      const p = await newProject(user.id);
      const callsBefore = mock.state.calls;
      await rejects(agents.runTask(p.draft.id, user.id), 503, /spun all 200 runs .* nothing was sent to Claude or GPT/);
      assert.equal(mock.state.calls, callsBefore, "provider not called");
      assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } })).status, "pending");
      assert.equal(await runsToday(user.id), 0, "the refused run gave its reservation back");
      // The knot is not a model run, so it still opens when the site is at the ceiling.
      await prisma.task.updateMany({ where: { id: { in: [p.draft.id, p.review.id] } }, data: { status: "done", output: "x" } });
      assert.equal((await agents.runTask(p.gate.id, user.id)).status, "awaiting_approval");
    } finally {
      await cleanup();
    }
  });

  test("one run below the ceiling: the last run fits, the next is refused", async () => {
    const cleanup = await fillSite(limits.SITE_DAILY_MODEL_RUNS - 1);
    try {
      const user = await newUser("site-edge@test.dev");
      const p = await newProject(user.id);
      assert.equal((await agents.runTask(p.draft.id, user.id)).status, "done");
      await rejects(agents.runTask(p.review.id, user.id), 503);
      assert.equal(await runsToday(user.id), 1);
    } finally {
      await cleanup();
    }
  });

  test("the per-account cap still answers first (429) when both are used up", async () => {
    const cleanup = await fillSite(limits.SITE_DAILY_MODEL_RUNS);
    try {
      const user = await newUser("both-caps@test.dev");
      const p = await newProject(user.id);
      for (let i = 0; i < limits.WORKFLOWS_PER_DAY; i++) {
        await prisma.workflow.create({ data: { userId: user.id, projectId: `both-${i}`, day: usage.utcDay(), runs: 3 } });
      }
      await rejects(agents.runTask(p.draft.id, user.id), 429, /workflows today/);
    } finally {
      await cleanup();
      await prisma.usageDay.deleteMany({ where: { user: { email: "both-caps@test.dev" } } });
    }
  });

  test("provider calls carry output caps (Claude 8,192; GPT 16,384 including reasoning)", async () => {
    const user = await newUser("token-caps@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.draft.id, user.id); // Odysseus (the Drafter) -> Anthropic
    await agents.runTask(p.review.id, user.id); // Daedalus (the Challenger) -> OpenAI
    assert.equal(mock.state.lastBody.anthropic.max_tokens, limits.MAX_OUTPUT_TOKENS_ANTHROPIC);
    assert.equal(mock.state.lastBody.openai.max_output_tokens ?? mock.state.lastBody.openai.max_completion_tokens, limits.MAX_OUTPUT_TOKENS_OPENAI);
    assert.deepEqual(mock.state.lastBody.openai.tools, [{ type: "web_search" }], "Daedalus fact-checks with web search");
    assert.equal(limits.MAX_OUTPUT_TOKENS_ANTHROPIC, 8192);
    assert.equal(limits.MAX_OUTPUT_TOKENS_OPENAI, 16384);
  });
});

describe("4. immutable run history", () => {
  test("rerun twice: a TaskRun row per attempt, all outputs retrievable, latest shown", async () => {
    const user = await newUser("rerun@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.draft.id, user.id);
    await agents.rerunTask(p.draft.id, user.id);
    await agents.rerunTask(p.draft.id, user.id);
    const rows = await runsFor(p.draft.id);
    assert.equal(rows.length, 3, "initial run + 2 reruns");
    assert.deepEqual(rows.map((r) => r.attempt), [1, 2, 3]);
    assert.ok(rows.every((r) => r.outcome === "succeeded" && r.output && r.prompt && r.systemPrompt && r.model === "mock-claude"));
    assert.equal(new Set(rows.map((r) => r.output)).size, 3, "three distinct outputs kept");
    assert.ok(rows.every((r) => typeof r.latencyMs === "number" && r.startedAt && r.completedAt));
    const task = await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } });
    assert.equal(task.output, rows[2].output, "task.output = latest run");
    const events = await prisma.activityEvent.findMany({ where: { taskId: p.draft.id, type: "completed" } });
    assert.deepEqual(new Set(events.map((e) => e.runId)), new Set(rows.map((r) => r.id)), "completed events point at their run");
  });

  test("output written before TaskRun existed is preserved as a legacy row on rerun", async () => {
    const user = await newUser("legacy@test.dev");
    const p = await newProject(user.id);
    await prisma.task.update({
      where: { id: p.draft.id },
      data: { status: "done", output: "LEGACY OUTPUT", model: "old-model", completedAt: new Date() },
    });
    await agents.rerunTask(p.draft.id, user.id);
    const rows = await runsFor(p.draft.id);
    assert.equal(rows[0].outcome, "legacy");
    assert.equal(rows[0].output, "LEGACY OUTPUT");
    assert.equal(rows[1].outcome, "succeeded");
  });

  test("request changes: prior outputs stay as rows, note appended, cap enforced", async () => {
    const user = await newUser("changes@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.draft.id, user.id);
    await agents.runTask(p.review.id, user.id); // opens the human gate automatically
    const gate = await prisma.task.findUniqueOrThrow({ where: { id: p.gate.id } });
    assert.equal(gate.status, "awaiting_approval");
    const before = {
      draft: (await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } })).output,
      review: (await prisma.task.findUniqueOrThrow({ where: { id: p.review.id } })).output,
      gate: gate.output,
    };

    await rejects(agents.decideTask(p.gate.id, false, "x".repeat(limits.MAX_NOTE_CHARS + 1), user.id), 400, /Note is too long/);

    await agents.decideTask(p.gate.id, false, "Make the hero shorter.", user.id);
    for (const [key, id] of [["draft", p.draft.id], ["review", p.review.id], ["gate", p.gate.id]] as const) {
      const task = await prisma.task.findUniqueOrThrow({ where: { id } });
      assert.equal(task.status, "pending", `${key} invalidated`);
      const rows = await runsFor(id);
      assert.ok(rows.length >= 1, `${key} has history`);
      assert.equal(rows.at(-1)!.output, before[key], `${key} prior output preserved as a row`);
    }
    const draft = await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } });
    assert.match(draft.instructions, /Human requested changes: Make the hero shorter\.$/);
    const note = await prisma.activityEvent.findFirstOrThrow({ where: { taskId: p.gate.id, type: "note" }, orderBy: { createdAt: "desc" } });
    const payload = JSON.parse(note.payload ?? "{}");
    assert.equal(payload.decision, "changes_requested");
    assert.equal(payload.note, "Make the hero shorter.");
    assert.deepEqual(payload.rootTaskIds, [p.draft.id]);

    // Rerun the root: new rows are added, old ones untouched.
    await agents.runTask(p.draft.id, user.id);
    const draftRows = await runsFor(p.draft.id);
    assert.equal(draftRows.length, 2);
    assert.equal(draftRows[0].output, before.draft);
    assert.match(draftRows[1].prompt ?? "", /Make the hero shorter/);
  });

  test("request-changes instructions stay bounded over many rounds", () => {
    let instructions = "Write the copy.";
    for (let round = 1; round <= 20; round++) {
      instructions = notes.appendChangeNote(instructions, `${round}:${"n".repeat(limits.MAX_NOTE_CHARS - 5)}`);
      assert.ok(instructions.length <= limits.MAX_ACCUMULATED_INSTRUCTIONS_CHARS, `round ${round} within cap`);
      assert.ok(instructions.startsWith("Write the copy."), "base instructions kept");
      assert.equal(notes.latestChangeNote(instructions)?.startsWith(`${round}:`), true, "newest note kept");
    }
    const huge = notes.appendChangeNote("b".repeat(9000), "latest");
    assert.ok(huge.length <= limits.MAX_ACCUMULATED_INSTRUCTIONS_CHARS);
    assert.equal(notes.latestChangeNote(huge), "latest");
  });
});

describe("5. structured events", () => {
  test("handoff events carry fromTaskId/toTaskId/runId/payload and the UI parsers read them", async () => {
    const user = await newUser("events@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.draft.id, user.id);
    await agents.runTask(p.review.id, user.id);
    const dto = (await project.getProject(p.id, user.id))!;
    const hand = dto.events.find((e) => e.type === "handoff" && e.taskId === p.review.id)!;
    assert.equal(hand.fromTaskId, p.draft.id);
    assert.equal(hand.toTaskId, p.review.id);
    const reviewRun = (await runsFor(p.review.id))[0];
    assert.equal(hand.runId, reviewRun.id);
    assert.equal(hand.payload?.fromAgent, "Odysseus");
    assert.equal(hand.message, 'Handoff: Odysseus handed "Draft the answer" to Daedalus', "human-readable message still written");

    // Prove the parser ignores the message: garble it and keep the columns.
    const parsed = handoff.handoffFromEvent({ ...hand, message: "garbled" } as typeof hand, dto.tasks, dto.agents);
    assert.deepEqual(parsed, { fromTaskId: p.draft.id, toTaskId: p.review.id, from: "Odysseus", title: "Draft the answer", to: "Daedalus" });
    // Columns without payload (e.g. partially backfilled) fall back to task/agent rows.
    const bare = handoff.handoffFromEvent({ ...hand, payload: null }, dto.tasks, dto.agents);
    assert.equal(bare?.from, "Odysseus");
    // Payloads written before the rename still read as the new names.
    const legacy = handoff.handoffFromEvent({ ...hand, payload: { fromAgent: "Scout", toAgent: "Maker", fromTitle: "Research the brief" } }, dto.tasks, dto.agents);
    assert.equal(legacy?.from, "Odysseus");
    assert.equal(legacy?.to, "Daedalus");
    // Old unstructured event -> null (UI shows plain message as before).
    assert.equal(handoff.handoffFromEvent({ ...hand, fromTaskId: null, payload: null }, dto.tasks, dto.agents), null);
  });

  test("lineage approval reads the payload, not the message", async () => {
    const user = await newUser("lineage@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.draft.id, user.id);
    await agents.runTask(p.review.id, user.id);
    await agents.decideTask(p.gate.id, true, undefined, user.id);
    const dto = (await project.getProject(p.id, user.id))!;
    const steps = lineage.buildLineage(dto, p.gate.id)!;
    const gateNode = steps.at(-1)!.node;
    assert.equal(gateNode.kind, "decision");
    assert.equal(gateNode.kind === "decision" ? gateNode.approval?.approver : null, "You");
    const garbled = { ...dto, events: dto.events.map((e) => ({ ...e, message: "garbled" })) };
    const again = lineage.buildLineage(garbled, p.gate.id)!.at(-1)!.node;
    assert.equal(again.kind === "decision" ? again.approval?.approver : null, "You");
  });

  test("the two UI parsers contain no regex over event message text", () => {
    for (const file of ["lib/handoff-preview.ts", "lib/lineage.ts"]) {
      const source = readFileSync(path.join(root, file), "utf8");
      assert.doesNotMatch(source, /message\.(match|replace|split|search)\(|\.test\([^)]*message/, file);
      assert.doesNotMatch(source, /parseHandoffMessage/, file);
    }
  });
});

describe("per-step Intervene (steer)", () => {
  test("note lands in instructions and the step re-runs with it in the prompt", async () => {
    const user = await newUser("steer@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.draft.id, user.id);
    const before = (await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } })).instructions;
    const steered = await agents.steerTask(p.draft.id, "Challenge I raise: Fund X — unsupported", user.id);
    assert.equal(steered.status, "done");
    const draft = await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } });
    assert.match(draft.instructions, /Human requested changes: Challenge I raise: Fund X — unsupported/);
    assert.ok(draft.instructions.startsWith(before) || draft.instructions.includes(before.slice(0, 40)));
    const rows = await runsFor(p.draft.id);
    assert.ok(rows.length >= 2, "original run + steer re-run");
    assert.match(rows.at(-1)!.prompt ?? "", /Challenge I raise: Fund X/);
    // Downstream challenge was cleared then left pending (only the steered step re-ran).
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: p.review.id } })).status, "pending");
  });

  test("pending step only stores the note until Run", async () => {
    const user = await newUser("steer-pending@test.dev");
    const p = await newProject(user.id);
    const steered = await agents.steerTask(p.draft.id, "Correction: A → B", user.id);
    assert.equal(steered.status, "pending");
    const draft = await prisma.task.findUniqueOrThrow({ where: { id: p.draft.id } });
    assert.match(draft.instructions, /Human requested changes: Correction: A → B/);
    assert.equal(await runsToday(user.id), 0);
  });
});

describe("existing board + tree flow", () => {
  test("full 4-step flow end to end: draft, challenge, auto-gate, approve, writeup; tree + lineage render", async () => {
    const user = await newUser("flow@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.draft.id, user.id);
    await rejects(agents.runTask(p.build.id, user.id), 409, /Dependencies are not done/);
    await agents.runTask(p.review.id, user.id);
    await rejects(agents.runTask(p.gate.id, user.id), 409, /awaiting approval/);
    await agents.decideTask(p.gate.id, true, undefined, user.id);
    const built = await agents.runTask(p.build.id, user.id);
    assert.equal(built.status, "done");
    const dto = (await project.getProject(p.id, user.id))!;
    assert.deepEqual(dto.tasks.map((t) => t.status), ["done", "done", "done", "done"]);
    assert.ok(dto.agents.every((a) => a.status === "done"));
    assert.equal(await runsToday(user.id), 3, "3 model runs, gate is free");
    const types = dto.events.map((e) => e.type);
    for (const type of ["started", "handoff", "completed", "approval_requested", "approved"]) assert.ok(types.includes(type), type);
    const tree = liveTree.workflowTree(dto);
    assert.ok(tree.nodes.length >= 4);
    assert.ok(lineage.buildLineage(dto, p.build.id)!.length >= 5);
    // Another user cannot read or run it.
    const stranger = await newUser("stranger@test.dev");
    assert.equal(await project.getProject(p.id, stranger.id), null);
    await rejects(agents.runTask(p.draft.id, stranger.id), 404);
  });
});

describe("workspace journey (Oct 14): sources → Draft → Challenge → decisions → Revise → Tie Off → Approve → feedback", () => {
  test("whole journey through lib functions, with the agent path unchanged", async () => {
    const ws = await import("../../lib/workspace-server");
    const pure = await import("../../lib/workspace");
    const user = await newUser("journey@example.com");
    const { id, draft, review, gate, build } = await newProject(user.id);

    // Sources: browser-extracted text, saved, and fed into every step's shared context.
    const store = (await import("../../lib/file-store")).memoryStore();
    (globalThis as { __ariadneFileStore?: unknown }).__ariadneFileStore = store;
    const added = await ws.addSources(id, user.id, [{ name: "paper.md", mime: "text/markdown", bytes: 20, text: "The effect size was 0.4 (n=12)." }]);
    assert.equal(added.length, 1);
    // Original kept in R2 under the owner's prefix, for 3 days; a stranger cannot store or read it.
    const kept = await ws.storeOriginal(id, user.id, added[0].id, new TextEncoder().encode("# paper").buffer as ArrayBuffer, "text/markdown");
    assert.ok(kept.kept && new Date(kept.expiresAt).getTime() - Date.now() > 2.9 * 86400_000);
    assert.deepEqual(store.keys(), [`u/${user.id}/${id}/${added[0].id}`]);
    assert.equal((await ws.readOriginal(id, user.id, added[0].id))?.size, 7);
    const strangerPeek = await newUser("peek@example.com");
    await rejects(ws.readOriginal(id, strangerPeek.id, added[0].id), 404);
    await prisma.sourceFile.update({ where: { id: added[0].id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await ws.readOriginal(id, user.id, added[0].id), null, "expired originals are not offered");
    assert.equal((await ws.loadWorkspace(id, user.id))!.sources[0].originalUntil, null);
    await rejects(ws.addSources(id, user.id, [{ name: "big.md", text: "x".repeat(40_001) }]), 400, /too long/);

    // Free-tier guards: each cap behaves like no bucket (text kept, original not), never throws.
    const budget = await import("../../lib/r2-budget");
    const more = await ws.addSources(id, user.id, [
      { name: "huge.pdf", text: "huge" },
      { name: "b.md", text: "b" },
      { name: "c.md", text: "c" },
    ]);
    const tooBig = new ArrayBuffer(budget.MAX_ORIGINAL_BYTES + 1);
    assert.deepEqual(await ws.storeOriginal(id, user.id, more[0].id, tooBig, "application/pdf"), { kept: false, reason: "too_large" });
    await prisma.sourceFile.update({ where: { id: added[0].id }, data: { expiresAt: new Date(Date.now() + 86400_000), blobBytes: budget.USER_ORIGINAL_BYTES - 5 } });
    assert.deepEqual(await ws.storeOriginal(id, user.id, more[1].id, new ArrayBuffer(10), "text/markdown"), { kept: false, reason: "user_full" });
    await prisma.sourceFile.update({ where: { id: added[0].id }, data: { blobBytes: 7 } });
    const bigUser = await newUser("bulk@example.com");
    const bulk = await prisma.project.create({ data: { userId: bigUser.id, name: "bulk", brief: "b" } });
    await prisma.sourceFile.create({ data: { projectId: bulk.id, name: "x", text: "x", blobKey: `u/${bigUser.id}/${bulk.id}/x`, expiresAt: new Date(Date.now() + 86400_000), blobBytes: budget.SITE_ORIGINAL_BYTES } });
    assert.deepEqual(await ws.storeOriginal(id, user.id, more[1].id, new ArrayBuffer(10), "text/markdown"), { kept: false, reason: "site_full" });
    await prisma.project.delete({ where: { id: bulk.id } });
    const day = new Date().toISOString().slice(0, 10);
    await prisma.r2Day.upsert({ where: { day }, create: { day, writes: budget.SITE_DAILY_R2_WRITES }, update: { writes: budget.SITE_DAILY_R2_WRITES } });
    assert.deepEqual(await ws.storeOriginal(id, user.id, more[1].id, new ArrayBuffer(10), "text/markdown"), { kept: false, reason: "daily_writes" });
    assert.equal((await prisma.r2Day.findUniqueOrThrow({ where: { day } })).writes, budget.SITE_DAILY_R2_WRITES, "a refused write is given back");
    await prisma.r2Day.update({ where: { day }, data: { writes: 0 } });
    const ok = await ws.storeOriginal(id, user.id, more[1].id, new ArrayBuffer(10), "text/markdown");
    assert.equal(ok.kept, true);
    assert.equal((await prisma.r2Day.findUniqueOrThrow({ where: { day } })).writes, 1);
    assert.deepEqual(await ws.storeOriginal(id, user.id, more[1].id, new ArrayBuffer(10), "text/markdown"), { kept: false, reason: "failed" }, "never rewritten");
    const failing = { ...store, put: async () => { throw new Error("R2 down"); } };
    (globalThis as { __ariadneFileStore?: unknown }).__ariadneFileStore = failing;
    assert.deepEqual(await ws.storeOriginal(id, user.id, more[2].id, new ArrayBuffer(10), "text/markdown"), { kept: false, reason: "failed" });
    assert.equal((await prisma.r2Day.findUniqueOrThrow({ where: { day } })).writes, 1, "a failed put gives its write back");
    (globalThis as { __ariadneFileStore?: unknown }).__ariadneFileStore = store;
    await ws.removeSource(id, user.id, more[1].id);
    await ws.removeSource(id, user.id, more[0].id);
    await ws.removeSource(id, user.id, more[2].id);
    assert.deepEqual(store.keys(), [`u/${user.id}/${id}/${added[0].id}`]);
    const other = await newUser("intruder@example.com");
    await rejects(ws.addSources(id, other.id, [{ name: "a.md", text: "a" }]), 404);

    await agents.runTask(draft.id, user.id);
    const sentToClaude = JSON.stringify(mock.state.lastBody.anthropic);
    assert.match(sentToClaude, /Source: paper\.md/);
    assert.match(sentToClaude, /effect size was 0\.4/);
    await agents.runTask(review.id, user.id); // the Judge gate opens by itself after Challenge

    let data = (await ws.loadWorkspace(id, user.id))!;
    let steps = pure.threadSteps(data.project);
    assert.equal(steps.judge?.status, "awaiting_approval");
    assert.equal(pure.docState(steps, null), "challenged");
    let issues = pure.issuesFrom(steps.challenge!.output, data.decisions);
    assert.ok(issues.length >= 2, "mock challenge parses into issues");

    // Decisions persist; Undo deletes; a stranger cannot decide.
    await ws.decideIssue(id, user.id, { flagKey: issues[0].key, taskId: review.id, state: "accepted" });
    await ws.decideIssue(id, user.id, { flagKey: issues[1].key, taskId: review.id, state: "edited", edit: "Say n=12 is small." });
    await rejects(ws.decideIssue(id, user.id, { flagKey: issues[1].key, taskId: review.id, state: "edited" }), 400);
    await rejects(ws.decideIssue(id, other.id, { flagKey: issues[0].key, taskId: review.id, state: "accepted" }), 404);
    data = (await ws.loadWorkspace(id, user.id))!;
    issues = pure.issuesFrom(pure.threadSteps(data.project).challenge!.output, data.decisions);
    assert.deepEqual(issues.slice(0, 2).map((i) => i.state).sort(), ["accepted", "edited"]);

    // Approving before Tie Off is refused.
    await rejects(ws.approveDeliverable(id, user.id, "x"), 409, /Tie off first/);

    // Revise with accepted issues = the existing Ask-for-changes path (no model call here).
    const callsBefore = mock.state.calls;
    const note = pure.reviseNote(issues);
    assert.match(note, /use my correction: Say n=12 is small/);
    await agents.decideTask(gate.id, false, note, user.id);
    assert.equal(mock.state.calls, callsBefore, "Revise itself runs nothing");
    const cleared = await prisma.task.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(cleared.status, "pending");
    assert.match(cleared.instructions, /use my correction/);

    await agents.runTask(draft.id, user.id);
    await agents.runTask(review.id, user.id); // the Judge gate opens by itself after Challenge
    data = (await ws.loadWorkspace(id, user.id))!;
    assert.equal(pure.docState(pure.threadSteps(data.project), null), "challenged");
    await agents.decideTask(gate.id, true, undefined, user.id);
    await agents.runTask(build.id, user.id);

    data = (await ws.loadWorkspace(id, user.id))!;
    steps = pure.threadSteps(data.project);
    assert.equal(pure.docState(steps, null), "tied_off");
    assert.equal(data.promptFeedback, false);
    const doc = pure.documentOf(steps);
    await rejects(ws.approveDeliverable(id, user.id, "stale"), 409, /changed/);
    const approved = await ws.approveDeliverable(id, user.id, pure.hashText(doc.text!));
    assert.equal(approved.promptFeedback, true, "first approved deliverable prompts feedback once");
    data = (await ws.loadWorkspace(id, user.id))!;
    assert.equal(pure.docState(pure.threadSteps(data.project), data.approvedHash), "approved");
    assert.deepEqual(pure.nextAction(pure.threadSteps(data.project), true), { kind: "done" });

    await prisma.user.update({ where: { id: user.id }, data: { feedbackPromptAt: new Date() } });
    assert.equal((await ws.loadWorkspace(id, user.id))!.promptFeedback, false);

    // Admin outcomes: this account started, was challenged and approved; nothing abandoned.
    const outcome = (await (await import("../../lib/outcomes-server")).workflowOutcomes()).find((o) => o.userId === user.id)!;
    assert.ok(outcome.started >= 1);
    assert.equal(outcome.challenged, 1);
    assert.equal(outcome.approved, 1);
    assert.equal(outcome.abandoned, 0);
    const later = (await (await import("../../lib/outcomes-server")).workflowOutcomes(Date.now() + 3 * 86400_000)).find((o) => o.userId === user.id)!;
    assert.equal(later.abandoned, 0, "an approved project is never counted as abandoned");

    // Deleting the project removes its originals, sources and decisions.
    await ws.deleteProjectOriginals(id, user.id);
    assert.deepEqual(store.keys(), []);
    delete (globalThis as { __ariadneFileStore?: unknown }).__ariadneFileStore;
    await prisma.project.delete({ where: { id } });
    assert.equal(await prisma.sourceFile.count({ where: { projectId: id } }), 0);
    assert.equal(await prisma.issueDecision.count({ where: { projectId: id } }), 0);
  });
});
