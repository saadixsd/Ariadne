import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSources, briefWithSources, MAX_SOURCES_TOTAL_CHARS } from "../../lib/sources";
import { issueKey, issuesFrom, reviseNote, hashText, nextAction, type ThreadSteps } from "../../lib/workspace";
import type { TaskDTO } from "../../lib/types";

const CHALLENGE = `1. Claim: The effect is large
   Objection: n=12 with no control.
   Opinion: small samples overstate effects.
   Confidence: low
   Fix: Call it preliminary.

2. Claim: Published in 2021
   Objection: It was 2019.
   Evidence: "first reported in 2019"
   Confidence: high
   Fix: Use 2019.`;

test("issue keys are stable for the same text and change when the text changes", () => {
  const a = issueKey({ claim: "X", issue: "Y  is wrong" });
  assert.equal(a, issueKey({ claim: "x", issue: "y is wrong" }));
  assert.notEqual(a, issueKey({ claim: "x", issue: "y is right" }));
  assert.match(a, /^i[0-9a-f]{8}$/);
  assert.equal(hashText("abc"), hashText("abc"));
});

test("issues are prioritized: high confidence with evidence before low-confidence opinion", () => {
  const issues = issuesFrom(CHALLENGE, []);
  assert.equal(issues.length, 2);
  assert.equal(issues[0].flag.confidence, "high");
  assert.equal(issues[1].flag.opinion, true);
  assert.ok(issues.every((i) => i.state === "open"));
});

test("revise note carries accepted, edited and rejected decisions, capped", () => {
  const issues = issuesFrom(CHALLENGE, []);
  issues[0].state = "accepted";
  issues[1].state = "rejected";
  issues[1].reason = "the draft is right";
  const note = reviseNote(issues);
  assert.match(note, /Fix "Published in 2021"/);
  assert.match(note, /Keep "The effect is large"; I rejected the challenge: the draft is right/);
  assert.equal(reviseNote(issuesFrom(CHALLENGE, [])), "");
  assert.ok(reviseNote(Array.from({ length: 200 }, () => issues[0])).length <= 2000);
});

function t(id: string, status: string, extra: Partial<TaskDTO> = {}): TaskDTO {
  return { id, projectId: "p", agentId: id, title: id, instructions: "", status, dependsOn: [], requiresApproval: false, output: null, model: null, startedAt: null, completedAt: null, createdAt: "", ...extra };
}

test("next action is always one explicit step", () => {
  const s = (d: string, c: string, j: string, o: string): ThreadSteps => ({ draft: t("d", d), challenge: t("c", c), judge: t("j", j), tieOff: t("o", o) });
  assert.equal(nextAction(s("pending", "pending", "pending", "pending"), false).kind, "run");
  assert.equal(nextAction(s("done", "done", "pending", "pending"), false).kind, "open_judge");
  assert.equal(nextAction(s("done", "done", "awaiting_approval", "pending"), false).kind, "judge");
  assert.equal(nextAction(s("done", "done", "done", "done"), false).kind, "approve");
  assert.equal(nextAction(s("done", "failed", "pending", "pending"), false).kind, "failed");
  assert.equal(nextAction({ draft: t("d", "done") }, false).kind, "custom");
});

test("sources: caps, and the shared context labels the text as unchecked", () => {
  assert.throws(() => parseSources([{ name: "a", text: "" }]), /No text/);
  assert.throws(() => parseSources([{ name: "a", text: "x" }], MAX_SOURCES_TOTAL_CHARS), /together/);
  assert.throws(() => parseSources(Array.from({ length: 6 }, () => ({ name: "a", text: "x" }))), /Up to 5/);
  assert.equal(briefWithSources("B", []), "B");
  assert.match(briefWithSources("B", [{ name: "n.md", text: "T" }]), /not checked[\s\S]*### Source: n\.md\nT/);
});
