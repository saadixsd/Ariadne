import { test } from "node:test";
import assert from "node:assert/strict";
import { citedUrls, isFetchableUrl, quoteOnPage, verifyAgainstPages, type SharedPage } from "../../lib/pages";
import { finalConflicts } from "../../lib/workspace";

const page = (url: string, text: string, status: SharedPage["status"] = "ok" as SharedPage["status"]): SharedPage => ({ url, status, note: null, title: null, text, fetchedAt: "2026-10-21T00:00:00Z" });
const check = (quote: string, url: string) => `1. Claim: "There are 12 operators."\n   Verdict: supported\n   Evidence: "${quote}"\n   Source: ${url}\n   Severity: low`;

test("pages: only public http(s) links are fetched, cited links are deduped", () => {
  assert.equal(isFetchableUrl("https://root-servers.org/"), true);
  assert.equal(isFetchableUrl("http://localhost:3000/x"), false);
  assert.equal(isFetchableUrl("file:///etc/passwd"), false);
  assert.equal(citedUrls("See https://a.example/x and https://a.example/x again.").length, 1);
});

test("pages: a supported verdict needs its quote on the page Ariadne read (B4)", () => {
  const text = "The root server system is operated by the 12 independent root server operators.";
  assert.equal(quoteOnPage("12 independent root server operators", text), true);
  const ok = verifyAgainstPages(check("12 independent root server operators", "https://root-servers.org/"), [page("https://root-servers.org/", text)]);
  assert.equal(ok.downgraded, 0);
  const bad = verifyAgainstPages(check("13 operators run it", "https://root-servers.org/"), [page("https://root-servers.org/", text)]);
  assert.equal(bad.downgraded, 1);
  assert.match(bad.output, /Verdict: unsupported/i);
  assert.equal(verifyAgainstPages(bad.output, [page("https://root-servers.org/", text)]).output, bad.output, "idempotent");
});

test("final check: a self-contradiction blocks the finished answer (B6)", () => {
  const out = finalConflicts({ finalText: "There are 12 operators.", finalCheckOutput: "Consistency: conflict — says 12 then 13", issues: [], pagesRead: 1 });
  assert.ok(out.some((c) => c.kind === "self"));
  assert.deepEqual(finalConflicts({ finalText: "There are 12 operators.", finalCheckOutput: `Consistency: ok\n\n${check("12 operators", "https://x.example/")}`, issues: [], pagesRead: 1 }), []);
});
