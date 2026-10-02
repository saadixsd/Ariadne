/*
  Critique flags and before/after, derived from text Ariadne already has. Pure and
  deterministic: no model is called, nothing is stored. The knot shows Odysseus's
  review as discrete flags; a re-spun draft is compared with the version before it.

  Everything here is a heuristic over plain text, so the UI labels it as such
  ("looks addressed" / "not yet"), never as a verdict.
*/

export type CritiqueFlag = {
  /** Stable within one review: "f1", "f2", ... */
  id: string;
  /** What part of the work the flag is about ("Hero", "Pricing"), when the review says. */
  section: string | null;
  issue: string;
  /** The suggested fix, when the review gives one. */
  fix: string | null;
};

export type Critique = {
  verdict: string | null;
  flags: CritiqueFlag[];
  /** The review as written, kept for the prose fallback when no flags parse out. */
  prose: string;
};

const ITEM = /^(\s*)(?:\d{1,2}[.)]|[-*•+])\s+(.*)$/;
const VERDICT = /^(?:[*_]{1,2})?verdict(?:[*_]{1,2})?\s*[:—–-]?\s*(?:[*_]{1,2})?\s*/i;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const BOLD_HEADING = /^\s*(?:\*\*|__)([^*_]{2,60})(?:\*\*|__)\s*:?\s*$/;
/** Headings whose bullets are praise or a summary, not flags. */
const NOT_FLAGS = /\b(strength|strengths|what works|works well|positives?|good|keep|summary|overview|verdict|praise)\b/i;
/** Headings too generic to name a section of the work. */
const GENERIC = /^(issues?|flags?|problems?|concerns?|critique|feedback|review|notes?|suggestions?|fixes|changes|recommendations?|points?|weaknesses|what to fix|to fix|gaps?)$/i;
const FIX_LABEL = /(?:^|[\s.;,(])(?:\*\*|__)?(suggested fix|proposed fix|fix|suggestion|recommendation|recommended fix)(?:\*\*|__)?\s*[:—–]\s*/i;
const FIX_WORD = /^(suggested fix|proposed fix|fix|suggestion|recommendation|recommended fix)$/i;
const ISSUE_LABEL = /^(?:\*\*|__)?(issue|problem|concern|flag|gap|weakness)(?:\*\*|__)?\s*[:—–]\s*/i;

function plain(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function tidy(value: string): string {
  return plain(value).replace(/^[\s:;,—–-]+/, "").replace(/[\s:;,—–-]+$/, "").trim();
}

function looksLikeSection(label: string): boolean {
  const words = label.trim().split(/\s+/);
  return label.length >= 2 && label.length <= 48 && words.length <= 6 && !/[.!?]$/.test(label) && !ISSUE_LABEL.test(`${label}:`) && !FIX_WORD.test(label.trim()) && !FIX_LABEL.test(` ${label}:`);
}

/** One flag from one list item (or one "Section: issue — fix" line). */
export function parseFlagText(raw: string, fallbackSection: string | null = null): Omit<CritiqueFlag, "id"> | null {
  let text = raw.trim();
  if (!text) return null;
  let section: string | null = null;

  // "**Hero:** ...", "**Hero** — ...", "Hero: ..." (a short label before the colon).
  const bold = text.match(/^(?:\*\*|__)([^*_]{1,60}?)(?:\*\*|__)\s*[:—–-]?\s*([\s\S]*)$/);
  if (bold && looksLikeSection(bold[1].replace(/[:\s]+$/, ""))) {
    section = bold[1].replace(/[:\s]+$/, "").trim();
    text = bold[2];
  } else {
    const colon = text.match(/^([^:\n]{2,48}):\s+([\s\S]+)$/);
    if (colon && looksLikeSection(plain(colon[1]))) {
      section = plain(colon[1]);
      text = colon[2];
    }
  }

  let issue = text;
  let fix: string | null = null;
  const labelled = text.match(FIX_LABEL);
  if (labelled && labelled.index !== undefined) {
    issue = text.slice(0, labelled.index);
    fix = text.slice(labelled.index + labelled[0].length);
  } else {
    // "issue — fix" / "issue → fix" (spaced dashes only, so hyphenated words stay whole).
    const split = text.match(/^([\s\S]+?)\s+(?:—|–|--|->|→)\s+([\s\S]+)$/);
    if (split) {
      issue = split[1];
      fix = split[2];
    }
  }
  issue = tidy(tidy(issue).replace(ISSUE_LABEL, ""));
  fix = fix ? tidy(fix) : null;
  if (!issue && fix) {
    issue = fix;
    fix = null;
  }
  if (!issue) return null;
  if (fix) fix = fix.charAt(0).toUpperCase() + fix.slice(1);
  return { section: section ?? fallbackSection, issue, fix: fix || null };
}

type Item = { indent: number; text: string; heading: string | null };

/**
 * Splits a review into flags: numbered or bulleted points (nested bullets fold into
 * their parent), or, failing that, two or more "Section: issue — fix" lines. Points
 * under a "Strengths" / "What works" heading are not flags. No flags → prose fallback.
 */
export function parseCritique(text: string | null | undefined): Critique {
  const source = (text ?? "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  let verdict: string | null = null;
  let heading: string | null = null;
  let inFence = false;
  const items: Item[] = [];
  const loose: { text: string; heading: string | null }[] = [];

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!verdict && VERDICT.test(trimmed)) {
      verdict = tidy(trimmed.replace(VERDICT, "")) || null;
      continue;
    }
    const head = trimmed.match(HEADING) ?? trimmed.match(BOLD_HEADING);
    if (head) {
      heading = plain(head[1]).replace(/[:\s]+$/, "");
      continue;
    }
    const item = line.match(ITEM);
    if (item) {
      items.push({ indent: item[1].replace(/\t/g, "    ").length, text: item[2], heading });
      continue;
    }
    const last = items.at(-1);
    if (last && /^\s{2,}/.test(line)) {
      // A wrapped or indented continuation of the point above.
      last.text += ` ${trimmed}`;
      continue;
    }
    loose.push({ text: trimmed, heading });
  }

  // Nested bullets ("- Fix: ...") belong to the point above them.
  const top: Item[] = [];
  const base = items.length > 0 ? Math.min(...items.map((item) => item.indent)) : 0;
  for (const item of items) {
    const parent = top.at(-1);
    if (parent && item.indent > base) parent.text += `; ${item.text}`;
    else top.push({ ...item });
  }

  const sectionFrom = (value: string | null) => (value && !GENERIC.test(value) && !NOT_FLAGS.test(value) && looksLikeSection(value) ? value : null);
  let candidates = top.filter((item) => !(item.heading && NOT_FLAGS.test(item.heading)));
  if (candidates.length === 0) {
    const sectioned = loose.filter((line) => /^(?:\*\*|__)?[^:\n]{2,48}(?:\*\*|__)?:\s+\S/.test(line.text) && !(line.heading && NOT_FLAGS.test(line.heading)));
    if (sectioned.length >= 2) candidates = sectioned.map((line) => ({ indent: 0, text: line.text, heading: line.heading }));
  }

  const flags: CritiqueFlag[] = [];
  for (const item of candidates) {
    const parsed = parseFlagText(item.text, sectionFrom(item.heading));
    if (parsed) flags.push({ id: `f${flags.length + 1}`, ...parsed });
  }
  return { verdict, flags, prose: source.trim() };
}

/** The line "Add to note" appends: the fix when there is one, else the issue to address. */
export function noteLineFor(flag: CritiqueFlag): string {
  const where = flag.section ? `${flag.section}: ` : "";
  return flag.fix ? `${where}${flag.fix.replace(/\.?$/, ".")}` : `${where}address “${flag.issue.replace(/[.]$/, "")}”.`;
}

/** Appends a flag's line to the note (one per line, never twice), within `max` chars. */
export function appendToNote(note: string, line: string, max: number): string {
  const current = note.replace(/\s+$/, "");
  if (current.split("\n").some((existing) => existing.trim().replace(/^[-•]\s*/, "") === line.trim())) return note;
  const next = current ? `${current}\n- ${line}` : `- ${line}`;
  return next.length > max ? note : next;
}

/* ---------- before / after ---------- */

export type Block = { text: string; key: string };
export type CompareRow =
  | { kind: "same"; after: Block }
  | { kind: "changed"; before: Block; after: Block }
  | { kind: "added"; after: Block }
  | { kind: "removed"; before: Block };

export type Comparison = {
  rows: CompareRow[];
  changed: number;
  added: number;
  removed: number;
  same: number;
};

function normal(value: string): string {
  return plain(value).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Paragraphs, headings and list items, kept whole inside fenced code and tables. */
export function splitBlocks(text: string): Block[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence = false;
  const flush = () => {
    if (current.length > 0) blocks.push(current.join("\n"));
    current = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      if (!fence) flush();
      current.push(line);
      fence = !fence;
      if (!fence) flush();
      continue;
    }
    if (fence) {
      current.push(line);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const isTable = /^\s*\|/.test(line);
    const prevTable = current.length > 0 && /^\s*\|/.test(current[current.length - 1]);
    if (HEADING.test(line) || (ITEM.test(line) && !/^\s{2,}/.test(line)) || (isTable && !prevTable) || (!isTable && prevTable)) flush();
    current.push(line);
    if (HEADING.test(line)) flush();
  }
  flush();
  return blocks.map((block) => ({ text: block, key: normal(block) })).filter((block) => block.key.length > 0 || /```/.test(block.text));
}

function words(value: string): Set<string> {
  return new Set(normal(value).split(" ").filter((word) => word.length > 2));
}

function similarity(a: Block, b: Block): number {
  const x = words(a.text);
  const y = words(b.text);
  if (x.size === 0 && y.size === 0) return a.key === b.key ? 1 : 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared += 1;
  return shared / (x.size + y.size - shared);
}

/**
 * Section-level before/after: an LCS over normalised blocks anchors what stayed; in
 * each gap between anchors, blocks that still look alike (word overlap) pair up as
 * "changed" and the rest are "added" or "removed". Not a character diff.
 */
export function compareVersions(before: string, after: string): Comparison {
  const a = splitBlocks(before);
  const b = splitBlocks(after);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i].key === b[j].key ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const rows: CompareRow[] = [];
  let gapA: Block[] = [];
  let gapB: Block[] = [];
  const flushGap = () => {
    // Same number of blocks on both sides: the passages at those places were rewritten.
    if (gapA.length === gapB.length) {
      gapB.forEach((block, index) => rows.push({ kind: "changed", before: gapA[index], after: block }));
      gapA = [];
      gapB = [];
      return;
    }
    const usedA = new Set<number>();
    const pairs = new Map<number, number>();
    gapB.forEach((block, j) => {
      let best = -1;
      let score = 0.3;
      gapA.forEach((old, i) => {
        if (usedA.has(i)) return;
        const s = similarity(old, block);
        if (s > score) {
          score = s;
          best = i;
        }
      });
      if (best >= 0) {
        usedA.add(best);
        pairs.set(j, best);
      }
    });
    // What was cut is listed first, struck through, then what this version has there.
    gapA.forEach((block, i) => {
      if (!usedA.has(i)) rows.push({ kind: "removed", before: block });
    });
    gapB.forEach((block, j) => {
      const paired = pairs.get(j);
      rows.push(paired !== undefined ? { kind: "changed", before: gapA[paired], after: block } : { kind: "added", after: block });
    });
    gapA = [];
    gapB = [];
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i].key === b[j].key) {
      flushGap();
      rows.push({ kind: "same", after: b[j] });
      i += 1;
      j += 1;
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      gapB.push(b[j]);
      j += 1;
    } else {
      gapA.push(a[i]);
      i += 1;
    }
  }
  flushGap();
  const count = (kind: CompareRow["kind"]) => rows.filter((row) => row.kind === kind).length;
  return { rows, changed: count("changed"), added: count("added"), removed: count("removed"), same: count("same") };
}

/* ---------- looks addressed / not yet ---------- */

const STOP = new Set(
  "the a an and or but if then than that this these those with without into onto from for to of in on at by as is are was were be been being it its it's they them their there here what which who whom whose when where why how all any each more most less least some such no not only own same so too very can will just should would could may might must about above below again also make makes made use using used add adds added keep keeps clear clearer better more less instead rather like one two first second line lines section sections draft review point points copy text page reader readers user users".split(
    " ",
  ),
);

/** A loose word key: long words by their first six letters (neighbourhood ~ neighbours), short ones de-pluralised. */
function stem(word: string): string {
  return word.length > 6 ? word.slice(0, 6) : word.replace(/(?:ing|ed|es|s)$/, "");
}

function terms(value: string): string[] {
  return [
    ...new Set(
      normal(value)
        .split(" ")
        .filter((word) => word.length > 3 && !STOP.has(word) && !/^\d+$/.test(word))
        .map(stem),
    ),
  ];
}

function quoted(value: string): string[] {
  return [...value.matchAll(/["“”]([^"“”]{3,80})["“”]/g)].map((match) => normal(match[1])).filter(Boolean);
}

export type FlagMark = { flag: CritiqueFlag; status: "addressed" | "open"; evidence: string };

/**
 * Marks each flag of the critique that came between two versions as "looks addressed"
 * or "not yet", from words alone:
 * - a phrase the flag quotes from v1 is gone from v2, or a phrase the fix quotes now appears;
 * - or the fix's distinctive words are new in v2 (at least two, or most of them);
 * - or the passage the issue points at was rewritten and at least one fix word arrived.
 * Anything else is "not yet". It cannot judge quality, and says so in the UI.
 */
export function markAddressed(flags: CritiqueFlag[], before: string, after: string): FlagMark[] {
  const oldText = ` ${normal(before)} `;
  const newText = ` ${normal(after)} `;
  const oldTerms = new Set(normal(before).split(" ").map(stem));
  const newTerms = new Set(normal(after).split(" ").map(stem));
  const comparison = compareVersions(before, after);
  const rewritten = comparison.rows.filter((row) => row.kind === "changed" || row.kind === "removed").map((row) => ` ${row.before.key} `);

  return flags.map((flag) => {
    const issueQuotes = quoted(`${flag.issue} ${flag.section ?? ""}`);
    const goneQuote = issueQuotes.find((phrase) => oldText.includes(` ${phrase} `) && !newText.includes(` ${phrase} `));
    if (goneQuote) return { flag, status: "addressed", evidence: `“${goneQuote}” is gone in the new version` };
    const fixQuotes = flag.fix ? quoted(flag.fix) : [];
    const newQuote = fixQuotes.find((phrase) => newText.includes(` ${phrase} `) && !oldText.includes(` ${phrase} `));
    if (newQuote) return { flag, status: "addressed", evidence: `“${newQuote}” now appears` };

    const fixTerms = flag.fix ? terms(flag.fix) : [];
    const arrived = fixTerms.filter((term) => newTerms.has(term) && !oldTerms.has(term));
    if (arrived.length >= 2 || (fixTerms.length > 0 && arrived.length / fixTerms.length >= 0.6)) {
      return { flag, status: "addressed", evidence: `new in this version: ${arrived.slice(0, 3).join(", ")}` };
    }
    const issueTerms = terms(`${flag.section ?? ""} ${flag.issue}`);
    const touched = rewritten.some((block) => issueTerms.filter((term) => block.includes(` ${term}`)).length >= Math.min(2, issueTerms.length));
    if (touched && issueTerms.length > 0 && arrived.length >= 1) {
      return { flag, status: "addressed", evidence: `that passage was rewritten; new: ${arrived[0]}` };
    }
    return {
      flag,
      status: "open",
      evidence: touched ? "that passage changed, but not in the way the fix asks" : "no sign of it in the new version",
    };
  });
}
