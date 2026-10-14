/*
  The thread: one knot per step that actually happened, oldest first. Built from the
  TaskRun history (each run is immutable), the issue decisions and the approval.
  Pure and deterministic; the server sends small rows and the browser builds knots,
  so the Worker does no parsing for it.
*/
import { parseCritique, type ClaimVerdict, type CritiqueFlag } from "@/lib/critique";
import { issueKey, issueTitle, stripQuotes, type ThreadSteps } from "@/lib/workspace";

export type ThreadRun = {
  id: string;
  taskId: string;
  attempt: number;
  outcome: string;
  model: string | null;
  error: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Only for Challenge runs (to count issues); null otherwise. */
  output: string | null;
};
export type ThreadDecision = { flagKey: string; state: string; edit: string | null; updatedAt: string };
export type ThreadData = { runs: ThreadRun[]; decisions: ThreadDecision[]; approvedAt: string | null };

export type KnotKind = "draft" | "revision" | "challenge" | "decisions" | "tieoff" | "approve" | "failed";
export type Knot = {
  id: string;
  kind: KnotKind;
  step: string;
  actor: "Odysseus (Claude)" | "Daedalus (GPT)" | "You";
  at: string | null;
  summary: string;
  /** Model task this knot belongs to (for diff and Rerun from here). */
  taskId: string | null;
  runId: string | null;
  /** 1-based version among this task's successful runs (draft/tie-off). */
  version: number | null;
  /** Issue or decision lines shown when the knot opens. */
  lines: string[];
  /** True for the latest knot of a model step whose task can be rerun now. */
  canRerun: boolean;
  waiting?: boolean;
};

const VERSIONED = new Set(["succeeded", "legacy"]);
const time = (r: ThreadRun) => r.completedAt ?? r.createdAt;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function buildKnots(data: ThreadData, steps: ThreadSteps): Knot[] {
  const { draft, challenge, tieOff } = steps;
  const role = (taskId: string) => (taskId === draft?.id ? "draft" : taskId === challenge?.id ? "challenge" : taskId === tieOff?.id ? "tieoff" : null);
  const runs = data.runs.filter((r) => role(r.taskId) && r.outcome !== "discarded").sort((a, b) => time(a).localeCompare(time(b)) || a.attempt - b.attempt);
  const decisions = new Map(data.decisions.map((d) => [d.flagKey, d]));
  const claimed = new Set<string>();
  const version = new Map<string, number>();
  const knots: Knot[] = [];
  const owner = new Map<string, string>();
  for (const run of runs) {
    if (role(run.taskId) !== "challenge" || !VERSIONED.has(run.outcome)) continue;
    for (const f of parseCritique(run.output ?? "").flags) {
      const key = issueKey(f);
      const d = decisions.get(key);
      if (!d) continue;
      if (!owner.has(key) || time(run) <= d.updatedAt) owner.set(key, run.id);
    }
  }

  for (const run of runs) {
    const r = role(run.taskId)!;
    const base = { id: run.id, taskId: run.taskId, runId: run.id, at: time(run), lines: [] as string[], canRerun: false, version: null as number | null };
    if (!VERSIONED.has(run.outcome)) {
      if (run.outcome !== "failed") continue;
      knots.push({ ...base, kind: "failed", step: `${r === "challenge" ? "Challenge" : r === "tieoff" ? "Tie Off" : "Draft"} did not finish`, actor: r === "challenge" ? "Daedalus (GPT)" : "Odysseus (Claude)", summary: (run.error ?? "The step failed").slice(0, 120) });
      continue;
    }
    if (r === "challenge") {
      const flags = parseCritique(run.output ?? "").flags;
      const v = verdictCounts(flags);
      knots.push({
        ...base,
        kind: "challenge",
        step: "Challenge",
        actor: "Daedalus (GPT)",
        summary: v.checked
          ? `${plural(v.checked, "claim")} checked: ${[v.supported && `${v.supported} supported`, v.unsupported && `${v.unsupported} unsupported`, v.wrong && `${v.wrong} wrong`].filter(Boolean).join(", ")}`
          : flags.length === 0
            ? "No issues raised"
            : `${plural(flags.length, "issue")} raised${flags.some((f) => f.confidence === "high") ? `, ${flags.filter((f) => f.confidence === "high").length} high` : ""}`,
        lines: flags.map((f) => `${f.verdict ? `${VERDICT_LABEL[f.verdict]} · ` : f.confidence ? `${f.confidence[0].toUpperCase()}${f.confidence.slice(1)} · ` : ""}${f.claim ? stripQuotes(f.claim).slice(0, 140) : issueTitle(f)}`),
      });
      const mine = flags.map((f) => ({ key: issueKey(f), title: f.claim ? stripQuotes(f.claim).slice(0, 100) : issueTitle(f) })).filter((f) => owner.get(f.key) === run.id && !claimed.has(f.key));
      if (mine.length) {
        mine.forEach((f) => claimed.add(f.key));
        const ds = mine.map((f) => ({ ...f, d: decisions.get(f.key)! }));
        const count = (s: string) => ds.filter((x) => x.d.state === s).length;
        const parts = ["accepted", "edited", "rejected", "investigating"].map((s) => (count(s) ? `${count(s)} ${s}` : "")).filter(Boolean);
        knots.push({
          id: `${run.id}-d`,
          kind: "decisions",
          step: "Your decisions",
          actor: "You",
          at: ds.map((x) => x.d.updatedAt).sort().at(-1) ?? null,
          summary: parts.join(" · "),
          taskId: null,
          runId: null,
          version: null,
          canRerun: false,
          lines: ds.map((x) => `${x.d.state[0].toUpperCase()}${x.d.state.slice(1)} · ${x.title}${x.d.edit ? `: “${x.d.edit.slice(0, 120)}”` : ""}`),
        });
      }
      continue;
    }
    const v = (version.get(run.taskId) ?? 0) + 1;
    version.set(run.taskId, v);
    knots.push({
      ...base,
      version: v,
      kind: r === "tieoff" ? "tieoff" : v === 1 ? "draft" : "revision",
      step: r === "tieoff" ? "Tie Off" : v === 1 ? "Draft" : "Revision",
      actor: "Odysseus (Claude)",
      summary: r === "tieoff" ? "The tied-off answer, written from the draft you judged" : v === 1 ? "First answer from your brief and sources" : "Revised with your decisions",
    });
  }

  // Rerun from here: the latest knot of each model step, when that step is finished.
  for (const task of [draft, challenge, tieOff]) {
    if (!task || (task.status !== "done" && task.status !== "failed")) continue;
    const last = [...knots].reverse().find((k) => k.taskId === task.id);
    if (last) last.canRerun = true;
  }

  if (data.approvedAt) {
    knots.push({ id: "approved", kind: "approve", step: "Approved", actor: "You", at: data.approvedAt, summary: "You signed off on the tied-off answer", taskId: null, runId: null, version: null, lines: [], canRerun: false });
  } else if (tieOff?.status === "done") {
    knots.push({ id: "approve", kind: "approve", step: "Approve", actor: "You", at: null, summary: "Waiting for your sign-off", taskId: null, runId: null, version: null, lines: [], canRerun: false, waiting: true });
  }
  return knots;
}

export const VERDICT_LABEL: Record<ClaimVerdict, string> = { supported: "Supported", unsupported: "Unsupported", wrong: "Wrong" };

export function verdictCounts(flags: Pick<CritiqueFlag, "verdict">[]) {
  const supported = flags.filter((f) => f.verdict === "supported").length;
  const unsupported = flags.filter((f) => f.verdict === "unsupported").length;
  const wrong = flags.filter((f) => f.verdict === "wrong").length;
  return { supported, unsupported, wrong, checked: supported + unsupported + wrong };
}

export type DiffLine = { t: "same" | "add" | "del"; s: string };

/** Paragraph-level diff (LCS). Capped so a long answer never costs much. */
export function diffParagraphs(before: string, after: string, cap = 400): DiffLine[] {
  const split = (s: string) => s.split(/\n{2,}|\n(?=[-*#>]|\d+\.)/).map((p) => p.trim()).filter(Boolean).slice(0, cap);
  const a = split(before);
  const b = split(after);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ t: "same", s: a[i] });
      i++;
      j++;
    }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: "del", s: a[i++] });
    else out.push({ t: "add", s: b[j++] });
  }
  while (i < a.length) out.push({ t: "del", s: a[i++] });
  while (j < b.length) out.push({ t: "add", s: b[j++] });
  return out;
}
