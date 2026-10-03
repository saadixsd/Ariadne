// Unit tests for pure helpers: DAG layout, polling back-off, philosophy rotation, text fold, hand names.
// Run: npx tsx --test tests/unit/helpers.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ancestorsOf, layoutDag, placeDag } from "../../lib/dag-layout";
import { handName } from "../../lib/hands";
import { delphicLine, SOCRATIC_QUESTIONS, socraticQuestion } from "../../lib/philosophy";
import { POLL_ACTIVE_MS, POLL_IDLE_MAX_MS, POLL_IDLE_START_MS, isSpinning, nextPollDelay } from "../../lib/poll-schedule";
import { briefLead, foldPlan } from "../../lib/text-fold";

const t = (id: string, ...dependsOn: string[]) => ({ id, dependsOn });

test("dag: a straight chain is one step per column, in dependency (not creation) order", () => {
  // Created out of order: c needs b needs a.
  const layout = layoutDag([t("c", "b"), t("a"), t("b", "a")]);
  assert.deepEqual(layout.layers, [["a"], ["b"], ["c"]]);
  assert.deepEqual(layout.order, ["a", "b", "c"]);
  assert.deepEqual(layout.sources, ["a"]);
  assert.deepEqual(layout.sinks, ["c"]);
  assert.equal(layout.dropped.length, 0);
});

test("dag: branch and join; a join sits after the longest input path", () => {
  // a -> b -> d, a -> c -> d, and e joins d + a
  const layout = layoutDag([t("a"), t("b", "a"), t("c", "a"), t("d", "b", "c"), t("e", "d", "a")]);
  assert.equal(layout.layerOf.get("a"), 0);
  assert.equal(layout.layerOf.get("b"), 1);
  assert.equal(layout.layerOf.get("c"), 1);
  assert.equal(layout.layerOf.get("d"), 2);
  assert.equal(layout.layerOf.get("e"), 3, "e waits for d even though a is also an input");
  assert.equal(layout.layers[1].length, 2, "b and c share a column");
  assert.deepEqual([...ancestorsOf("d", layout)].sort(), ["a", "b", "c"]);
  assert.deepEqual([...ancestorsOf("a", layout)], []);
  assert.equal(layout.edges.length, 6);
});

test("dag: parallel roots and several sinks", () => {
  const layout = layoutDag([t("r1"), t("r2"), t("x", "r1"), t("y", "r2")]);
  assert.deepEqual(layout.sources, ["r1", "r2"]);
  assert.deepEqual(layout.sinks, ["x", "y"]);
  assert.deepEqual(layout.layers.map((layer) => layer.length), [2, 2]);
});

test("dag: cycles, self-references, duplicates and unknown ids never hang or lose a task", () => {
  const layout = layoutDag([t("a", "c", "a", "ghost"), t("b", "a", "a"), t("c", "b")]);
  assert.equal(layout.order.length, 3, "every task is placed exactly once");
  assert.deepEqual(new Set(layout.order), new Set(["a", "b", "c"]));
  assert.equal(layout.dropped.length, 1, "exactly one edge is dropped to break the a->b->c->a cycle");
  const placed = layout.layers.flat();
  assert.equal(placed.length, 3);
  assert.equal(new Set(placed).size, 3);
  // A pure 2-cycle.
  const two = layoutDag([t("p", "q"), t("q", "p")]);
  assert.equal(two.order.length, 2);
  assert.equal(two.dropped.length, 1);
});

test("dag: barycentre keeps children next to their parents (no needless crossing)", () => {
  // Two independent chains created interleaved: top chain a1->a2, bottom chain b1->b2,
  // but the second column is created bottom-first.
  const layout = layoutDag([t("a1"), t("b1"), t("b2", "b1"), t("a2", "a1")]);
  assert.deepEqual(layout.layers[0], ["a1", "b1"]);
  assert.deepEqual(layout.layers[1], ["a2", "b2"]);
});

test("dag: placement puts the door left, the deliverable right, and centres each column", () => {
  const layout = layoutDag([t("a"), t("b", "a"), t("c", "a")]);
  const placed = placeDag(layout, { colW: 300, rowH: 100, padX: 150, padY: 50 });
  assert.equal(placed.door.x, 150);
  assert.equal(placed.nodes.get("a")?.x, 450);
  assert.equal(placed.nodes.get("b")?.x, 750);
  assert.equal(placed.centre.x, 1050);
  const b = placed.nodes.get("b")?.y ?? 0;
  const c = placed.nodes.get("c")?.y ?? 0;
  assert.equal(Math.abs(b - c), 100);
  assert.equal((b + c) / 2, placed.nodes.get("a")?.y, "the branch is centred on its parent");
  assert.equal(layoutDag([]).layers.length, 0);
  // With the door's compact size, the first column packs up to it and the drawing is never shorter than the door.
  const compact = placeDag(layout, { colW: 300, rowH: 100, padX: 150, padY: 50, door: { width: 230, height: 400 } });
  assert.equal(compact.nodes.get("a")?.x, 150 + 115 + 150);
  assert.equal(compact.centre.x, 150 + 115 + 150 + 2 * 300);
  assert.equal(compact.width, compact.centre.x + 150);
  assert.equal(compact.height, 400 + 100);
  assert.equal(compact.door.y, compact.height / 2);
});

test("brief lead: first line, first sentence, for the compact door card", () => {
  assert.equal(briefLead("\n\n  Miso is a tiny character. It lives in a gauge.\nMore here."), "Miso is a tiny character.");
  assert.equal(briefLead("Build v2.0 of the site, no full stop"), "Build v2.0 of the site, no full stop");
  assert.equal(briefLead("Hi. Build a one-page site for the café"), "Hi. Build a one-page site for the café");
  assert.equal(briefLead("   "), "");
});

test("dag: 200 tasks lay out fast", () => {
  const tasks = Array.from({ length: 200 }, (_, index) => t(`n${index}`, ...(index > 0 ? [`n${Math.floor(index / 2)}`] : [])));
  const started = performance.now();
  const layout = layoutDag(tasks);
  assert.equal(layout.order.length, 200);
  assert.ok(performance.now() - started < 200);
});

test("poll: 2s while spinning, doubling back-off while idle, capped at a minute", () => {
  assert.equal(nextPollDelay({ spinning: true, hidden: false, quietPolls: 7 }), POLL_ACTIVE_MS);
  const ladder = [0, 1, 2, 3, 4, 5, 6, 50].map((quietPolls) => nextPollDelay({ spinning: false, hidden: false, quietPolls }));
  assert.deepEqual(ladder, [4000, 8000, 16000, 32000, 60000, 60000, 60000, 60000]);
  assert.equal(ladder[0], POLL_IDLE_START_MS);
  assert.equal(Math.max(...(ladder as number[])), POLL_IDLE_MAX_MS);
});

test("poll: a hidden tab never schedules, even while spinning", () => {
  assert.equal(nextPollDelay({ spinning: true, hidden: true, quietPolls: 0 }), null);
  assert.equal(nextPollDelay({ spinning: false, hidden: true, quietPolls: 3 }), null);
});

test("poll: requests per idle hour fall from 1,800 (fixed 2s) to under 70", () => {
  let elapsed = 0;
  let requests = 0;
  let quiet = 0;
  while (elapsed < 3_600_000) {
    elapsed += nextPollDelay({ spinning: false, hidden: false, quietPolls: quiet }) ?? 0;
    requests += 1;
    quiet += 1;
  }
  assert.ok(requests < 70, `idle hour: ${requests} requests`);
});

test("poll: spinning means a running task or a request in flight", () => {
  assert.equal(isSpinning([{ status: "done" }, { status: "pending" }], null), false);
  assert.equal(isSpinning([{ status: "running" }], null), true);
  assert.equal(isSpinning([{ status: "done" }], "t1"), true);
});

test("philosophy: one deterministic question per knot, moving on after a round of changes", () => {
  const q = socraticQuestion("task_abc");
  assert.equal(socraticQuestion("task_abc"), q, "stable across renders and polls");
  assert.ok((SOCRATIC_QUESTIONS as readonly string[]).includes(q));
  assert.notEqual(socraticQuestion("task_abc", 1), q, "a new round asks a different question");
  const spread = new Set(Array.from({ length: 40 }, (_, index) => socraticQuestion(`task_${index}`)));
  assert.ok(spread.size >= 4, "questions rotate across knots");
  assert.equal(delphicLine("p1"), delphicLine("p1"));
});

test("text: long outputs fold, short ones do not", () => {
  assert.equal(foldPlan("A short answer.").fold, false);
  const long = Array.from({ length: 40 }, (_, index) => `- point ${index}`).join("\n");
  const plan = foldPlan(long);
  assert.equal(plan.fold, true);
  assert.match(plan.label, /words · \d+ min read/);
  assert.equal(foldPlan("x".repeat(1300)).fold, true);
});

test("hands: legacy names map to Odysseus and Daedalus; others pass through", () => {
  assert.equal(handName("Scout"), "Odysseus");
  assert.equal(handName("Maker"), "Daedalus");
  assert.equal(handName("You"), "You");
  assert.equal(handName("Odysseus"), "Odysseus");
});

test("errors: failed requests show the server's error, never a dev-server hint", async () => {
  const { failureText, serverError } = await import("../../components/project-poll");
  assert.equal(failureText("Run failed", 500, "Unexpected server error"), "Run failed: Unexpected server error.");
  assert.equal(failureText("Run failed", 429, "Daily limit is used up."), "Run failed: Daily limit is used up.");
  assert.equal(failureText("Could not refresh the project", 503, null), "Could not refresh the project (the server answered 503).");
  assert.equal(await serverError(Response.json({ error: "Sign in required" }, { status: 401 })), "Sign in required");
  assert.equal(await serverError(new Response("<html>Worker threw exception</html>", { status: 500 })), null);
});

test("errors: the site-wide ceiling (503) never tells you your own runs are gone", async () => {
  const { runFailureNext } = await import("../../components/project-poll");
  assert.match(runFailureNext(503), /Your own daily runs are untouched/);
  assert.match(runFailureNext(503), /midnight UTC/);
  assert.match(runFailureNext(429), /Your daily runs come back at midnight UTC/);
});

test("account: names are trimmed, collapsed, capped at 60, and empty clears", async () => {
  const { readPersonName, MAX_PERSON_NAME_CHARS } = await import("../../lib/account");
  assert.equal(MAX_PERSON_NAME_CHARS, 60);
  assert.equal(readPersonName("  Saad  "), "Saad");
  assert.equal(readPersonName("Mary   Ann"), "Mary Ann");
  assert.equal(readPersonName(""), null);
  assert.equal(readPersonName("   "), null);
  assert.equal(readPersonName(null), null);
  assert.equal(readPersonName("x".repeat(60)), "x".repeat(60));
  assert.equal(readPersonName("x".repeat(61)), undefined);
  assert.equal(readPersonName(42), undefined);
  assert.equal(readPersonName("a\u0000b"), undefined);
});
