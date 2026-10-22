/*
  The downloadable deliverable, format-neutral. Pure and deterministic, shared by the
  browser renderers (PDF, Word, PowerPoint, Markdown) and the tests. Inline Markdown
  links become numbered citations [n] with a proper sources list; the fact-check
  summary carries each claim's verdict and your decision. No vendor or model names.
*/
import { parseCritique, type CritiqueFlag } from "@/lib/critique";
import { issueKey, type Issue } from "@/lib/workspace";

export type Run = { text: string; bold?: boolean };
export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "para"; runs: Run[] }
  | { kind: "bullet"; runs: Run[]; ordered?: number; depth: number };
export type ExportSource = { n: number; label: string; url: string };
export type ExportClaim = { claim: string; verdict: string; decision: string; note: string | null; source: string | null };
export type ExportModel = {
  title: string;
  status: string;
  date: string; // YYYY-MM-DD
  dateLabel: string; // "14 October 2026"
  brief: string;
  blocks: Block[];
  findings: string[];
  sources: ExportSource[];
  claims: ExportClaim[];
};

export const EXPORT_FORMATS = [
  { id: "pdf", label: "PDF", ext: "pdf", hint: "For reading and sharing" },
  { id: "docx", label: "Word", ext: "docx", hint: "Editable document" },
  { id: "pptx", label: "PowerPoint", ext: "pptx", hint: "Slide deck" },
  { id: "md", label: "Markdown", ext: "md", hint: "Plain text" },
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number]["id"];

export const VERDICT: Record<string, string> = { supported: "Matches the source", unsupported: "No source found", wrong: "Source says otherwise", disputed: "Sources give different values" };
const DECISION: Record<string, string> = { accepted: "Fixed (used the source)", rejected: "Kept as written", edited: "Corrected", removed: "Removed", investigating: "Not decided", open: "Not decided" };

/** Only the agent names Odysseus and Daedalus; never a vendor or model name. */
export function scrubVendors(text: string): string {
  return text
    .replace(/\b(?:Anthropic(?:'s)?\s+)?Claude(?:\s+(?:Sonnet|Opus|Haiku))?(?:\s*[\d.]+)?\b/g, "the writer")
    .replace(/\b(?:Sonnet|Opus|Haiku)(?:\s*[\d.]+)?\b/g, "the writer")
    .replace(/\bAnthropic\b/g, "the writer")
    .replace(/\b(?:OpenAI(?:'s)?\s+)?(?:Chat)?GPT[-\w.]*(?:\s+Luna)?\b/gi, "the fact-checker")
    .replace(/\bOpenAI\b/g, "the fact-checker")
    .replace(/\bGemini\b/g, "a model");
}

export function slugify(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // At most 50 characters, cut at a word boundary.
  const cut = s.length > 50 ? s.slice(0, 51).replace(/-[^-]*$/, "") || s.slice(0, 50) : s;
  return cut.replace(/-+$/g, "") || "project";
}

export function exportFilename(name: string, date: string, ext: string): string {
  return `ariadne-${slugify(name)}-${date}.${ext}`;
}

function isoDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Splits **bold** spans; strips other inline marks. */
export function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
  for (const part of parts) {
    if (!part) continue;
    const bold = /^(\*\*|__)[\s\S]*\1$/.test(part) && part.length > 4;
    const t = (bold ? part.slice(2, -2) : part).replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2").replace(/`([^`]*)`/g, "$1");
    if (t) runs.push(bold ? { text: t, bold: true } : { text: t });
  }
  return runs;
}

export function plain(runs: Run[]): string {
  return runs.map((r) => r.text).join("");
}

const SECTION_SOURCES = /^\s{0,3}(?:#{1,6}\s*|\*\*|__)sources?(?:\*\*|__)?\s*:?\s*$/i;
const ANY_HEADING = /^\s{0,3}(?:#{1,6}\s+\S|(?:\*\*|__)[^*_]+(?:\*\*|__)\s*:?\s*$)/;

/**
 * Builds the export model. `text` is the deliverable (tied-off answer or current draft),
 * `challenge` the fact-check output, `issues` the flagged claims with your decisions.
 */
export function buildExportModel(input: {
  name: string;
  brief: string;
  text: string;
  status: string;
  challenge: string | null | undefined;
  issues: Issue[];
  now?: Date;
}): ExportModel {
  const now = input.now ?? new Date();
  const sources: ExportSource[] = [];
  const byUrl = new Map<string, number>();
  const cite = (label: string, url: string) => {
    const key = url.trim().replace(/[#?].*$/, (m) => (m.startsWith("#") ? "" : m)).replace(/\/$/, "");
    let n = byUrl.get(key);
    if (!n) {
      n = sources.length + 1;
      byUrl.set(key, n);
      sources.push({ n, label: label.trim() || url, url: url.trim() });
    }
    return n;
  };

  // Drop the writeup's own Sources section: its links become the numbered list.
  const lines = scrubVendors(input.text.replace(/\r\n?/g, "\n")).split("\n");
  const body: string[] = [];
  const trailing: string[] = [];
  let inSources = false;
  for (const line of lines) {
    if (SECTION_SOURCES.test(line)) {
      inSources = true;
      continue;
    }
    if (inSources && ANY_HEADING.test(line)) inSources = false;
    (inSources ? trailing : body).push(line);
  }

  const link = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g;
  const citeLine = (s: string) =>
    s.replace(link, (_m, label: string | undefined, url: string | undefined, bare: string | undefined) => {
      const u = url ?? bare!;
      const n = cite(label ?? u, u);
      return label ? `${label} [${n}]` : `[${n}]`;
    });

  const blocks: Block[] = [];
  const findings: string[] = [];
  let inFindings = false;
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "para", runs: runsOf(citeLine(para.join(" ").trim())) });
    para = [];
  };
  for (const raw of body) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const text = plain(runsOf(citeLine(h[2])));
      blocks.push({ kind: "heading", level: Math.min(3, Math.max(1, h[1].length - 1)) as 1 | 2 | 3, text });
      inFindings = /finding|summary|key point|answer/i.test(text);
      continue;
    }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      flush();
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flush();
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue;
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      blocks.push({ kind: "bullet", runs: runsOf(citeLine(cells.join(" · "))), depth: 0 });
      continue;
    }
    const b = line.match(/^(\s*)(?:[-*+]|(\d+)[.)])\s+(.*)$/);
    if (b) {
      flush();
      const runs = runsOf(citeLine(b[3]));
      const depth = Math.min(2, Math.floor(b[1].replace(/\t/g, "  ").length / 2));
      blocks.push({ kind: "bullet", runs, depth, ...(b[2] ? { ordered: Number(b[2]) } : {}) });
      if (inFindings && depth === 0) findings.push(plain(runs));
      continue;
    }
    para.push(line.trim());
  }
  flush();
  // Sources listed only in the writeup's Sources section still belong in the list.
  for (const line of trailing) line.replace(link, (_m, label, url, bare) => (cite(label ?? url ?? bare, url ?? bare), ""));

  if (!findings.length) {
    for (const b of blocks) {
      if (b.kind === "bullet" && b.depth === 0) findings.push(plain(b.runs));
      if (findings.length >= 6) break;
    }
  }
  if (!findings.length) {
    const first = blocks.find((b) => b.kind === "para");
    if (first && first.kind === "para") findings.push(plain(first.runs));
  }

  const claims: ExportClaim[] = [];
  const byKey = new Map(input.issues.map((i) => [i.key, i]));
  const flagged = new Set(input.issues.map((i) => i.key));
  const flags: CritiqueFlag[] = parseCritique(input.challenge ?? "").flags;
  for (const f of flags) {
    if (!f.verdict && !f.claim) continue;
    const key = issueKey(f);
    const issue = flagged.has(key) ? byKey.get(key) : undefined;
    const claim = scrubVendors((f.claim ?? f.issue).replace(/^["“”\s]+|["“”\s]+$/g, ""));
    const decision = f.verdict === "supported" && !issue ? "No action needed" : DECISION[issue?.state ?? "open"];
    const note = issue?.state === "edited" && issue.edit ? `Your correction: ${issue.edit}` : issue?.state === "rejected" && issue.reason ? `Your reason: ${issue.reason}` : f.verdict !== "supported" ? scrubVendors(f.issue) : null;
    claims.push({ claim, verdict: f.verdict ? VERDICT[f.verdict] : "Flagged", decision, note: note && note !== claim ? note : null, source: f.source ? f.source.split(/\s*;\s*/)[0] : null });
  }

  const date = isoDate(now);
  return {
    title: scrubVendors(input.name.trim() || "Ariadne deliverable"),
    status: input.status,
    date,
    dateLabel: now.toLocaleDateString("en-CA", { day: "numeric", month: "long", year: "numeric" }),
    brief: scrubVendors(input.brief.trim()),
    blocks,
    findings: findings.slice(0, 6),
    sources,
    claims,
  };
}

export function flaggedClaims(m: ExportModel) {
  return m.claims.filter((c) => c.verdict !== VERDICT.supported);
}

export function factCheckLine(m: ExportModel) {
  const flagged = flaggedClaims(m).length;
  return m.claims.length
    ? `The fact-check covered ${m.claims.length} key claim${m.claims.length === 1 ? "" : "s"} against the sources; ${flagged} ${flagged === 1 ? "was" : "were"} flagged for your decision.`
    : "No fact-check results are attached to this answer.";
}

export function byline(m: ExportModel) {
  return `${m.status} · ${m.dateLabel} · Written by one model, fact-checked claim by claim by a second${/^approved/i.test(m.status) ? ", approved by you" : ""} on Ariadne`;
}

export const DISCLAIMER = "Approval is your sign-off. Ariadne's fact-check is a second review of the key claims, not a guarantee.";

export function toMarkdown(m: ExportModel): string {
  const out: string[] = [`# ${m.title}`, "", `${byline(m)}.`, ""];
  for (const b of m.blocks) {
    const text = b.kind === "heading" ? b.text : b.runs.map((r) => (r.bold ? `**${r.text}**` : r.text)).join("");
    if (b.kind === "heading") out.push(`${"#".repeat(b.level + 1)} ${text}`, "");
    else if (b.kind === "para") out.push(text, "");
    else out.push(`${"  ".repeat(b.depth)}${b.ordered ? `${b.ordered}.` : "-"} ${text}`);
  }
  out.push("", "## Sources", "");
  out.push(...(m.sources.length ? m.sources.map((s) => `${s.n}. ${s.label}: <${s.url}>`) : ["No web sources were cited."]), "");
  out.push("## Fact-check summary", "", factCheckLine(m), "");
  if (m.claims.length) {
    const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
    out.push("| Claim | Verdict | Your decision |", "| --- | --- | --- |");
    for (const c of m.claims) out.push(`| ${cell(c.claim)}${c.note ? `<br>${cell(c.note)}` : ""} | ${c.verdict} | ${c.decision} |`);
    out.push("");
  }
  out.push(DISCLAIMER, "");
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
