/*
  The Workspace view of a thread: which step is Draft / Challenge / Judge / Tie Off,
  what state the deliverable is in, the Challenge disputes as prioritized issues, and the
  note that "Revise with accepted issues" sends through the existing Ask-for-changes path.
  Pure and deterministic; shared by the server page, the client and the tests.
*/
import { CHANGE_MARKER } from "@/lib/change-notes";
import { parseCritique, type CritiqueFlag } from "@/lib/critique";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

export type ThreadSteps = { draft?: TaskDTO; challenge?: TaskDTO; judge?: TaskDTO; tieOff?: TaskDTO; finalCheck?: TaskDTO };

/** Plain labels for the four stages (fix plan U1). The myth names stay on the About page only. */
export const STAGE = { draft: "Draft", check: "Fact-check", review: "Your review", final: "Final answer", finalCheck: "Final check" } as const;

/** Finds the four steps of a starter thread. Custom threads may not have all four. */
export function threadSteps(project: Pick<ProjectDTO, "tasks" | "agents">): ThreadSteps {
  const provider = new Map(project.agents.map((a) => [a.id, a.provider]));
  const tasks = [...project.tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const draft = tasks.find((t) => provider.get(t.agentId) === "anthropic" && t.dependsOn.length === 0);
  const challenge = draft && tasks.find((t) => provider.get(t.agentId) === "openai" && t.dependsOn.includes(draft.id));
  const judge = challenge && tasks.find((t) => provider.get(t.agentId) === "human" && t.dependsOn.includes(challenge.id));
  const tieOff = judge && tasks.find((t) => provider.get(t.agentId) !== "human" && t.dependsOn.includes(judge.id));
  // Projects made since Oct 21 2026 fact-check the final answer too (B2); older ones have no such step.
  const finalCheck = tieOff && tasks.find((t) => provider.get(t.agentId) === "openai" && t.dependsOn.includes(tieOff.id));
  return { draft, challenge, judge, tieOff, finalCheck };
}

export function isStarterShape(steps: ThreadSteps): boolean {
  return Boolean(steps.draft && steps.challenge && steps.judge && steps.tieOff);
}

/** Small stable hash (FNV-1a, 32-bit, hex). Same text → same key, in browser and Worker. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** A dispute's key: stable while its claim and objection read the same, new once they change. */
export function issueKey(flag: Pick<CritiqueFlag, "claim" | "issue">): string {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `i${hashText(`${norm(flag.claim)}\u0001${norm(flag.issue)}`)}`;
}

// accepted = "Fix it (use the source)", rejected = "Keep as written", removed = "Remove",
// edited = your own correction. "investigating" is kept only for decisions saved before Oct 21.
export const ISSUE_STATES = ["accepted", "rejected", "edited", "removed", "investigating", "open"] as const;
export type IssueState = (typeof ISSUE_STATES)[number];
export type Decision = { flagKey: string; state: IssueState; edit: string | null; reason: string | null };
export type Issue = { key: string; flag: CritiqueFlag; state: IssueState; edit: string | null; reason: string | null; rank: number };

const CONF_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Prioritized: high confidence first; disputes with evidence from the draft before Opinion. */
export function issuesFrom(challengeOutput: string | null | undefined, decisions: Decision[]): Issue[] {
  const byKey = new Map(decisions.map((d) => [d.flagKey, d]));
  const flags = parseCritique(challengeOutput ?? "").flags;
  // Only flagged claims need a decision: a claim the check found supported is not an issue.
  return flags
    .filter((flag) => flag.verdict !== "supported")
    .map((flag, index) => {
      const key = issueKey(flag);
      const d = byKey.get(key);
      const rank = (flag.verdict === "wrong" ? 0 : flag.verdict === "disputed" ? 1 : flag.verdict === "unsupported" ? 2 : 3) * 1000 + (flag.confidence ? CONF_RANK[flag.confidence] : 3) * 100 + (flag.opinion ? 10 : 0) + index / 100;
      return { key, flag, state: d?.state ?? "open", edit: d?.edit ?? null, reason: d?.reason ?? null, rank };
    })
    .sort((a, b) => a.rank - b.rank);
}

export function isResolved(state: IssueState) {
  return state === "accepted" || state === "rejected" || state === "edited" || state === "removed";
}

/** What each decision means, in the words on its button (U2). */
export const DECISION_LABEL: Record<IssueState, string> = {
  open: "Not decided",
  accepted: "Use the source's version",
  rejected: "Keep it",
  edited: "Write my own",
  removed: "Remove it",
  investigating: "Not decided",
};

/** The note sent with "Revise with accepted issues" (Ask for changes at the Judge step). */
export function reviseNote(issues: Issue[], max = 2_000): string {
  const lines: string[] = [];
  for (const issue of issues) {
    const what = issue.flag.claim ? `"${issue.flag.claim}"` : issue.flag.section ?? "the draft";
    if (issue.state === "accepted") {
      lines.push(`- Fix it (use the source) ${what}: ${issue.flag.issue}${issue.flag.fix ? ` Suggested: ${issue.flag.fix}` : ""}`);
    } else if (issue.state === "edited" && issue.edit) {
      lines.push(`- For ${what}, use my correction: ${issue.edit}`);
    } else if (issue.state === "removed") {
      lines.push(`- Remove ${what} completely; do not restate it in other words.`);
    } else if (issue.state === "rejected") {
      lines.push(`- Keep as written ${what}${issue.reason ? `: ${issue.reason}` : ""}.`);
    }
  }
  if (lines.length === 0) return "";
  const head = "Revise the draft with my decisions on the challenge. Change only what these lines ask; keep the rest.";
  let note = [head, ...lines].join("\n");
  while (note.length > max && lines.length > 1) {
    lines.pop();
    note = [head, ...lines, "- (more decisions in the workspace)"].join("\n");
  }
  return note.slice(0, max);
}

export type DocState = "empty" | "draft" | "challenged" | "revised" | "tied_off" | "approved";

export function documentOf(steps: ThreadSteps): { text: string | null; from: "draft" | "tieOff" | null } {
  if (steps.tieOff?.status === "done" && steps.tieOff.output) return { text: steps.tieOff.output, from: "tieOff" };
  if (steps.draft?.output) return { text: steps.draft.output, from: "draft" };
  return { text: null, from: null };
}

export function docState(steps: ThreadSteps, approvedHash: string | null): DocState {
  const doc = documentOf(steps);
  if (!doc.text) return "empty";
  if (doc.from === "tieOff") return approvedHash && approvedHash === hashText(doc.text) ? "approved" : "tied_off";
  if (steps.challenge?.status === "done") return "challenged";
  return steps.draft?.instructions.includes(CHANGE_MARKER) ? "revised" : "draft";
}

export const DOC_STATE_LABEL: Record<DocState, string> = {
  empty: "Not started",
  draft: "Draft",
  challenged: "Fact-checked",
  revised: "Revised draft",
  tied_off: "Final answer · not approved",
  approved: "Approved",
};

export type NextAction =
  | { kind: "run"; task: TaskDTO; label: string; runs: number; then?: TaskDTO }
  | { kind: "review_draft"; task: TaskDTO; challenge: TaskDTO }
  | { kind: "open_judge"; task: TaskDTO }
  | { kind: "judge"; task: TaskDTO }
  | { kind: "approve" }
  | { kind: "busy"; task: TaskDTO }
  | { kind: "failed"; task: TaskDTO }
  | { kind: "done" }
  | { kind: "custom" };

/** The one explicit next step. Nothing runs without the user's click. */
export function nextAction(steps: ThreadSteps, approved: boolean): NextAction {
  const { draft, challenge, judge, tieOff } = steps;
  if (!draft || !challenge || !judge || !tieOff) return { kind: "custom" };
  const all = [draft, challenge, judge, tieOff];
  const running = all.find((t) => t.status === "running");
  if (running) return { kind: "busy", task: running };
  const failed = all.find((t) => t.status === "failed");
  if (failed) return { kind: "failed", task: failed };
  // Each step waits for you: Odysseus drafts; you accept the draft (or ask for a redraft)
  // before Daedalus fact-checks it. Nothing advances on its own.
  if (draft.status === "pending") return { kind: "run", task: draft, label: draft.instructions.includes(CHANGE_MARKER) ? "Redraft" : "Draft", runs: 1 };
  if (challenge.status === "pending") return { kind: "review_draft", task: draft, challenge };
  if (judge.status === "pending") return { kind: "open_judge", task: judge };
  if (judge.status === "awaiting_approval") return { kind: "judge", task: judge };
  if (tieOff.status === "pending") return { kind: "run", task: tieOff, label: "Write the final answer", runs: 1, then: steps.finalCheck };
  if (steps.finalCheck) {
    const fc = steps.finalCheck;
    if (fc.status === "running") return { kind: "busy", task: fc };
    if (fc.status === "failed") return { kind: "failed", task: fc };
    if (fc.status === "pending") return { kind: "run", task: fc, label: "Fact-check the final answer", runs: 1 };
  }
  return approved ? { kind: "done" } : { kind: "approve" };
}

/** A short title for an issue card, taken from the objection's first clause (no new words). */
export function issueTitle(flag: Pick<CritiqueFlag, "issue">): string {
  const first = flag.issue.split(/\s[—–-]\s|:\s|\.\s/)[0].trim();
  if (first.length <= 48) return first.replace(/\.$/, "");
  return `${first.split(/\s+/).slice(0, 7).join(" ")}…`;
}

/** Draft version shown on the document: 1 + each revision you asked for. */
export function draftVersion(draft: TaskDTO | undefined): number {
  if (!draft) return 1;
  return draft.instructions.split(CHANGE_MARKER).length;
}

export type StepStatus = "pending" | "running" | "done" | "failed" | "waiting";

export function stepStatus(task: TaskDTO | undefined): StepStatus {
  if (!task) return "pending";
  if (task.status === "awaiting_approval") return "waiting";
  if (task.status === "done" || task.status === "running" || task.status === "failed") return task.status;
  return "pending";
}

/** The model often quotes the claim itself; strip its quotes so the UI adds exactly one pair. */
export function stripQuotes(text: string): string {
  return text.trim().replace(/^["“”'‘’«»]+|["“”'‘’«»]+$/g, "").trim();
}

/** The one-line goal under the title: the first brief line that is not just the title again. */
export function goalLine(brief: string, name: string): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/^(goal|question|title)\s*:\s*/i, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const title = norm(name);
  for (const raw of brief.split(/\n/)) {
    const line = raw.replace(/^#+\s*/, "").trim();
    if (!line || /^deliverable\s*:/i.test(line) || /:\s*$/.test(line)) continue; // labels like "What I need:"
    const n = norm(line);
    if (!n || n === title || title.includes(n) || n.includes(title)) continue;
    return line;
  }
  return null;
}

/* ---------- final answer checks (fix plan B2, B6) ---------- */

const norm = (s: string) =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%.'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True when the claim reads in the text: whole, or its first 8 words, or 80% of its words in one sentence. */
export function claimInText(claim: string | null | undefined, text: string | null | undefined): boolean {
  const c = norm(stripQuotes(claim ?? "")).replace(/[.]+$/, "");
  const t = norm(text ?? "");
  if (!c || !t) return false;
  if (t.includes(c)) return true;
  const words = c.split(" ");
  if (words.length >= 8 && t.includes(words.slice(0, 8).join(" "))) return true;
  const bare = (w: string) => w.replace(/^[.'-]+|[.'-]+$/g, "");
  const want = new Set(words.map(bare).filter((w) => w.length > 2));
  if (want.size < 3) return false;
  return (text ?? "").split(/(?<=[.!?])\s+|\n+/).some((sentence) => {
    const have = new Set(norm(sentence).split(" ").map(bare));
    let hit = 0;
    for (const w of want) if (have.has(w)) hit++;
    return hit / want.size >= 0.8;
  });
}

const NOT_ESTABLISHED = /\b(?:not (?:been )?established|cannot be (?:determined|established|confirmed)|could not (?:be )?(?:determined|determine|established|establish)|unable to (?:determine|establish|confirm)|can(?:no|')t (?:determine|say))\b/i;

export type FinalConflict = { kind: "self" | "wrong" | "removed" | "no_answer"; text: string };

/**
 * Reasons the final answer must not be shown as finished (B6): the final check says it
 * contradicts itself or a source, a claim it states is Wrong, a claim you removed is back,
 * or it says the value cannot be determined although Ariadne read source pages.
 */
export function finalConflicts(args: { finalText: string | null | undefined; finalCheckOutput: string | null | undefined; issues: Issue[]; pagesRead: number }): FinalConflict[] {
  const out: FinalConflict[] = [];
  const text = args.finalText ?? "";
  if (!text) return out;
  const check = parseCritique(args.finalCheckOutput ?? "");
  if (check.consistency && !check.consistency.ok) out.push({ kind: "self", text: `The final check found a contradiction: ${check.consistency.text}` });
  for (const f of check.flags) {
    if (f.verdict === "wrong") out.push({ kind: "wrong", text: `“${stripQuotes(f.claim ?? f.issue)}” is contradicted by its source${f.fix ? `. Suggested: ${f.fix}` : "."}` });
  }
  for (const i of args.issues) {
    if (i.state === "removed" && i.flag.claim && claimInText(i.flag.claim, text)) out.push({ kind: "removed", text: `You removed “${stripQuotes(i.flag.claim)}”, but it is still in the final answer.` });
  }
  const answer = text.split(/^##\s+(?:sources|open points)\b/im)[0];
  if (args.pagesRead > 0 && NOT_ESTABLISHED.test(answer)) {
    out.push({ kind: "no_answer", text: `The answer says the value can't be determined, but Ariadne read ${args.pagesRead} source page${args.pagesRead === 1 ? "" : "s"}. Ask for the value the sources give, with its date.` });
  }
  return out;
}

/** The note sent when you ask for the final answer to be rewritten because of conflicts. */
export function conflictNote(conflicts: FinalConflict[]): string {
  return ["Rewrite the final answer to fix these problems. Keep everything else.", ...conflicts.map((c) => `- ${c.text}`)].join("\n").slice(0, 2_000);
}
