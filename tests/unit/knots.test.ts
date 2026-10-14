import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKnots, diffParagraphs, type ThreadRun } from "../../lib/knots";
import { parseCritique } from "../../lib/critique";
import { issueKey, type ThreadSteps } from "../../lib/workspace";
import type { TaskDTO } from "../../lib/types";

const CH = `1. Claim: The effect is large
   Objection: n=12 with no control.
   Confidence: high

2. Claim: Published in 2021
   Objection: It was 2019.
   Confidence: low`;

const task = (id: string, status = "done") => ({ id, status }) as unknown as TaskDTO;
const run = (id: string, taskId: string, attempt: number, at: string, outcome = "succeeded", output: string | null = null): ThreadRun => ({
  id, taskId, attempt, outcome, model: null, error: null, completedAt: at, createdAt: at, output,
});

test("knots follow the real runs, decisions and approval", () => {
  const steps: ThreadSteps = { draft: task("d"), challenge: task("c"), judge: task("j"), tieOff: task("t") };
  const key = issueKey(parseCritique(CH).flags[0]);
  const knots = buildKnots(
    {
      runs: [
        run("r1", "d", 1, "2026-10-13T10:00:00Z"),
        run("r2", "c", 1, "2026-10-13T10:01:00Z", "succeeded", CH),
        run("r3", "d", 2, "2026-10-13T10:05:00Z"),
        run("r4", "c", 2, "2026-10-13T10:06:00Z", "failed"),
        run("r5", "t", 1, "2026-10-13T10:09:00Z"),
      ],
      decisions: [{ flagKey: key, state: "accepted", edit: null, updatedAt: "2026-10-13T10:03:00Z" }],
      approvedAt: null,
    },
    steps,
  );
  assert.deepEqual(knots.map((k) => k.kind), ["draft", "challenge", "decisions", "revision", "failed", "tieoff", "approve"]);
  assert.equal(knots[1].summary, "2 issues raised, 1 high");
  assert.equal(knots[2].summary, "1 accepted");
  assert.equal(knots[3].version, 2);
  assert.equal(knots.at(-1)?.waiting, true);
  assert.deepEqual(knots.filter((k) => k.canRerun).map((k) => k.id), ["r3", "r4", "r5"]);
});

test("paragraph diff marks removed and added text", () => {
  const d = diffParagraphs("A\n\nB\n\nC", "A\n\nB2\n\nC");
  assert.deepEqual(d.map((x) => x.t), ["same", "del", "add", "same"]);
});
