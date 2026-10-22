import assert from "node:assert/strict";
import test from "node:test";
import { buildExportModel, exportFilename, scrubVendors, slugify, toMarkdown } from "@/lib/export-doc";
import { issuesFrom } from "@/lib/workspace";

const challenge = `Data checked: 2026-10-14

1. Claim: "Bill 96 took effect on 1 June 2025."
   Verdict: supported
   Evidence: "Bill 96 took effect on 1 June 2025"
   Source: https://example.org/a
   Severity: high

2. Claim: "Francization applies at 10 employees."
   Verdict: wrong
   Evidence: "25 employees"
   Source: https://example.org/b
   Severity: high
   Fix: 25 employees`;

const text = `## Answer

Québec's rules changed. [Norton](https://example.org/a) says so, and [OQLF](https://oqlf.example/x).

### Key findings
- **Francization** at 25 employees ([OQLF](https://oqlf.example/x)).
- Signs must be French-first.

## Sources
- [Extra](https://extra.example/)

Written with Claude Sonnet 4.5 and GPT-6 Luna.`;

test("export: citations become a numbered list, decisions and verdicts carried, no vendor names", () => {
  const issues = issuesFrom(challenge, []);
  issues[0].state = "edited";
  issues[0].edit = "25 employees";
  const m = buildExportModel({ name: "Loi 96 — Québec", brief: "b", text, status: "Approved answer", challenge, issues, now: new Date(2026, 9, 14) });
  assert.deepEqual(m.sources.map((s) => s.url), ["https://example.org/a", "https://oqlf.example/x", "https://extra.example/"]);
  assert.equal(m.claims.length, 2);
  assert.equal(m.claims[0].verdict, "Matches the source");
  assert.equal(m.claims[1].verdict, "Source says otherwise");
  assert.equal(m.claims[1].decision, "Corrected");
  assert.ok(m.findings.some((f) => f.includes("Francization")));
  const md = toMarkdown(m);
  assert.match(md, /Norton \[1\]/);
  assert.match(md, /1\. Norton: <https:\/\/example.org\/a>/);
  assert.doesNotMatch(md, /Claude|Sonnet|GPT|OpenAI|Anthropic|Luna/);
  assert.match(md, /fact-checked claim by claim/);
  assert.equal(exportFilename(m.title, m.date, "pdf"), "ariadne-loi-96-quebec-2026-10-14.pdf");
});

test("export: slug and scrub edge cases", () => {
  assert.equal(slugify("!!!"), "project");
  assert.equal(slugify("When did Canada's Bill C-13 get Royal Assent, and what new Act did it create?"), "when-did-canada-s-bill-c-13-get-royal-assent-and");
  assert.equal(scrubVendors("OpenAI's GPT-6 Luna checked"), "the fact-checker checked");
});
