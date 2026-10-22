import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INTERVENE_ACTIONS,
  appendInterventionToBrief,
  appendInterventionToNote,
  formatBriefLine,
  formatNoteLine,
  interveneDestination,
} from "../../lib/intervene";

test("intervene actions are the four structured kinds, never a chat", () => {
  assert.deepEqual(
    INTERVENE_ACTIONS.map((item) => item.kind),
    ["context", "challenge", "correct", "direction"],
  );
});

test("destination: context always brief; challenge/correct → note at knot, step when a model step is open, else brief", () => {
  assert.equal(interveneDestination("context", false), "brief");
  assert.equal(interveneDestination("context", true), "brief");
  assert.equal(interveneDestination("challenge", false), "brief");
  assert.equal(interveneDestination("challenge", false, true), "step");
  assert.equal(interveneDestination("challenge", true), "note");
  assert.equal(interveneDestination("challenge", true, true), "note", "knot wins over step");
  assert.equal(interveneDestination("correct", true), "note");
  assert.equal(interveneDestination("correct", false, true), "step");
  assert.equal(interveneDestination("direction", false), "drawer");
});

test("brief lines use stable headings and markers", () => {
  const when = new Date("2026-10-06T12:00:00-04:00");
  assert.equal(formatBriefLine("context", { text: "Only 2024+ rounds" }, when), "- (2026-10-06) Only 2024+ rounds");
  assert.equal(
    formatBriefLine("challenge", { claim: "Acme leads every round", issue: "unsupported" }),
    "- Claim: Acme leads every round — Issue: unsupported",
  );
  assert.equal(
    formatBriefLine("correct", { was: "Series A", shouldBe: "pre-seed" }),
    "- Was: Series A — Should be: pre-seed",
  );
});

test("note lines are structured, not free chat", () => {
  assert.equal(
    formatNoteLine("challenge", { claim: "TAM is $40B", issue: "outdated" }),
    "Claim I question: TAM is $40B — outdated",
  );
  assert.equal(formatNoteLine("correct", { was: "Montreal", shouldBe: "Québec City" }), "Correction: Montreal → Québec City");
});

test("appendInterventionToBrief creates or extends the right section", () => {
  const first = appendInterventionToBrief("Research Montreal AI investors.", "context", "- (2026-10-06) Prefer CAD figures");
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.match(first.brief, /## Context you added\n- \(2026-10-06\) Prefer CAD figures/);

  const second = appendInterventionToBrief(first.brief, "context", "- (2026-10-06) Exclude corporate VCs");
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.match(second.brief, /## Context you added\n- \(2026-10-06\) Exclude corporate VCs\n- \(2026-10-06\) Prefer CAD figures/);

  const challenge = appendInterventionToBrief(second.brief, "challenge", "- Claim: X — Issue: Y");
  assert.equal(challenge.ok, true);
  if (!challenge.ok) return;
  assert.match(challenge.brief, /## Your challenges\n- Claim: X — Issue: Y/);
});

test("appendInterventionToBrief refuses when over the cap", () => {
  const result = appendInterventionToBrief("x".repeat(100), "context", "- more", 110);
  assert.equal(result.ok, false);
});

test("appendInterventionToNote appends lines within the cap", () => {
  const first = appendInterventionToNote("", "Claim I question: A — B");
  assert.deepEqual(first, { ok: true, note: "Claim I question: A — B" });
  const second = appendInterventionToNote(first.ok ? first.note : "", "Correction: 1 → 2");
  assert.deepEqual(second, { ok: true, note: "Claim I question: A — B\nCorrection: 1 → 2" });
  const over = appendInterventionToNote("x".repeat(90), "yyyyyyyyyy", 100);
  assert.equal(over.ok, false);
});
