import assert from "node:assert/strict";
import { test } from "node:test";
import { claimNumbers, parseCritique, sourceLinks, supportedProblem, COMPUTED_ISSUE, NO_QUOTE_ISSUE } from "../../lib/critique";
import { verdictCounts, verdictSummary } from "../../lib/knots";
import { issuesFrom } from "../../lib/workspace";

// Placeholder figures only: no real-world count is asserted by these tests.
test("claimNumbers ignores references: ordinals, bill codes, parts and sections", () => {
  assert.deepEqual(claimNumbers("The 44th Parliament's Bill C-13, in Part 2 and s. 52 (chapter 15, section 152.1), covers 25 employees"), ["25"]);
});

test("claimNumbers ignores dates", () => {
  assert.deepEqual(claimNumbers("As of 2026, 17 sites in 4 cities (checked Oct 13, 2026; 2026-10-14)"), ["17", "4"]);
});

test("supported needs the claimed number in the quote", () => {
  assert.equal(supportedProblem("There are 17 widgets", '"Widgets: 17" — https://a.example'), null);
  assert.match(supportedProblem("There are 17 widgets", '"Widgets: 18" — https://a.example') ?? "", /does not contain 17/);
  assert.equal(supportedProblem("There are 17 widgets", "The site lists them"), NO_QUOTE_ISSUE);
  assert.equal(supportedProblem("1,204 users", '"1204 users"'), null);
});

test("supported needs every named letter and some named entity", () => {
  assert.match(supportedProblem("Grades B, C and Q are offered", '"grades B and C"') ?? "", /mention Q/);
  assert.equal(supportedProblem("Offices in Lisbon and Porto", '"our Lisbon office"'), null);
  assert.match(supportedProblem("Offices in Lisbon and Porto", '"our offices"') ?? "", /does not mention/);
});

test("a computed total is never supported", () => {
  assert.equal(supportedProblem("Total 17", 'Computed: "A 9" + "B 8" = 17'), COMPUTED_ISSUE);
  const c = parseCritique(`1. Claim: Total 17\n   Verdict: supported\n   Evidence: Computed: "A 9" + "B 8" = 17\n   Source: https://a.example`);
  assert.equal(c.flags[0].verdict, "unsupported");
  assert.equal(c.flags[0].issue, COMPUTED_ISSUE);
});

test("sources disagree keeps each value with its quote and link", () => {
  const c = parseCritique(`Data checked: 2026-10-14
1. Claim: "17 widgets"
   Verdict: Sources disagree
   Evidence: "Widgets (17)" — https://a.example/x
   - "18 widgets" — https://b.example/y.js
   Source: https://a.example/x ; https://b.example/y.js?utm_source=v
   Severity: high
   Fix: Report both values.`);
  const f = c.flags[0];
  assert.equal(f.verdict, "disputed");
  assert.match(f.evidence ?? "", /Widgets \(17\)[\s\S]*18 widgets/);
  assert.deepEqual(sourceLinks(f.source), ["https://a.example/x", "https://b.example/y.js"]);
  const v = verdictCounts(c.flags);
  assert.equal(v.disputed, 1);
  assert.match(verdictSummary(v), /1 sources give different values/);
  assert.equal(issuesFrom(c.prose, [])[0].flag.verdict, "disputed");
});
