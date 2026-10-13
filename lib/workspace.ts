/*
  The Workspace view of a thread: which step is Draft / Challenge / Judge / Tie Off,
  what state the deliverable is in, the Challenge disputes as prioritized issues, and the
  note that "Revise with accepted issues" sends through the existing Ask-for-changes path.
  Pure and deterministic; shared by the server page, the client and the tests.
*/
import { CHANGE_MARKER } from "@/lib/change-notes";
import { parseCritique, type CritiqueFlag } from "@/lib/critique";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

export type ThreadSteps = { draft?: TaskDTO; challenge?: TaskDTO; judge?: TaskDTO; tieOff?: TaskDTO };

/** Finds the four steps of a starter thread. Custom threads may not have all four. */
export function threadSteps(project: Pick<ProjectDTO, "tasks" | "agents">): ThreadSteps {
  const provider = new Map(project.agents.map((a) => [a.id, a.provider]));
  const tasks = [...project.tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const draft = tasks.find((t) => provider.get(t.agentId) === "anthropic" && t.dependsOn.length === 0);
  const challenge = draft && tasks.find((t) => provider.get(t.agentId) === "openai" && t.dependsOn.includes(draft.id));
  const judge = challenge && tasks.find((t) => provider.get(t.agentId) === "human" && t.dependsOn.includes(challenge.id));
  const tieOff = judge && tasks.find((t) => provider.get(t.agentId) !== "human" && t.dependsOn.includes(judge.id));
  return { draft, challenge, judge, tieOff };
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

export const ISSUE_STATES = ["accepted", "rejected", "edited", "investigating", "open"] as const;
export type IssueState = (typeof ISSUE_STATES)[number];
export type Decision = { flagKey: string; state: IssueState; edit: string | null; reason: string | null };
export type Issue = { key: string; flag: CritiqueFlag; state: IssueState; edit: string | null; reason: string | null; rank: number };

const CONF_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Prioritized: high confidence first; disputes with evidence from the draft before Opinion. */
export function issuesFrom(challengeOutput: string | null | undefined, decisions: Decision[]): Issue[] {
  const byKey = new Map(decisions.map((d) => [d.flagKey, d]));
  const flags = parseCritique(challengeOutput ?? "").flags;
  return flags
    .map((flag, index) => {
      const key = issueKey(flag);
      const d = byKey.get(key);
      const rank = (flag.confidence ? CONF_RANK[flag.confidence] : 3) * 100 + (flag.opinion ? 10 : 0) + index / 100;
      return { key, flag, state: d?.state ?? "open", edit: d?.edit ?? null, reason: d?.reason ?? null, rank };
    })
    .sort((a, b) => a.rank - b.rank);
}

export function isResolved(state: IssueState) {
  return state === "accepted" || state === "rejected" || state === "edited";
}

/** The note sent with "Revise with accepted issues" (Ask for changes at the Judge step). */
export function reviseNote(issues: Issue[], max = 2_000): string {
  const lines: string[] = [];
  for (const issue of issues) {
    const what = issue.flag.claim ? `"${issue.flag.claim}"` : issue.flag.section ?? "the draft";
    if (issue.state === "accepted") {
      lines.push(`- Fix ${what}: ${issue.flag.issue}${issue.flag.fix ? ` Suggested: ${issue.flag.fix}` : ""}`);
    } else if (issue.state === "edited" && issue.edit) {
      lines.push(`- For ${what}, use my correction: ${issue.edit}`);
    } else if (issue.state === "rejected") {
      lines.push(`- Keep ${what}; I rejected the challenge${issue.reason ? `: ${issue.reason}` : ""}.`);
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
  challenged: "Challenged",
  revised: "Revised draft",
  tied_off: "Tied off · not approved",
  approved: "Approved",
};

export type NextAction =
  | { kind: "run"; task: TaskDTO; label: string; runs: number; then?: TaskDTO }
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
  if (draft.status === "pending") return { kind: "run", task: draft, label: "Draft and Challenge", runs: 2, then: challenge };
  if (challenge.status === "pending") return { kind: "run", task: challenge, label: "Challenge", runs: 1 };
  if (judge.status === "pending") return { kind: "open_judge", task: judge };
  if (judge.status === "awaiting_approval") return { kind: "judge", task: judge };
  if (tieOff.status === "pending") return { kind: "run", task: tieOff, label: "Write the tied-off answer", runs: 1 };
  return approved ? { kind: "done" } : { kind: "approve" };
}
