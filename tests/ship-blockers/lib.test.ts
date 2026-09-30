// Ship-blockers acceptance tests at the lib level, against a throwaway SQLite DB
// built from migrations/0001 + 0002 (so this also proves the migrations produce a
// schema Prisma can use) and a mock LLM server (no real provider is ever called).
//
// Run: npx tsx --conditions=react-server --test tests/ship-blockers/lib.test.ts
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

type Mock = { url: string; state: { fail: boolean; calls: number; failures: number }; close: () => Promise<void> };

const root = path.resolve(__dirname, "../..");
const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "ariadne-sb-")), "test.db");
let mock: Mock;
let prisma: PrismaClient;

// Loaded after the DB and env are ready.
let agents: typeof import("../../lib/agents");
let project: typeof import("../../lib/project");
let usage: typeof import("../../lib/usage");
let reclaim: typeof import("../../lib/reclaim");
let demo: typeof import("../../lib/demo");
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
  for (const file of ["0001_baseline.sql", "0002_ship_blockers.sql"]) {
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
  const id = await demo.createUserProject(userId, "Test project", "Build a landing page for a coffee cart.");
  const tasks = await prisma.task.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } });
  const [research, draft, review, gate, build] = tasks;
  return { id, research, draft, review, gate, build };
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
  demo = await import("../../lib/demo");
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
    await agents.runTask(p.research.id, user.id); // done, output kept
    const researchOutput = (await prisma.task.findUniqueOrThrow({ where: { id: p.research.id } })).output;
    assert.ok(researchOutput);

    // Simulate a run that died mid-request 10 minutes ago: it had reserved a quota
    // unit and emitted "started" with its run id, then the request was cut off.
    const startedAt = new Date(Date.now() - 10 * 60 * 1000);
    await usage.reserveModelRun(user.id, usage.utcDay(startedAt));
    const quotaBefore = await runsToday(user.id);
    await prisma.task.update({ where: { id: p.draft.id }, data: { status: "running", startedAt } });
    await prisma.activityEvent.create({
      data: { projectId: p.id, type: "started", message: "Maker started", taskId: p.draft.id, runId: "dead-run-1", createdAt: new Date(startedAt.getTime() + 5) },
    });

    // A task that is running but young must NOT be reclaimed.
    await prisma.task.update({ where: { id: p.build.id }, data: { status: "running", startedAt: new Date(Date.now() - 60 * 1000) } });

    const dto = await project.getProject(p.id, user.id); // "next read"
    assert.ok(dto);
    const draft = dto.tasks.find((t) => t.id === p.draft.id)!;
    assert.equal(draft.status, "pending", "stuck task back to pending");
    assert.equal(dto.tasks.find((t) => t.id === p.build.id)!.status, "running", "young run untouched");
    assert.equal(dto.tasks.find((t) => t.id === p.research.id)!.output, researchOutput, "upstream work intact");

    const recovery = dto.events.find((e) => e.taskId === p.draft.id && e.payload?.reason === "stuck_run_reclaimed");
    assert.ok(recovery, "recovery event emitted");
    assert.equal(recovery.type, "failed");
    assert.match(recovery.message, /Recovered "Draft from the brief"/);
    assert.equal(recovery.runId, "dead-run-1");

    const rows = await runsFor(p.draft.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].outcome, "reclaimed");
    assert.equal(rows[0].id, "dead-run-1");
    assert.ok(rows[0].error);

    assert.equal(await runsToday(user.id), quotaBefore - 1, "reclaimed run gave its quota back");

    // Reading again does not double-reclaim.
    await project.getEvents(p.id, user.id);
    assert.equal((await runsFor(p.draft.id)).length, 1);

    // Runnable again.
    await prisma.task.update({ where: { id: p.build.id }, data: { status: "pending", startedAt: null } });
    const rerun = await agents.runTask(p.draft.id, user.id);
    assert.equal(rerun.status, "done");
    assert.equal((await runsFor(p.draft.id)).map((r) => r.outcome).join(","), "reclaimed,succeeded");
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
    await rejects(agents.runTask(p.research.id, user.id), 502, /500|mock provider is down/);
    mock.state.fail = false;
    assert.equal(mock.state.calls - callsBefore, 2, "withOneRetry: two provider tries");
    assert.equal(await runsToday(user.id), 0, "failed run not charged");
    const failed = await runsFor(p.research.id);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].outcome, "failed");
    assert.equal(failed[0].tries, 2);
    assert.ok(failed[0].error && failed[0].prompt, "failed row keeps prompt and error");
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: p.research.id } })).status, "failed");

    await agents.runTask(p.research.id, user.id);
    assert.equal(await runsToday(user.id), 1, "successful run charged once");
  });

  test("used-up quota: 429, task untouched, provider not called", async () => {
    const user = await newUser("limit@test.dev");
    const p = await newProject(user.id);
    await prisma.usageDay.create({ data: { userId: user.id, day: usage.utcDay(), runs: limits.DAILY_MODEL_RUNS } });
    const callsBefore = mock.state.calls;
    await rejects(agents.runTask(p.research.id, user.id), 429, /Daily limit/);
    assert.equal(mock.state.calls, callsBefore);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: p.research.id } });
    assert.equal(task.status, "pending");
    assert.equal(await runsToday(user.id), limits.DAILY_MODEL_RUNS);
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
});

describe("4. immutable run history", () => {
  test("rerun twice: a TaskRun row per attempt, all outputs retrievable, latest shown", async () => {
    const user = await newUser("rerun@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.research.id, user.id);
    await agents.rerunTask(p.research.id, user.id);
    await agents.rerunTask(p.research.id, user.id);
    const rows = await runsFor(p.research.id);
    assert.equal(rows.length, 3, "initial run + 2 reruns");
    assert.deepEqual(rows.map((r) => r.attempt), [1, 2, 3]);
    assert.ok(rows.every((r) => r.outcome === "succeeded" && r.output && r.prompt && r.systemPrompt && r.model === "mock-claude"));
    assert.equal(new Set(rows.map((r) => r.output)).size, 3, "three distinct outputs kept");
    assert.ok(rows.every((r) => typeof r.latencyMs === "number" && r.startedAt && r.completedAt));
    const task = await prisma.task.findUniqueOrThrow({ where: { id: p.research.id } });
    assert.equal(task.output, rows[2].output, "task.output = latest run");
    const events = await prisma.activityEvent.findMany({ where: { taskId: p.research.id, type: "completed" } });
    assert.deepEqual(new Set(events.map((e) => e.runId)), new Set(rows.map((r) => r.id)), "completed events point at their run");
  });

  test("output written before TaskRun existed is preserved as a legacy row on rerun", async () => {
    const user = await newUser("legacy@test.dev");
    const p = await newProject(user.id);
    await prisma.task.update({
      where: { id: p.research.id },
      data: { status: "done", output: "LEGACY OUTPUT", model: "old-model", completedAt: new Date() },
    });
    await agents.rerunTask(p.research.id, user.id);
    const rows = await runsFor(p.research.id);
    assert.equal(rows[0].outcome, "legacy");
    assert.equal(rows[0].output, "LEGACY OUTPUT");
    assert.equal(rows[1].outcome, "succeeded");
  });

  test("request changes: prior outputs stay as rows, note appended, cap enforced", async () => {
    const user = await newUser("changes@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.research.id, user.id);
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
    await agents.runTask(p.research.id, user.id);
    await agents.runTask(p.draft.id, user.id);
    const dto = (await project.getProject(p.id, user.id))!;
    const hand = dto.events.find((e) => e.type === "handoff" && e.taskId === p.draft.id)!;
    assert.equal(hand.fromTaskId, p.research.id);
    assert.equal(hand.toTaskId, p.draft.id);
    const draftRun = (await runsFor(p.draft.id))[0];
    assert.equal(hand.runId, draftRun.id);
    assert.equal(hand.payload?.fromAgent, "Scout");
    assert.equal(hand.message, 'Handoff: Scout handed "Research the brief" to Maker', "human-readable message still written");

    // Prove the parser ignores the message: garble it and keep the columns.
    const parsed = handoff.handoffFromEvent({ ...hand, message: "garbled" } as typeof hand, dto.tasks, dto.agents);
    assert.deepEqual(parsed, { fromTaskId: p.research.id, toTaskId: p.draft.id, from: "Scout", title: "Research the brief", to: "Maker" });
    // Columns without payload (e.g. partially backfilled) fall back to task/agent rows.
    const bare = handoff.handoffFromEvent({ ...hand, payload: null }, dto.tasks, dto.agents);
    assert.equal(bare?.from, "Scout");
    // Old unstructured event -> null (UI shows plain message as before).
    assert.equal(handoff.handoffFromEvent({ ...hand, fromTaskId: null, payload: null }, dto.tasks, dto.agents), null);
  });

  test("lineage approval reads the payload, not the message", async () => {
    const user = await newUser("lineage@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.research.id, user.id);
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

describe("existing board + tree flow", () => {
  test("full 5-step flow end to end: run, auto-gate, approve, build; tree + lineage render", async () => {
    const user = await newUser("flow@test.dev");
    const p = await newProject(user.id);
    await agents.runTask(p.research.id, user.id);
    await agents.runTask(p.draft.id, user.id);
    await rejects(agents.runTask(p.build.id, user.id), 409, /Dependencies are not done/);
    await agents.runTask(p.review.id, user.id);
    await rejects(agents.runTask(p.gate.id, user.id), 409, /awaiting approval/);
    await agents.decideTask(p.gate.id, true, undefined, user.id);
    const built = await agents.runTask(p.build.id, user.id);
    assert.equal(built.status, "done");
    const dto = (await project.getProject(p.id, user.id))!;
    assert.deepEqual(dto.tasks.map((t) => t.status), ["done", "done", "done", "done", "done"]);
    assert.ok(dto.agents.every((a) => a.status === "done"));
    assert.equal(await runsToday(user.id), 4, "4 model runs, gate is free");
    const types = dto.events.map((e) => e.type);
    for (const type of ["started", "handoff", "completed", "approval_requested", "approved"]) assert.ok(types.includes(type), type);
    const tree = liveTree.workflowTree(dto);
    assert.ok(tree.nodes.length >= 5);
    assert.ok(lineage.buildLineage(dto, p.build.id)!.length >= 6);
    // Another user cannot read or run it.
    const stranger = await newUser("stranger@test.dev");
    assert.equal(await project.getProject(p.id, stranger.id), null);
    await rejects(agents.runTask(p.research.id, stranger.id), 404);
  });
});
