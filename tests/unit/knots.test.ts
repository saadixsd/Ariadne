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

test("fact-check claims parse with verdicts; supported claims are not issues", async () => {
  const { issuesFrom } = await import("../../lib/workspace");
  const FC = `1. Claim: "Canada hosts 12 root server instances."
   Verdict: wrong
   Evidence: root-servers.org lists more instances in Canada.
   Source: https://root-servers.org/
   Severity: high
   Fix: Give the count root-servers.org lists, with the date.

2. Claim: "Root servers are run by 12 operators."
   Verdict: supported
   Evidence: The site says "12 independent root server operators".
   Source: https://root-servers.org/
   Severity: low

3. Claim: "An instance is in Iqaluit."
   Verdict: unsupported
   Evidence: Not listed.
   Source: none
   Severity: medium`;
  const flags = parseCritique(FC).flags;
  assert.deepEqual(flags.map((f) => f.verdict), ["wrong", "supported", "unsupported"]);
  assert.equal(flags[0].source, "https://root-servers.org/");
  assert.equal(flags[0].confidence, "high");
  assert.equal(flags[2].source, null);
  assert.equal(issuesFrom(FC, []).length, 2);
  const steps: ThreadSteps = { draft: task("d"), challenge: task("c"), judge: task("j", "awaiting_approval"), tieOff: task("t", "pending") };
  const k = buildKnots({ runs: [run("r1", "d", 1, "2026-10-13T10:00:00Z"), run("r2", "c", 1, "2026-10-13T10:01:00Z", "succeeded", FC)], decisions: [], approvedAt: null }, steps);
  assert.equal(k[1].summary, "3 claims checked: 1 supported, 1 unsupported, 1 wrong");
});

test("decisions knot counts every accepted claim, in the round that raised it", () => {
  const steps: ThreadSteps = { draft: task("d"), challenge: task("c"), judge: task("j"), tieOff: task("t", "pending") };
  const flags = parseCritique(CH).flags;
  const knots = buildKnots(
    {
      runs: [run("r1", "d", 1, "2026-10-13T10:00:00Z"), run("r2", "c", 1, "2026-10-13T10:01:00Z", "succeeded", CH), run("r3", "c", 2, "2026-10-13T10:02:00Z", "succeeded", CH)],
      decisions: flags.map((f) => ({ flagKey: issueKey(f), state: "accepted", edit: null, updatedAt: "2026-10-13T10:03:00Z" })),
      approvedAt: null,
    },
    steps,
  );
  assert.deepEqual(knots.map((k) => k.kind), ["draft", "challenge", "challenge", "decisions"]);
  assert.equal(knots[3].summary, "2 accepted");
});

test("web-search citations: vendor utm tags and inline citation links are dropped", async () => {
  const { cleanCitations, parseCritique } = await import("../../lib/critique");
  const raw = `1. Claim: "X"\n   Verdict: supported\n   Evidence: Listed there. ([root-servers.org](https://root-servers.org/?utm_source=openai))\n   Source: https://root-servers.org/?utm_source=openai\n   Severity: low`;
  assert.doesNotMatch(cleanCitations(raw), /openai/);
  const flag = parseCritique(raw).flags[0];
  assert.equal(flag.source, "https://root-servers.org/");
  assert.equal(flag.evidence, "Listed there.");
});

test("fact-check accuracy rules: supported needs a quote, one data date, tracking stripped", async () => {
  const { parseCritique, stripTracking, NO_QUOTE_ISSUE } = await import("../../lib/critique");
  const raw = `Data checked: 2026-10-14\n\n1. Claim: "A"\n   Verdict: supported\n   Evidence: The page says it.\n   Source: https://x.org/a?utm_medium=x&id=3&gclid=9\n   Severity: low\n\n2. Claim: "17 widgets"\n   Verdict: supported\n   Evidence: The page reads "17 widgets, 16 sites".\n   Source: https://x.org/\n   Severity: low`;
  const c = parseCritique(raw);
  assert.equal(c.dataDate, "2026-10-14");
  assert.equal(c.flags[0].verdict, "unsupported");
  assert.equal(c.flags[0].issue, NO_QUOTE_ISSUE);
  assert.equal(c.flags[0].source, "https://x.org/a?id=3");
  assert.equal(c.flags[1].verdict, "supported");
  assert.equal(stripTracking("see https://a.b/?fbclid=1#top and https://a.b/p?q=1&utm_source=z"), "see https://a.b/#top and https://a.b/p?q=1");
});

test("errors shown in the workspace never name a model or vendor", async () => {
  const { safeErrorMessage } = await import("../../lib/errors");
  const msg = safeErrorMessage(new Error("Anthropic returned 529 for claude-sonnet-4; OpenAI gpt-5.1 timed out"));
  assert.doesNotMatch(msg, /anthropic|claude|openai|gpt/i);
});
