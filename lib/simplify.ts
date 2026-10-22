/*
  Simplified flow (Oct 22 2026). Pure and deterministic (no I/O): shared by the Worker,
  the browser and the tests.

  - triage(): only Wrong / Contradicted claims that matter to the answer ask the user
    (at most MAX_NEEDS_YOU). Every other flagged claim is handled automatically and shown,
    collapsed, under "Checked automatically".
  - decisionsBlock() / evidenceBlock(): what the writer of the final answer is told, so it
    uses what the fact-checker found and never restates a removed claim.
  - enforceRemovals(): after generation, sentences that still carry a removed claim are cut.
  - pageExcerpt(): the parts of a long page that matter to the question, instead of only
    its first few thousand characters.
*/
import { parseCritique, quotesIn, sourceLinks, type CritiqueFlag } from "@/lib/critique";
import type { DiffLine } from "@/lib/knots";
import { claimInText, isResolved, stripQuotes, type Issue, type IssueState } from "@/lib/workspace";

/** The most decisions the user is ever asked for in one pass. */
export const MAX_NEEDS_YOU = 5;

/** Plain choices per claim (state ids are unchanged so saved decisions keep working). */
export const CHOICE_LABEL: Record<"rejected" | "accepted" | "removed" | "edited", string> = {
  rejected: "Keep it",
  accepted: "Use the source's version",
  removed: "Remove it",
  edited: "Write my own",
};

/** Plain words for each verdict (no "unsupported", no "disputed"). */
export const PLAIN_VERDICT = {
  supported: "Matches the source",
  unsupported: "No source found",
  wrong: "Source says otherwise",
  disputed: "Sources give different values",
} as const;

const HEDGE = /\b(?:may|might|possibly|perhaps|unclear|uncertain|not (?:clear|known|confirmed)|cannot be (?:determined|confirmed)|could not (?:be )?(?:confirm|determin)|it is (?:possible|likely)|reportedly|roughly|approximately)\b/i;

/** A claim that matters to the answer: not low severity, not a hedge, not a tiny fragment. */
export function isMaterial(flag: Pick<CritiqueFlag, "claim" | "confidence">): boolean {
  if (flag.confidence === "low") return false;
  const claim = stripQuotes(flag.claim ?? "");
  if (claim.split(/\s+/).filter(Boolean).length < 3) return false;
  return !HEDGE.test(claim);
}

export type Triaged = Issue & {
  /** True when the user is asked about this claim. */
  needsYou: boolean;
  /** True when Ariadne decided it (the user did not); the state is what it decided. */
  auto: boolean;
  /** Plain reason for an automatic decision. */
  autoReason: string | null;
};

/**
 * Splits flagged claims into "Needs you" (Wrong or Contradicted, material; at most
 * MAX_NEEDS_YOU, highest priority first) and "Checked automatically". A claim the user
 * already decided keeps the user's decision either way.
 */
export function triage(issues: Issue[], max = MAX_NEEDS_YOU): Triaged[] {
  let asked = 0;
  return issues.map((issue) => {
    const v = issue.flag.verdict;
    const candidate = (v === "wrong" || v === "disputed") && isMaterial(issue.flag);
    const needsYou = candidate && asked < max;
    if (needsYou) asked++;
    if (needsYou || isResolved(issue.state)) return { ...issue, needsYou, auto: false, autoReason: null };
    // Automatic handling, said in plain words.
    let state: IssueState = "rejected";
    let autoReason = "Kept: it is a minor or hedged point.";
    if (v === "wrong" && issue.flag.fix) {
      state = "accepted";
      autoReason = "Changed to the source's version.";
    } else if (v === "wrong") {
      state = "removed";
      autoReason = "Removed: the source says otherwise and gives no replacement.";
    } else if (v === "unsupported") {
      autoReason = "Kept, marked as not confirmed by a source.";
    } else if (v === "disputed") {
      autoReason = "Kept, with each source's value.";
    }
    return { ...issue, state, needsYou: false, auto: true, autoReason };
  });
}

/** Claims still waiting for the user. */
export function openNeedsYou(list: Triaged[]): Triaged[] {
  return list.filter((i) => i.needsYou && !isResolved(i.state));
}

const firstQuote = (evidence: string | null) => (evidence ? quotesIn(evidence)[0] ?? null : null);

/** What the fact-checker found, for the writer: each claim, the source's words and the link. */
export function evidenceBlock(checkOutput: string | null | undefined, max = 6_000): string {
  const flags = parseCritique(checkOutput ?? "").flags.filter((f) => f.claim && (f.evidence || f.source));
  if (flags.length === 0) return "";
  const lines: string[] = [];
  let size = 0;
  for (const f of flags) {
    const q = firstQuote(f.evidence);
    const link = sourceLinks(f.source)[0] ?? null;
    const line = `- ${stripQuotes(f.claim ?? "")} → ${f.verdict ? PLAIN_VERDICT[f.verdict] : "checked"}${q ? `. The source says: "${q.slice(0, 300)}"` : ""}${link ? ` (${link})` : ""}${f.fix ? `. Corrected: ${f.fix}` : ""}`;
    if (size + line.length > max) break;
    lines.push(line);
    size += line.length;
  }
  return `## What the fact-checker found (use it)\nThese quotes come from the pages the fact-checker read. When one gives the value the question asks for, state that value with its source; do not say the value could not be found.\n${lines.join("\n")}`;
}

/** The user's decisions (and Ariadne's automatic ones) as hard rules for the final answer. */
export function decisionsBlock(list: Triaged[]): string {
  const keep: string[] = [];
  const fix: string[] = [];
  const own: string[] = [];
  const removed: string[] = [];
  for (const i of list) {
    const claim = i.flag.claim ? stripQuotes(i.flag.claim) : null;
    if (!claim) continue;
    if (i.state === "removed") removed.push(`- "${claim}"`);
    else if (i.state === "accepted") fix.push(`- "${claim}" → ${i.flag.fix ?? "use what the source says"}${firstQuote(i.flag.evidence) ? ` (source: "${firstQuote(i.flag.evidence)!.slice(0, 200)}")` : ""}`);
    else if (i.state === "edited" && i.edit) own.push(`- "${claim}" → ${i.edit}`);
    else if (i.state === "rejected" && i.flag.verdict === "unsupported") keep.push(`- "${claim}" (keep, and say in a few words that no source confirmed it)`);
  }
  const parts = ["## Decisions on the fact-checked claims (hard rules)"];
  if (removed.length) parts.push(`REMOVED: these claims must not appear in the final answer at all, not even reworded or in Sources or Open points:\n${removed.join("\n")}`);
  if (fix.length) parts.push(`Use the source's version:\n${fix.join("\n")}`);
  if (own.length) parts.push(`Use the user's wording:\n${own.join("\n")}`);
  if (keep.length) parts.push(`Kept as written:\n${keep.join("\n")}`);
  return parts.length > 1 ? parts.join("\n\n") : "";
}

/** The claims the final answer must not contain. */
export function removedClaims(list: Pick<Issue, "state" | "flag">[]): string[] {
  return list.filter((i) => i.state === "removed" && i.flag.claim).map((i) => stripQuotes(i.flag.claim!));
}

/**
 * Cuts every sentence (or list item) that still carries a removed claim. Headings are kept.
 * Returns the cleaned text and what was cut. Idempotent.
 */
export function enforceRemovals(text: string, claims: string[]): { text: string; cut: string[] } {
  if (claims.length === 0 || !text) return { text, cut: [] };
  const cut: string[] = [];
  const out = text
    .split("\n")
    .map((line) => {
      if (/^\s*#/.test(line) || !line.trim()) return line;
      if (!claims.some((c) => claimInText(c, line))) return line;
      const prefix = line.match(/^\s*(?:[-*•]|\d+[.)])?\s*/)?.[0] ?? "";
      const body = line.slice(prefix.length);
      const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z0-9["“(*])/);
      const kept = sentences.filter((s) => {
        const hit = claims.some((c) => claimInText(c, s));
        if (hit) cut.push(s.trim());
        return !hit;
      });
      return kept.length ? prefix + kept.join(" ") : null;
    })
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { text: out, cut };
}

const STOP = new Set("the and for are was were with that this from what which how many much does into have has their there they when where who why will would your about located".split(" "));

/** Words and numbers that the question and claims are about, for picking the parts of a page. */
export function focusTerms(text: string, max = 40): string[] {
  const seen = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}][\p{L}\p{N}.-]{2,}/gu)) {
    const w = m[0].replace(/[.-]+$/, "");
    if (w.length < 3 || STOP.has(w) || /^https?$/.test(w)) continue;
    seen.add(w);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/**
 * The part of a page worth showing a model within `budget` characters: the opening, then
 * the lines that mention the question's terms (with a line of context each), in page order.
 * A short page comes back whole. Linear in the page size (Worker CPU).
 */
export function pageExcerpt(text: string, terms: string[], budget: number): { text: string; excerpt: boolean } {
  if (text.length <= budget) return { text, excerpt: false };
  if (terms.length === 0) return { text: text.slice(0, budget), excerpt: true };
  const lines = text.split("\n");
  const want = new Set<number>();
  const head = Math.min(1_200, Math.floor(budget / 5));
  const scored = lines
    .map((line, i) => {
      const l = line.toLowerCase();
      let s = 0;
      for (const t of terms) if (l.includes(t)) s++;
      return { i, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  let size = head;
  for (const { i } of scored) {
    for (const j of [i - 1, i, i + 1]) {
      if (j < 0 || j >= lines.length || want.has(j)) continue;
      if (size + lines[j].length + 1 > budget) continue;
      want.add(j);
      size += lines[j].length + 1;
    }
    if (size >= budget) break;
  }
  const order = [...want].sort((a, b) => a - b);
  const parts: string[] = [text.slice(0, head)];
  let last = -2;
  for (const j of order) {
    if (j !== last + 1) parts.push("[…]");
    parts.push(lines[j]);
    last = j;
  }
  return { text: parts.join("\n"), excerpt: true };
}

/** "What changed" as a short summary: counts plus the added paragraphs only. */
export function changeSummary(lines: DiffLine[]): { added: string[]; removed: string[]; same: number } {
  return {
    added: lines.filter((l) => l.t === "add").map((l) => l.s),
    removed: lines.filter((l) => l.t === "del").map((l) => l.s),
    same: lines.filter((l) => l.t === "same").length,
  };
}

/**
 * One box for both: is this a question to answer, or an answer to check? Long text, several
 * sentences, or no question mark reads as an answer to check.
 */
export function looksLikeAnswer(input: string): boolean {
  const t = input.trim();
  if (t.length < 40) return false;
  const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (t.length > 300) return true;
  if (sentences.length >= 3 && !/\?\s*$/.test(t)) return true;
  return !/\?/.test(t) && sentences.length >= 2;
}

/** The delete dialog asks for the word "delete" (any case), not the whole project name. */
export function isDeleteConfirmation(typed: string): boolean {
  return typed.trim().toLowerCase() === "delete";
}
