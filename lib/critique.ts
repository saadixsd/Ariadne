/*
  Critique flags and before/after, derived from text Ariadne already has. Pure and
  deterministic: no model is called, nothing is stored. The knot shows Daedalus's
  challenge as discrete disputes; a re-spun draft is compared with the version before it.

  Fact-check output (Claim / Verdict / Evidence / Source / Severity / Fix) parses into
  flags with a verdict; the verdict is Daedalus's, shown as such. Points with no source
  are labelled Opinion. The search itself runs on OpenAI's side (lib/agents.ts), so the
  Worker only parses text, and only in the browser where it can.
*/

export type DisputeConfidence = "high" | "medium" | "low";

export type CritiqueFlag = {
  /** Stable within one review: "f1", "f2", ... */
  id: string;
  /** What part of the work the flag is about ("Hero", "Pricing"), when the review says. */
  section: string | null;
  /** The claim under challenge, when the dispute names one. */
  claim: string | null;
  /** What is wrong (objection). Always present. */
  issue: string;
  /** Quote/citation from the draft, when given. */
  evidence: string | null;
  /** True when the point rests on the challenger's knowledge, not a source in the draft. */
  opinion: boolean;
  confidence: DisputeConfidence | null;
  /** The suggested fix, when the review gives one. */
  fix: string | null;
  /** Fact-check verdict on the claim, when the review gives one. */
  verdict: ClaimVerdict | null;
  /** Source URL or file name behind the evidence, when given. */
  source: string | null;
};

/** "disputed" = credible sources give different values; each value is shown with its quote and link for the user to decide. */
export type ClaimVerdict = "supported" | "unsupported" | "wrong" | "disputed";

export type Critique = {
  verdict: string | null;
  flags: CritiqueFlag[];
  /** The review as written, kept for the prose fallback when no flags parse out. */
  prose: string;
  /** The single as-of date the fact-check used ("Data checked: ..."), when it gave one. */
  dataDate?: string | null;
  /** The final-answer check's "Consistency: ok | conflict — …" line (fix plan B6), when given. */
  consistency?: { ok: boolean; text: string } | null;
};

/** A supported verdict must carry the source's exact words in quotes; otherwise it is unsupported. */
const QUOTED = /["“”„«»]\s*[^"“”„«»\s][^"“”„«»]{3,}["“”„«»]/;
export const NO_QUOTE_ISSUE = "No exact quote from the source, so this counts as unsupported.";
export const COMPUTED_ISSUE = "This total was computed by the checker, not stated by a source, so it counts as unsupported.";

/** Exact quoted strings in an Evidence field. */
export function quotesIn(text: string): string[] {
  return Array.from(text.matchAll(/["“„«]\s*([^"“”„«»]{4,}?)\s*["”»]/g), (m) => m[1]);
}

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
/** Numbers a claim asserts, minus dates ("as of 2026", "Oct 13, 2026", ISO dates). */
export function claimNumbers(claim: string): string[] {
  const text = claim
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?/g, " ")
    .replace(new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}\\b`, "gi"), " ")
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\.?,?\\s+(?:19|20)\\d{2}\\b`, "gi"), " ")
    .replace(new RegExp(`\\b(?:as of|in|since|by|during|until|from|through|(?:${MONTHS})\\.?)\\s+(?:19|20)\\d{2}\\b`, "gi"), " ")
    // References, not quantities: ordinals (44th), bill and form codes (C-13), and
    // numbered parts of a text (Part 2, s. 52, section 152.1, chapter 15, c. 14).
    .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ")
    .replace(/\b\p{L}{1,3}-\d+(?:\.\d+)*\b/gu, " ")
    .replace(/\b(?:part|parts|section|sections|sec\.|ss?\.|art\.|article|articles|chapter|ch\.|c\.|schedule|title|rule|clause|paragraph|para\.|subsection|annex|appendix)\s*\d+(?:\.\d+)*(?:\(\w+\))*/gi, " ");
  return Array.from(text.matchAll(/\d[\d,]*(?:\.\d+)?/g), (m) => m[0].replace(/,/g, "").replace(/\.$/, ""));
}

/** Named things a claim asserts: capitalised words after the first, and standalone capital letters (root letters, grades). */
function claimEntities(claim: string): { all: string[]; any: string[] } {
  const words = claim.replace(/[*_`]/g, "").split(/[^\p{L}\p{N}.-]+/u).filter(Boolean);
  const letters = words.filter((w) => /^[A-Z]$/.test(w) && w !== "A" && w !== "I");
  const names = words.slice(1).filter((w) => /^\p{Lu}[\p{L}.-]{2,}$/u.test(w));
  return { all: Array.from(new Set(letters)), any: Array.from(new Set(names)) };
}

/**
 * Verifier for a "supported" verdict. Returns the reason to downgrade it to unsupported,
 * or null when it stands: the evidence must quote the source, the quote must contain every
 * number the claim asserts (and its named letters / at least one of its names), and a
 * total the checker computed itself is never a source's figure.
 */
export function supportedProblem(claim: string | null, evidence: string | null): string | null {
  const ev = evidence ?? "";
  if (/\bcomputed\s*:/i.test(ev) || /\b(i|we) (counted|added|summed|tallied)\b/i.test(ev)) return COMPUTED_ISSUE;
  if (!QUOTED.test(ev)) return NO_QUOTE_ISSUE;
  if (!claim) return null;
  const quoted = quotesIn(ev).join(" \u0000 ");
  const flat = quoted.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const missingNumber = claimNumbers(claim).find((n) => !new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d]|\\.\\d)`).test(flat));
  if (missingNumber) return `The quoted source text does not contain ${missingNumber}, so this counts as unsupported.`;
  const { all, any } = claimEntities(claim);
  const missingLetter = all.find((l) => !new RegExp(`(?<![\\p{L}])${l}(?![\\p{L}])`, "u").test(quoted));
  if (missingLetter) return `The quoted source text does not mention ${missingLetter}, so this counts as unsupported.`;
  if (claimNumbers(claim).length === 0 && all.length === 0 && any.length > 0 && !any.some((w) => quoted.toLowerCase().includes(w.toLowerCase()))) {
    return "The quoted source text does not mention what the claim names, so this counts as unsupported.";
  }
  return null;
}

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
  return {
    section: section ?? fallbackSection,
    claim: null,
    issue,
    evidence: null,
    opinion: false,
    confidence: null,
    fix: fix || null,
    verdict: null,
    source: null,
  };
}

const FIELD_LINE =
  /^(?:\*\*|__)?(claim|verdict|objection|issue|problem|evidence|opinion|source|confidence|severity|suggested fix|proposed fix|fix|suggestion)(?:\*\*|__)?\s*[:—–]\s*(.*)$/i;
const CONFIDENCE = /\b(high|medium|low)\b/i;

function parseVerdict(raw: string): ClaimVerdict | null {
  if (/\b(sources? disagree|disputed|conflict(?:ing)?|contested)\b/i.test(raw)) return "disputed";
  const match = raw.match(/\b(supported|unsupported|wrong|incorrect|false|contradicted)\b/i);
  if (!match) return null;
  const word = match[1].toLowerCase();
  return word === "supported" ? "supported" : word === "unsupported" ? "unsupported" : "wrong";
}

function parseConfidence(raw: string): DisputeConfidence | null {
  const match = raw.match(CONFIDENCE);
  return match ? (match[1].toLowerCase() as DisputeConfidence) : null;
}

/**
 * One atomic dispute from a multi-line list item that already carries Claim /
 * Objection / Evidence|Opinion / Confidence / Fix lines (the Challenge prompt shape).
 */
export function parseAtomicDispute(raw: string, fallbackSection: string | null = null): Omit<CritiqueFlag, "id"> | null {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split(/\n|(?:;\s+)(?=(?:\*\*|__)?(?:claim|verdict|objection|issue|problem|evidence|opinion|source|confidence|severity|suggested fix|proposed fix|fix|suggestion)\b)/i)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  let claim: string | null = null;
  let issue = "";
  let evidence: string | null = null;
  let opinion = false;
  let confidence: DisputeConfidence | null = null;
  let fix: string | null = null;
  let verdict: ClaimVerdict | null = null;
  let source: string | null = null;
  let section: string | null = fallbackSection;
  let sawField = false;
  const loose: string[] = [];

  let lastKey: string | null = null;
  for (const line of lines) {
    const field = line.match(FIELD_LINE);
    if (!field) {
      // A further value under Evidence ("- \"quote\" — url") belongs to it (one per source when they disagree).
      if (lastKey === "evidence" && evidence && /["“„«]|https?:\/\//.test(line)) {
        evidence = `${evidence}\n${tidy(line.replace(/^[-*•+]\s+/, ""))}`;
        continue;
      }
      loose.push(line);
      continue;
    }
    lastKey = field[1].toLowerCase();
    sawField = true;
    const key = field[1].toLowerCase();
    const value = tidy(field[2]);
    if (key === "claim") claim = value || null;
    else if (key === "objection" || key === "issue" || key === "problem") issue = value;
    else if (key === "evidence") {
      evidence = value || null;
      opinion = false;
    } else if (key === "opinion") {
      opinion = true;
      evidence = value || null;
    } else if (key === "confidence" || key === "severity") confidence = parseConfidence(value);
    else if (key === "verdict") verdict = parseVerdict(value);
    else if (key === "source") source = value && !/^(none|n\/a|-)$/i.test(value) ? value : null;
    else if (key === "fix" || key === "suggested fix" || key === "proposed fix" || key === "suggestion") {
      fix = value ? value.charAt(0).toUpperCase() + value.slice(1) : null;
    }
  }

  if (!sawField) return null;

  // A bold/plain section label above the fields ("**Price table**") names the part of the work.
  for (const line of loose) {
    const bold = line.match(/^(?:\*\*|__)([^*_]{1,60}?)(?:\*\*|__)$/);
    const label = bold ? bold[1].replace(/[:\s]+$/, "").trim() : plain(line).replace(/[:\s]+$/, "");
    if (looksLikeSection(label) && !ISSUE_LABEL.test(`${label}:`) && !FIX_WORD.test(label)) {
      section = label; // local label beats a generic heading above the list
      break;
    }
  }

  if (!issue && claim && verdict) {
    issue = verdict === "disputed" ? "Sources disagree. Compare the values and decide." : verdict === "supported" ? "Supported by the evidence." : verdict === "wrong" ? "The evidence contradicts this claim." : "No evidence found for this claim.";
  }
  if (!issue && claim) {
    // Claim alone with other fields still counts; objection may be missing on a sloppy model.
    const leftover = loose.find((line) => {
      const bold = line.match(/^(?:\*\*|__)([^*_]{1,60}?)(?:\*\*|__)$/);
      const label = bold ? bold[1] : plain(line);
      return !looksLikeSection(label.replace(/[:\s]+$/, ""));
    });
    issue = leftover ? tidy(leftover) : "Challenged without a stated objection.";
  }
  if (!issue) {
    const legacy = parseFlagText(raw, fallbackSection);
    return legacy;
  }
  // A dispute that never named Evidence is Opinion unless it already set opinion from the Opinion: line.
  if (!evidence && !opinion) opinion = true;
  if (source && evidence) opinion = false;
  return {
    section,
    claim,
    issue,
    evidence,
    opinion,
    confidence,
    fix: fix || null,
    verdict,
    source,
  };
}

type Item = { indent: number; text: string; heading: string | null };

/** Characters of a review that are parsed for flags (the prose fallback keeps it all). */
export const MAX_PARSE_CHARS = 20_000;
/** At most this many flags are shown; reviews with more are lists of lists, not flags. */
export const MAX_FLAGS = 40;

/**
 * Splits a review into flags: numbered or bulleted points (nested bullets fold into
 * their parent), or, failing that, two or more "Section: issue — fix" lines. Points
 * under a "Strengths" / "What works" heading are not flags. No flags → prose fallback.
 */
/**
 * Web-search output tags links with "?utm_source=<vendor>" and appends inline "([site](url))"
 * citations. The Source field already carries the URL, so drop both (no vendor name in the UI).
 */
/** Removes tracking parameters (utm_*, gclid, fbclid, mc_*, ref/ref_src) from every URL in the text. */
export function stripTracking(text: string): string {
  return text.replace(/https?:\/\/[^\s)\]>"'<]+/g, (url) => {
    const q = url.indexOf("?");
    if (q < 0) return url;
    const hashAt = url.indexOf("#", q);
    const base = url.slice(0, q);
    const query = url.slice(q + 1, hashAt < 0 ? undefined : hashAt);
    const hash = hashAt < 0 ? "" : url.slice(hashAt);
    const kept = query.split("&").filter((pair) => pair && !/^(utm_[^=]*|gclid|fbclid|msclkid|mc_cid|mc_eid|ref|ref_src|_hsenc|_hsmi|yclid)(=|$)/i.test(pair));
    return base + (kept.length ? `?${kept.join("&")}` : "") + hash;
  });
}

export function cleanCitations(text: string): string {
  return stripTracking(text)
    .replace(/\s*\(\[[^\]\n]{1,200}\]\(https?:\/\/[^)\s]{1,500}\)\)/g, "");
}

/** Each link in a Source field (several when sources disagree, split on " ; " or whitespace). */
export function sourceLinks(source: string | null | undefined): string[] {
  if (!source) return [];
  const urls = Array.from(source.matchAll(/https?:\/\/[^\s;,)\]>"'<]+/g), (m) => m[0].replace(/[.]+$/, ""));
  return urls.length ? Array.from(new Set(urls)) : [source];
}

export function parseCritique(text: string | null | undefined): Critique {
  const source = cleanCitations((text ?? "").replace(/\r\n?/g, "\n"));
  // Flags come from the head of a review; a runaway output must not cost a long parse.
  const lines = source.slice(0, MAX_PARSE_CHARS).split("\n");
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
    if (!verdict && /^\S/.test(line) && !ITEM.test(line) && VERDICT.test(trimmed)) {
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
      // Keep a newline so atomic Claim/Objection/Evidence lines stay parseable.
      last.text += `\n${trimmed}`;
      continue;
    }
    loose.push({ text: trimmed, heading });
  }

  // Nested bullets ("- Fix: ...") belong to the point above them.
  const top: Item[] = [];
  const base = items.length > 0 ? Math.min(...items.map((item) => item.indent)) : 0;
  for (const item of items) {
    const parent = top.at(-1);
    if (parent && item.indent > base) {
      // Field-shaped nested bullets ("- Objection: ...") keep a newline for atomic parse;
      // other nested notes still fold with a semicolon.
      const glue = /^(?:\*\*|__)?(claim|verdict|objection|issue|problem|evidence|opinion|source|confidence|severity|suggested fix|proposed fix|fix|suggestion)\b/i.test(item.text.trim())
        ? "\n"
        : "; ";
      parent.text += `${glue}${item.text}`;
    } else top.push({ ...item });
  }

  const sectionFrom = (value: string | null) => (value && !GENERIC.test(value) && !NOT_FLAGS.test(value) && looksLikeSection(value) ? value : null);
  let candidates = top.filter((item) => !(item.heading && NOT_FLAGS.test(item.heading)));
  if (candidates.length === 0) {
    const sectioned = loose.filter((line) => /^(?:\*\*|__)?[^:\n]{2,48}(?:\*\*|__)?:\s+\S/.test(line.text) && !(line.heading && NOT_FLAGS.test(line.heading)));
    if (sectioned.length >= 2) candidates = sectioned.map((line) => ({ indent: 0, text: line.text, heading: line.heading }));
  }

  const flags: CritiqueFlag[] = [];
  for (const item of candidates.slice(0, MAX_FLAGS)) {
    const section = sectionFrom(item.heading);
    const parsed = parseAtomicDispute(item.text, section) ?? parseFlagText(item.text, section);
    if (!parsed) continue;
    if (parsed.verdict === "supported") {
      const problem = supportedProblem(parsed.claim, parsed.evidence);
      if (problem) {
        parsed.verdict = "unsupported";
        parsed.issue = problem;
      }
    }
    flags.push({ id: `f${flags.length + 1}`, ...parsed });
  }
  const dated = loose.find((line) => /^(?:[*_]{1,2})?data checked(?:[*_]{1,2})?\s*:/i.test(line.text));
  const dataDate = dated ? tidy(dated.text.replace(/^(?:[*_]{1,2})?data checked(?:[*_]{1,2})?\s*:\s*/i, "")).slice(0, 80) || null : null;
  const consistent = loose.find((line) => /^(?:[*_]{1,2})?consistency(?:[*_]{1,2})?\s*:/i.test(line.text));
  const cText = consistent ? tidy(consistent.text.replace(/^(?:[*_]{1,2})?consistency(?:[*_]{1,2})?\s*:\s*/i, "")).slice(0, 600) : "";
  const consistency = consistent ? { ok: !/\bconflict/i.test(cText), text: cText.replace(/^conflict\s*[—–:-]?\s*/i, "") } : null;
  return { verdict, flags, prose: source.trim(), dataDate, consistency };
}

const critiqueCache = new Map<string, Critique>();

/** parseCritique, remembered for the last few review texts (renders and polls repeat them). */
export function critiqueOf(text: string): Critique {
  const hit = critiqueCache.get(text);
  if (hit) return hit;
  const value = parseCritique(text);
  if (critiqueCache.size >= 8) critiqueCache.delete(critiqueCache.keys().next().value as string);
  critiqueCache.set(text, value);
  return value;
}

/** The line "Add to note" appends: the fix when there is one, else the issue to address. */
export function noteLineFor(flag: CritiqueFlag): string {
  const where = flag.section ? `${flag.section}: ` : flag.claim ? `Re “${flag.claim.replace(/[.]$/, "")}”: ` : "";
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

/** Characters of each version that are compared; the rest is left out of the before/after. */
export const MAX_COMPARE_CHARS = 60_000;
const MAX_LCS_CELLS = 250_000;
const MAX_PAIRINGS = 2_500;

function jaccard(x: Set<string>, y: Set<string>, sameKey: boolean): number {
  if (x.size === 0 && y.size === 0) return sameKey ? 1 : 0;
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
  const a = splitBlocks(before.slice(0, MAX_COMPARE_CHARS));
  const b = splitBlocks(after.slice(0, MAX_COMPARE_CHARS));
  const n = a.length;
  const m = b.length;
  // LCS table is n×m; past the bound, anchor nothing and let the gap pass pair by position.
  const anchored = n * m <= MAX_LCS_CELLS;
  const lcs: number[][] = anchored ? Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0)) : [];
  for (let i = anchored ? n - 1 : -1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i].key === b[j].key ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const wordsOf = new Map<Block, Set<string>>();
  const wordSet = (block: Block) => {
    let set = wordsOf.get(block);
    if (!set) wordsOf.set(block, (set = words(block.text)));
    return set;
  };
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
    const positional = gapA.length * gapB.length > MAX_PAIRINGS;
    if (positional) {
      // Too big to pair by similarity: pair by position, the rest is new or cut.
      for (let k = 0; k < Math.min(gapA.length, gapB.length); k += 1) {
        usedA.add(k);
        pairs.set(k, k);
      }
    }
    if (!positional) gapB.forEach((block, j) => {
      let best = -1;
      let score = 0.3;
      gapA.forEach((old, i) => {
        if (usedA.has(i)) return;
        const s = jaccard(wordSet(old), wordSet(block), old.key === block.key);
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
    } else if (j < m && (i >= n || !anchored || lcs[i][j + 1] >= lcs[i + 1][j])) {
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
export function markAddressed(flags: CritiqueFlag[], before: string, after: string, precomputed?: Comparison): FlagMark[] {
  const oldText = ` ${normal(before)} `;
  const newText = ` ${normal(after)} `;
  const oldTerms = new Set(normal(before).split(" ").map(stem));
  const newTerms = new Set(normal(after).split(" ").map(stem));
  const comparison = precomputed ?? compareVersions(before, after);
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
