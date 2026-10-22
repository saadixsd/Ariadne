import assert from "node:assert/strict";
import { test } from "node:test";
import { issuesFrom } from "../../lib/workspace";
import { pagesPromptBlock } from "../../lib/pages";
import {
  CHOICE_LABEL,
  decisionsBlock,
  enforceRemovals,
  evidenceBlock,
  isDeleteConfirmation,
  looksLikeAnswer,
  MAX_NEEDS_YOU,
  openNeedsYou,
  pageExcerpt,
  removedClaims,
  triage,
} from "../../lib/simplify";

const claim = (n: number, verdict: string, severity = "high", text = `Canada hosts ${n} root server sites in Toronto`) =>
  `${n}. Claim: "${text}"\n   Verdict: ${verdict}\n   Evidence: "Canada | 35"\n   Source: https://root-servers.org/\n   Severity: ${severity}\n   Fix: Canada has 35 instances.`;

test("only material Wrong / Contradicted claims need the user, capped at 5", () => {
  const out = [
    ...Array.from({ length: 8 }, (_, i) => claim(i + 1, "wrong")),
    claim(9, "sources disagree"),
    claim(10, "unsupported"),
    claim(11, "wrong", "low"),
    claim(12, "wrong", "high", "Canada may possibly host about 30 sites"),
    claim(13, "supported", "high", "Canada hosts 35 root server instances"),
  ].join("\n\n");
  const t = triage(issuesFrom(out, []));
  const asked = t.filter((i) => i.needsYou);
  assert.equal(asked.length, MAX_NEEDS_YOU);
  assert.ok(asked.every((i) => i.flag.verdict === "wrong" || i.flag.verdict === "disputed"));
  assert.equal(openNeedsYou(t).length, 5);
  // Not asked: unsupported, low severity, hedged, and the wrong claims past the cap.
  const auto = t.filter((i) => i.auto);
  assert.ok(auto.some((i) => i.flag.verdict === "unsupported" && i.state === "rejected"));
  assert.ok(auto.some((i) => i.flag.confidence === "low"));
  assert.ok(auto.every((i) => i.autoReason));
  // Supported claims are not issues at all.
  assert.equal(t.length, 12);
});

test("a decided claim keeps the user's decision, and the choices use plain words", () => {
  const out = claim(1, "wrong");
  const [issue] = issuesFrom(out, []);
  const t = triage(issuesFrom(out, [{ flagKey: issue.key, state: "removed", edit: null, reason: null }]));
  assert.equal(t[0].state, "removed");
  assert.equal(openNeedsYou(t).length, 0);
  assert.deepEqual(Object.values(CHOICE_LABEL), ["Keep it", "Use the source's version", "Remove it", "Write my own"]);
});

test("removed claims are hard rules in the prompt and are cut from the final answer", () => {
  const out = [claim(1, "wrong", "high", "The L root has 12 sites in Canada"), claim(2, "wrong", "high", "Toronto hosts the main anycast hub")].join("\n\n");
  const issues = issuesFrom(out, []);
  const t = triage(issuesFrom(out, [{ flagKey: issues[0].key, state: "removed", edit: null, reason: null }]));
  const rules = decisionsBlock(t);
  assert.match(rules, /REMOVED/);
  assert.match(rules, /The L root has 12 sites in Canada/);
  const removed = removedClaims(t);
  assert.deepEqual(removed, ["The L root has 12 sites in Canada"]);
  const final = "## Answer\nAs of today, root-servers.org lists 35 instances in Canada. The L root has 12 sites in Canada.\n\n## Sources\n- The L root has 12 sites in Canada — https://x.org\n- 35 instances — https://root-servers.org";
  const cleaned = enforceRemovals(final, removed);
  assert.doesNotMatch(cleaned.text, /12 sites/);
  assert.match(cleaned.text, /35 instances in Canada/);
  assert.match(cleaned.text, /## Sources/);
  assert.equal(cleaned.cut.length, 2);
  assert.equal(enforceRemovals(cleaned.text, removed).cut.length, 0, "idempotent");
});

test("the writer gets the fact-checker's quotes", () => {
  const block = evidenceBlock(claim(1, "wrong"));
  assert.match(block, /Canada \| 35/);
  assert.match(block, /root-servers\.org/);
});

test("long pages are excerpted around the question, not cut at the top", () => {
  const filler = Array.from({ length: 2_000 }, (_, i) => `Row ${i} | Elsewhere | 1`).join("\n");
  const page = `Root servers\n${filler}\nCanada | 35\n${filler}`;
  const ex = pageExcerpt(page, ["canada"], 6_000);
  assert.ok(ex.excerpt);
  assert.match(ex.text, /Canada \| 35/);
  assert.ok(ex.text.length <= 6_200);
  const block = pagesPromptBlock([{ url: "https://root-servers.org/", status: "ok", note: null, title: "Root", text: page, fetchedAt: "2026-10-22T00:00:00Z" }], "How many root server instances are in Canada?");
  assert.match(block, /Canada \| 35/);
});

test("one box: questions and pasted answers are told apart", () => {
  assert.equal(looksLikeAnswer("How many DNS root server instances are located in Canada?"), false);
  assert.equal(looksLikeAnswer("Canada has 20 root server instances. They are in Toronto and Montreal. This was reported in 2024."), true);
  assert.equal(looksLikeAnswer("short"), false);
});

test("delete asks for the word delete, any case", () => {
  assert.ok(isDeleteConfirmation("delete"));
  assert.ok(isDeleteConfirmation("  DELETE "));
  assert.ok(!isDeleteConfirmation("my project"));
});
