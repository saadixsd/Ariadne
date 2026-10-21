"use client";

import { LocalTime } from "@/components/LocalTime";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityTab, StatusIcon } from "@/components/ActivityPanel";
import { ClaimTable } from "@/components/ClaimTable";
import { ThreadPanel } from "@/components/ThreadPanel";
import { ExportPicker } from "@/components/ExportPicker";
import { buildExportModel } from "@/lib/export-doc";
import { HELP_MAILTO } from "@/lib/help";
import { diffParagraphs, type DiffLine, type Knot } from "@/lib/knots";
import { HomeMark } from "@/components/BrandMark";
import { FeedbackInvite } from "@/components/FeedbackForm";
import { IssuesPanel, type BulkDecision } from "@/components/IssuesPanel";
import MarkdownBody from "@/components/MarkdownBody";
import { SourcesPanel } from "@/components/SourcesPanel";
import { parseCritique } from "@/lib/critique";
import { citedUrls, hostOf, urlKey } from "@/lib/pages";
import type { TaskDTO } from "@/lib/types";
import type { WorkspaceData } from "@/lib/workspace-server";
import {
  conflictNote,
  DOC_STATE_LABEL,
  docState,
  documentOf,
  draftVersion,
  finalConflicts,
  goalLine,
  stepStatus,
  hashText,
  isResolved,
  issuesFrom,
  nextAction,
  reviseNote,
  STAGE,
  threadSteps,
  type Issue,
  type IssueState,
} from "@/lib/workspace";

type Tab = "document" | "claims" | "sources" | "details";
type StageId = "question" | "draft" | "check" | "final";

/** Quick options for "Change something" at each stage (U4). They fill the note; you can edit it. */
const QUICK: Record<StageId, string[]> = {
  question: ["Narrow the scope to: ", "Use this source: ", "The answer must give: "],
  draft: ["Answer the exact question first, in one sentence.", "Use this source: ", "Narrow the scope to: ", "Give the number with its as-of date and source."],
  check: ["Re-check this claim: ", "Use this source for the check: ", "Check against my uploaded file."],
  final: ["Lead with the number and its as-of date.", "Show both values where sources disagree.", "Make it shorter.", "Use this source: "],
};

/** Small content hash for the document's React key. */
function docKey(from: string | null, text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${from}:${text.length}:${h}`;
}

/** Lowercased text with curly quotes straightened and whitespace runs collapsed, plus each char's source index. */
function normalized(text: string): { s: string; at: number[] } {
  let s = "";
  const at: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (/\s/.test(c)) {
      if (space) continue;
      space = true;
      c = " ";
    } else space = false;
    c = c === "“" || c === "”" ? '"' : c === "‘" || c === "’" ? "'" : c.toLowerCase().charAt(0);
    s += c;
    at.push(i);
  }
  return { s, at };
}

/** The claim as it would read in the rendered page: no Markdown marks, no wrapping quotes. */
function claimNeedle(claim: string) {
  return normalized(
    claim
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]+/g, "")
      .replace(/^["“”'\s]+|["“”'\s.]+$/g, ""),
  ).s.trim();
}

/**
 * Wraps the claim of each issue in the rendered document with <mark>s. Matches across
 * inline elements (bold, links) and only ever on whole words: the full claim if present,
 * else the longest run of its opening words (at least three) that is.
 */
function anchorIssues(root: HTMLElement, issues: Issue[]): Set<string> {
  root.querySelectorAll("mark[data-issue]").forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
  root.normalize();
  const found = new Set<string>();
  issues.forEach((issue, index) => {
    const needleFull = claimNeedle(issue.flag.claim ?? "");
    if (needleFull.length < 12) return;
    // All text nodes, joined, with a map back to (node, offset).
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);
    const starts: number[] = [];
    let joined = "";
    for (const node of nodes) {
      starts.push(joined.length);
      joined += node.data;
    }
    const hay = normalized(joined);
    const words = needleFull.split(" ");
    let hit = -1;
    let len = 0;
    for (let count = words.length; count >= Math.min(3, words.length); count--) {
      const needle = words.slice(0, count).join(" ");
      if (needle.length < 12) break;
      let from = 0;
      while ((hit = hay.s.indexOf(needle, from)) >= 0) {
        const before = hay.s[hit - 1];
        const after = hay.s[hit + needle.length];
        if ((!before || /[^\p{L}\p{N}]/u.test(before)) && (!after || /[^\p{L}\p{N}]/u.test(after))) break;
        from = hit + 1;
      }
      if (hit >= 0) {
        len = needle.length;
        break;
      }
    }
    if (hit < 0) return;
    const startAt = hay.at[hit];
    const endAt = hay.at[hit + len - 1] + 1;
    // Wrap each text node's slice of [startAt, endAt) separately (a <mark> cannot span elements).
    nodes.forEach((node, i) => {
      const s0 = starts[i];
      const s1 = s0 + node.data.length;
      const from = Math.max(startAt, s0);
      const to = Math.min(endAt, s1);
      if (from >= to) return;
      const range = document.createRange();
      range.setStart(node, from - s0);
      range.setEnd(node, to - s0);
      const mark = document.createElement("mark");
      mark.dataset.issue = issue.key;
      if (!found.has(issue.key)) mark.id = `claim-${issue.key}`;
      mark.title = `Flagged claim #${index + 1}: click to see the fact-check`;
      mark.className = issue.state === "open" ? "bg-thread-soft cursor-pointer" : "bg-tint cursor-pointer";
      range.surroundContents(mark);
      found.add(issue.key);
    });
  });
  return found;
}

/** "Change something": a note plus quick options, at every stage (U4). Nothing runs until you send it. */
function ChangeSomething({ stage, label, hint, disabled, onSend }: { stage: StageId; label: string; hint: string; disabled?: boolean; onSend: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="relative" data-testid={`change-${stage}`}>
      <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg bg-raised px-3 py-2 text-sm ring-1 ring-line hover:ring-thread disabled:opacity-50">
        Change something
      </button>
      {open ? (
        <div className="absolute left-0 z-30 mt-1 w-[min(440px,86vw)] rounded-lg bg-raised p-3 shadow-lg ring-1 ring-line">
          <p className="text-xs text-ink-dim">{hint}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK[stage].map((q) => (
              <button key={q} type="button" className="rounded-full bg-tint px-2 py-0.5 text-[11px] ring-1 ring-line hover:ring-thread" onClick={() => setNote((n) => (n.trim() ? `${n.trim()}\n${q}` : q))}>
                {q.replace(/:\s*$/, "…")}
              </button>
            ))}
          </div>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What should change? This becomes a hard instruction for the next step." className="mt-2 w-full rounded-lg bg-canvas px-2 py-1 text-sm ring-1 ring-line" />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" className="px-2 py-1 text-xs text-ink-dim" onClick={() => setOpen(false)}>Cancel</button>
            <button
              type="button"
              disabled={!note.trim()}
              className="rounded-lg bg-thread px-3 py-1.5 text-xs font-medium text-raised hover:bg-thread-bright disabled:opacity-50"
              onClick={() => {
                const n = note.trim();
                setNote("");
                setOpen(false);
                onSend(n);
              }}
            >
              {label}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A disabled control always says why, in text you can read on a phone too (U8). */
function Why({ text }: { text: string | null }) {
  return text ? <span className="text-xs text-gate-ink" data-testid="why-disabled">{text}</span> : null;
}

export function Workspace({ initial, autoStart = false }: { initial: WorkspaceData; autoStart?: boolean }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("document");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(initial.promptFeedback);
  const [anchored, setAnchored] = useState<Set<string>>(new Set());
  const docRef = useRef<HTMLDivElement>(null);
  const [knot, setKnot] = useState<Knot | null>(null);
  const [view, setView] = useState<{ title: string; lines: DiffLine[] | null; text: string | null } | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState(initial.project.brief);
  const started = useRef(false);

  const { project, quota } = data;
  const steps = useMemo(() => threadSteps(project), [project]);
  const doc = documentOf(steps);
  const state = docState(steps, data.approvedHash);
  const checkDone = steps.challenge?.status === "done";
  const issues = useMemo(() => issuesFrom(checkDone ? steps.challenge!.output : null, data.decisions), [checkDone, steps.challenge, data.decisions]);
  const supported = useMemo(() => (checkDone ? parseCritique(steps.challenge!.output ?? "").flags.filter((f) => f.verdict === "supported") : []), [checkDone, steps.challenge]);
  const action = nextAction(steps, state === "approved");
  const openCount = issues.filter((i) => !isResolved(i.state)).length;
  const changes = issues.filter((i) => i.state === "accepted" || i.state === "edited" || i.state === "removed").length;
  const judging = action.kind === "judge";
  const pagesRead = data.pages.filter((p) => p.status === "ok").length;
  const finalChecked = steps.finalCheck?.status === "done" && doc.from === "tieOff";
  const conflicts = useMemo(
    () => (finalChecked ? finalConflicts({ finalText: doc.text, finalCheckOutput: steps.finalCheck?.output, issues, pagesRead }) : []),
    [finalChecked, doc.text, steps.finalCheck, issues, pagesRead],
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}/workspace`, { cache: "no-store" });
    if (res.ok) {
      const next = (await res.json()) as WorkspaceData;
      setData(next);
      return next;
    }
    return null;
  }, [project.id]);

  useEffect(() => {
    if (!docRef.current) return;
    // Anchors only make sense on the version the first fact-check read (the draft).
    setAnchored(doc.from === "draft" ? anchorIssues(docRef.current, issues) : new Set());
  }, [doc.text, doc.from, issues]);

  async function post<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json as T;
  }

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  /** Reads each cited page once, one request per page (B1, B7). A page that fails is recorded as unreadable. */
  async function readPages(text: string | null | undefined, known: { url: string }[]) {
    const have = new Set(known.map((p) => urlKey(p.url)));
    const todo = citedUrls(text).filter((u) => !have.has(urlKey(u)));
    for (const [i, url] of todo.entries()) {
      setBusy(`Reading the sources (${i + 1} of ${todo.length}): ${hostOf(url)}…`);
      await post(`/api/projects/${project.id}/pages`, { url }).catch(() => undefined);
      have.add(urlKey(url));
    }
    return [...have].map((url) => ({ url }));
  }

  async function runTask(id: string): Promise<TaskDTO | null> {
    const res = await post<{ task?: TaskDTO }>(`/api/tasks/${id}/run`);
    return res.task ?? null;
  }

  /** Fact-check one text: read its sources, check claim by claim, then check each quote against the page (B4). */
  async function check(checkId: string, text: string | null | undefined, label: string) {
    let known = await readPages(text, data.pages);
    setBusy(label);
    const done = await runTask(checkId);
    await readPages(done?.output, known);
    setBusy("Checking each quote against the page it came from…");
    await post(`/api/projects/${project.id}/pages/verify`, { taskId: checkId }).catch(() => undefined);
  }

  async function writeFinal() {
    if (!steps.tieOff) return;
    setBusy("Writing the final answer from your decisions…");
    const final = steps.tieOff.status === "done" ? steps.tieOff : await runTask(steps.tieOff.id);
    if (steps.finalCheck) await check(steps.finalCheck.id, final?.output, "Fact-checking the final answer, claim by claim…");
  }

  // Started from /new: write the draft right away (you clicked "Start" there).
  useEffect(() => {
    if (!autoStart || started.current || action.kind !== "run" || action.task.id !== steps.draft?.id) return;
    started.current = true;
    window.history.replaceState(null, "", `/p/${project.id}`);
    void act("Writing the draft…", () => runTask(action.task.id).then(() => undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  async function decide(issue: Issue, next: IssueState, extra?: { edit?: string; reason?: string }) {
    const res = await fetch(`/api/projects/${project.id}/issues`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagKey: issue.key, taskId: steps.challenge?.id, state: next, ...extra }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not save");
      return;
    }
    setData((d) => ({
      ...d,
      decisions: [...d.decisions.filter((x) => x.flagKey !== issue.key), ...(next === "open" ? [] : [{ flagKey: issue.key, state: next, edit: extra?.edit ?? null, reason: extra?.reason ?? null }])],
    }));
  }

  async function decideMany(list: BulkDecision[]) {
    const res = await fetch(`/api/projects/${project.id}/issues`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions: list.map((d) => ({ flagKey: d.issue.key, taskId: steps.challenge?.id, state: d.state })) }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not save");
      return;
    }
    const keys = new Set(list.map((d) => d.issue.key));
    setData((d) => ({ ...d, decisions: [...d.decisions.filter((x) => !keys.has(x.flagKey)), ...list.map((x) => ({ flagKey: x.issue.key, state: x.state, edit: null, reason: null }))] }));
  }

  type VersionRun = { id: string; output: string | null; completedAt: string | null; createdAt: string };
  async function versions(taskId: string): Promise<VersionRun[]> {
    const res = await fetch(`/api/tasks/${taskId}/runs?view=versions`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load versions (${res.status})`);
    return ((await res.json()) as { runs: VersionRun[] }).runs;
  }

  /** "What changed": the latest version of a step against the one before it (U5). */
  async function showChanges(taskId: string, label: string) {
    setTab("document");
    setView({ title: `${label} · loading what changed…`, lines: null, text: null });
    try {
      const runs = (await versions(taskId)).filter((r) => r.output);
      if (runs.length < 2) return setView({ title: `${label} · first version`, lines: null, text: runs.at(-1)?.output ?? "" });
      setView({ title: `What changed · ${label} v${runs.length} against v${runs.length - 1}`, lines: diffParagraphs(runs[runs.length - 2].output ?? "", runs[runs.length - 1].output ?? ""), text: null });
    } catch (e) {
      setView({ title: label, lines: null, text: (e as Error).message });
    }
  }

  async function selectKnot(k: Knot | null) {
    setKnot(k);
    setView(null);
    if (!k?.version || !k.taskId || !k.runId) return;
    setTab("document");
    setView({ title: `${k.step} v${k.version} · loading…`, lines: null, text: null });
    try {
      const runs = await versions(k.taskId);
      const at = runs.findIndex((r) => r.id === k.runId);
      const current = runs[at]?.output ?? "";
      let prior: string | null = at > 0 ? runs[at - 1].output : null;
      let priorLabel = at > 0 ? `v${at}` : "";
      if (k.kind === "tieoff" && at <= 0 && steps.draft) {
        const drafts = (await versions(steps.draft.id)).filter((r) => (r.completedAt ?? r.createdAt) <= (runs[at]?.completedAt ?? "9"));
        prior = drafts.at(-1)?.output ?? null;
        priorLabel = `draft v${drafts.length}`;
      }
      setView(
        prior === null
          ? { title: `${k.step} v${k.version}`, lines: null, text: current }
          : { title: `${k.step} v${k.version} · changes since ${priorLabel}`, lines: diffParagraphs(prior, current), text: null },
      );
    } catch (e) {
      setView({ title: `${k.step} v${k.version}`, lines: null, text: (e as Error).message });
    }
  }

  function rerunFrom(k: Knot) {
    if (!k.taskId) return;
    if (!window.confirm(`Run “${k.step}” again? The steps after it are cleared and wait for your click. Earlier versions stay in the history.`)) return;
    void selectKnot(null);
    const id = k.taskId;
    void act("Running that step again…", () => post(`/api/tasks/${id}/rerun`).then(() => undefined));
  }

  function showInDocument(key: string) {
    setTab("document");
    requestAnimationFrame(() => {
      const el = document.getElementById(`claim-${key}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-2", "ring-thread");
      setTimeout(() => el?.classList.remove("ring-2", "ring-thread"), 1500);
    });
  }

  useEffect(() => {
    const root = docRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const mark = (e.target as HTMLElement).closest("mark[data-issue]") as HTMLElement | null;
      if (!mark) return;
      setTab("claims");
      requestAnimationFrame(() => document.getElementById(`issue-${mark.dataset.issue}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  async function saveBrief() {
    await act("Saving the question…", async () => {
      const res = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: briefText }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      setBriefOpen(false);
    });
  }

  /** "Change something" at a stage: the note goes to that step as a hard instruction, then it runs again. */
  function steer(task: TaskDTO | undefined, note: string, label: string, after?: () => Promise<void>) {
    if (!task) return;
    void act(label, async () => {
      await post(`/api/tasks/${task.id}/steer`, { note });
      if (after) await after();
    });
  }

  const primary = "rounded-lg bg-thread px-3 py-2 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50";
  const secondary = "rounded-lg bg-raised px-3 py-2 text-sm ring-1 ring-line hover:ring-thread disabled:opacity-50";
  const resetAt = <LocalTime iso={quota.resetsAt} format="time" />;
  // What a click costs, said before you click (O3). A "run" is one whole question → final answer pass.
  const cost = quota.runOpen ? (
    <span className="text-xs text-ink-dim" data-testid="cost">Included in this run · {quota.rerunsLeft} redraft{quota.rerunsLeft === 1 ? "" : "s"} or re-check{quota.rerunsLeft === 1 ? "" : "s"} left</span>
  ) : (
    <span className="text-xs text-ink-dim" data-testid="cost">
      Uses 1 of your {quota.runsPerDay} run{quota.runsPerDay === 1 ? "" : "s"} today · {quota.runsLeft} left · resets at {resetAt} your time
    </span>
  );
  const redraftsLeft = quota.runOpen ? quota.rerunsLeft : quota.rerunsPerRun;
  const noRedrafts = quota.runOpen && quota.rerunsLeft <= 0 ? "No redrafts or re-checks left in this run: approve the final answer, or start a new run tomorrow." : null;

  const actionBar = (() => {
    if (busy) return <p className="text-sm text-ink-dim" role="status" data-testid="busy">{busy} This can take a minute or two.</p>;
    switch (action.kind) {
      case "custom":
        return <p className="text-sm text-ink-dim">This project was made with an older custom thread that this page cannot run. Its outputs are under Details. <Link className="text-thread" href="/new">Start a new project</Link>.</p>;
      case "run": {
        const isDraft = action.task.id === steps.draft?.id;
        const isFinalCheck = action.task.id === steps.finalCheck?.id;
        const label = isDraft ? (draftVersion(steps.draft) > 1 ? "Write the revised draft" : "Write the draft") : isFinalCheck ? "Fact-check the final answer" : "Write the final answer";
        const noRuns = !quota.runOpen && quota.runsLeft <= 0;
        return (
          <div className="flex w-full flex-wrap items-center gap-2" data-stage={isDraft ? "question" : "final"}>
            <button
              className={primary}
              disabled={noRuns}
              onClick={() =>
                void act(label, async () => {
                  if (isDraft) {
                    setBusy("Writing the draft…");
                    await runTask(action.task.id);
                  } else if (isFinalCheck) await check(action.task.id, steps.tieOff?.output, "Fact-checking the final answer, claim by claim…");
                  else await writeFinal();
                })
              }
            >
              {label}
            </button>
            {cost}
            {isDraft ? <button type="button" className="text-xs text-thread" onClick={() => setBriefOpen(true)}>Change the question first</button> : null}
            <Why text={noRuns ? `You have used today's ${quota.runsPerDay === 1 ? "run" : "runs"}. A new one is available at the reset.` : null} />
          </div>
        );
      }
      case "review_draft":
        return (
          <div className="flex w-full flex-wrap items-center gap-2" data-stage="draft">
            <span className="text-sm font-medium">{STAGE.draft}:</span>
            <span className="text-sm text-ink-dim">Is this what you asked for?</span>
            <button className={primary} data-testid="continue-draft" onClick={() => void act("Fact-checking…", () => check(action.challenge.id, steps.draft?.output, "Fact-checking the draft, claim by claim…"))}>
              Looks good → fact-check it
            </button>
            <ChangeSomething
              stage="draft"
              label={`Redraft with this note · ${redraftsLeft} left`}
              hint="Your note goes to the writer as a hard instruction, then the draft is rewritten. You see what changed."
              disabled={Boolean(noRedrafts)}
              onSend={(note) => steer(steps.draft, note, "Rewriting the draft with your note…", async () => { if (steps.draft) await showChanges(steps.draft.id, STAGE.draft); })}
            />
            {cost}
            <Why text={noRedrafts} />
          </div>
        );
      case "open_judge":
        return <button className={primary} onClick={() => void act("Opening your review…", () => post(`/api/tasks/${action.task.id}/run`).then(() => undefined))}>Open your review</button>;
      case "judge":
        return (
          <div className="flex w-full flex-wrap items-center gap-2" data-stage="check">
            <span className="text-sm font-medium">{STAGE.review}:</span>
            <button
              className={primary}
              data-testid="continue-review"
              disabled={openCount > 0}
              onClick={() =>
                void act("Writing the final answer…", async () => {
                  await post(`/api/tasks/${action.task.id}/approve`, { approved: true });
                  await writeFinal();
                })
              }
            >
              Looks good → write the final answer
            </button>
            <Why text={openCount > 0 ? `Decide the ${openCount} remaining claim${openCount === 1 ? "" : "s"} first (Keep, Fix it or Remove), or use the one-click options in the claims panel.` : null} />
            <button
              className={secondary}
              disabled={changes === 0 || Boolean(noRedrafts)}
              onClick={() => void act("Sending your decisions…", () => post(`/api/tasks/${action.task.id}/approve`, { approved: false, note: reviseNote(issues) }).then(() => undefined))}
            >
              Redraft with my {changes} decision{changes === 1 ? "" : "s"} first
            </button>
            <ChangeSomething
              stage="check"
              label={`Re-check with this note · ${redraftsLeft} left`}
              hint="Tell the fact-check what to look at again (a claim, a source). Your decisions on claims that come back the same are kept."
              disabled={Boolean(noRedrafts)}
              onSend={(note) =>
                steer(steps.challenge, note, "Re-checking with your note…", async () => {
                  if (steps.challenge) await post(`/api/projects/${project.id}/pages/verify`, { taskId: steps.challenge.id }).catch(() => undefined);
                })
              }
            />
            <Why text={changes === 0 && openCount === 0 ? null : changes === 0 ? "Redraft needs at least one Fix it, Remove or own correction." : noRedrafts} />
          </div>
        );
      case "approve":
        if (conflicts.length > 0) {
          return (
            <div className="flex w-full flex-wrap items-center gap-2" data-stage="final" data-testid="final-blocked">
              <span className="text-sm font-medium text-danger">The final answer has {conflicts.length} problem{conflicts.length === 1 ? "" : "s"} (see above the answer).</span>
              <button className={primary} disabled={Boolean(noRedrafts)} onClick={() => steer(steps.tieOff, conflictNote(conflicts), "Rewriting the final answer to fix the problems…", async () => { if (steps.finalCheck) await check(steps.finalCheck.id, (await refresh())?.project.tasks.find((t) => t.id === steps.tieOff?.id)?.output, "Fact-checking the final answer again…"); })}>
                Rewrite the final answer to fix them
              </button>
              <ChangeSomething stage="final" label="Rewrite with this note" hint="Your note goes to the writer as a hard instruction; the new final answer is fact-checked again." disabled={Boolean(noRedrafts)} onSend={(note) => steer(steps.tieOff, note, "Rewriting the final answer…", async () => { if (steps.finalCheck) await check(steps.finalCheck.id, (await refresh())?.project.tasks.find((t) => t.id === steps.tieOff?.id)?.output, "Fact-checking the final answer again…"); })} />
              <Why text={noRedrafts ?? "Approve is blocked until the final answer agrees with its fact-check."} />
            </div>
          );
        }
        return (
          <div className="flex w-full flex-wrap items-center gap-2" data-stage="final">
            <span className="text-sm font-medium">{STAGE.final}:</span>
            <button className={primary} data-testid="approve" onClick={approveNow}>
              Looks good → approve the final answer
            </button>
            <ChangeSomething
              stage="final"
              label={`Rewrite with this note · ${redraftsLeft} left`}
              hint="Your note goes to the writer as a hard instruction; the new final answer is fact-checked again before you approve it."
              disabled={Boolean(noRedrafts)}
              onSend={(note) =>
                steer(steps.tieOff, note, "Rewriting the final answer…", async () => {
                  const next = await refresh();
                  if (steps.finalCheck) await check(steps.finalCheck.id, next?.project.tasks.find((t) => t.id === steps.tieOff?.id)?.output, "Fact-checking the final answer again…");
                  if (steps.tieOff) await showChanges(steps.tieOff.id, STAGE.final);
                })
              }
            />
            <span className="text-xs text-ink-dim">Your sign-off. Ariadne does not guarantee it is correct.</span>
            <Why text={noRedrafts} />
          </div>
        );
      case "busy":
        return <p className="text-sm text-ink-dim">A step is running. <button className="text-thread" onClick={() => void refresh()}>Refresh</button></p>;
      case "failed":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-danger">“{action.task.title}” did not finish. Failed steps don&apos;t use a run.</span>
            <button
              className={secondary}
              onClick={() =>
                void act("Trying again…", async () => {
                  await post(`/api/tasks/${action.task.id}/rerun`);
                  if (action.task.id === steps.challenge?.id || action.task.id === steps.finalCheck?.id) await post(`/api/projects/${project.id}/pages/verify`, { taskId: action.task.id }).catch(() => undefined);
                })
              }
            >
              Try again
            </button>
          </div>
        );
      case "done":
        return (
          <p className="text-sm text-ok">
            Approved {data.approvedAt ? <LocalTime iso={data.approvedAt} /> : null}. <Link className="text-thread" href={`/feedback?project=${project.id}`}>Tell us how it went</Link>
          </p>
        );
    }
  })();

  function approveNow() {
    if (openCount > 0) {
      setTab("claims");
      return;
    }
    void act("Approving…", async () => {
      const res = await post<{ promptFeedback?: boolean }>(`/api/projects/${project.id}/approve`, { hash: hashText(doc.text ?? "") });
      if (res.promptFeedback) setShowFeedback(true);
    });
  }

  function save() {
    if (doc.text) setExportOpen(true);
  }
  const buildExport = () =>
    buildExportModel({
      name: project.name,
      brief: project.brief,
      text: doc.text ?? "",
      status: state === "approved" ? "Approved answer" : DOC_STATE_LABEL[state],
      challenge: finalChecked ? steps.finalCheck?.output : steps.challenge?.output,
      issues,
    });

  const stepper: { label: string; task?: TaskDTO }[] = [
    { label: STAGE.draft, task: steps.draft },
    { label: STAGE.check, task: steps.challenge },
    { label: STAGE.review, task: steps.judge },
    { label: STAGE.final, task: steps.finalCheck?.status === "done" || !steps.finalCheck ? steps.tieOff : steps.tieOff?.status === "done" ? steps.finalCheck : steps.tieOff },
  ];
  const STEP_TEXT = { pending: "Not started", running: "In progress", done: "Done", failed: "Did not finish", waiting: "Waiting on you" } as const;
  const version = draftVersion(steps.draft);
  const docTime = (doc.from === "tieOff" ? steps.tieOff : steps.draft)?.completedAt;
  const docLabel = doc.from === "tieOff" ? STAGE.final : doc.from === "draft" ? (version > 1 ? `Revised draft` : STAGE.draft) : "Answer";
  const question = goalLine(project.brief, "") ?? project.name;

  const sources = (
    <div className="space-y-3">
      <SourcesPanel projectId={project.id} name={project.name} brief={project.brief} sources={data.sources} events={project.events} locked={Boolean(busy)} onChanged={() => refresh().then(() => undefined)} />
      <section className="rounded-2xl bg-raised p-4 ring-1 ring-line" data-testid="pages-read">
        <h2 className="text-[13px] font-semibold">Web pages Ariadne read</h2>
        <p className="mt-1 text-[11px] text-ink-faint">Each cited page is read once. The draft, the fact-check and the final answer all see the same text, so they can&apos;t disagree about what a page says.</p>
        {data.pages.length === 0 ? <p className="mt-2 text-[13px] text-ink-dim">None yet. Pages are read when the draft is fact-checked.</p> : null}
        <ul className="mt-2 space-y-1.5 text-[12px]">
          {data.pages.map((p) => (
            <li key={p.url} className="break-words">
              <span className={p.status === "ok" ? "text-ok" : "text-danger"}>{p.status === "ok" ? "✓ Read" : "✕ Could not read"}</span>{" "}
              <a className="text-thread underline" href={p.url} target="_blank" rel="noopener noreferrer nofollow">{p.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70)}</a>
              {p.note ? <span className="text-ink-faint"> · {p.note}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
  const whyNotDecide = !checkDone ? "You can decide once the fact-check is done." : judging ? null : steps.judge?.status === "done" ? "Decisions are closed: the final answer was written from them. Use “Change something” on the final answer instead." : "Decisions open when your review starts.";
  const claimsPanel = (compact: boolean) => (
    <IssuesPanel issues={issues} supported={supported} challengeDone={checkDone} canDecide={judging && !busy} whyNot={busy ? "Wait for the running step to finish." : whyNotDecide} onDecide={decide} onBulk={decideMany} onShowInDocument={showInDocument} anchored={anchored} compact={compact} />
  );
  const details = (
    <div className="space-y-3">
      <ThreadPanel projectId={project.id} steps={steps} approvedAt={data.approvedAt} decisions={data.decisions} selected={knot?.id ?? null} onSelect={(k) => void selectKnot(k)} onRerun={rerunFrom} locked={Boolean(busy) || action.kind === "busy"} onExport={save} />
      <ActivityTab project={project} steps={steps} />
    </div>
  );
  const sideTabs: { id: Exclude<Tab, "document">; label: string }[] = [
    { id: "claims", label: `Claims${openCount ? ` (${openCount} to decide)` : ""}` },
    { id: "sources", label: "Sources" },
    { id: "details", label: "Details" },
  ];
  const sideTab: Exclude<Tab, "document"> = tab === "document" ? "claims" : tab;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink lg:h-dvh">
      <header className="border-b border-line bg-raised">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
          <HomeMark />
          <div className="min-w-0 flex-1 basis-[55%] sm:basis-0">
            <h1 className="truncate font-serif text-[22px] leading-tight" title={project.name}>{project.name}</h1>
          </div>
          <ol className="order-last flex w-full items-start gap-1 overflow-x-auto xl:order-none xl:w-auto" aria-label="Stages">
            {stepper.map((s, n) => {
              const st = stepStatus(s.task);
              return (
                <li key={s.label} className="flex min-w-[96px] flex-1 items-start gap-2">
                  <StatusIcon status={st} />
                  <div className="leading-tight">
                    <p className={`text-[13px] ${st === "pending" ? "text-ink-dim" : "font-medium"}`}>{s.label}</p>
                    <p className={`text-[11px] ${st === "waiting" || st === "running" ? "text-thread" : st === "failed" ? "text-danger" : "text-ink-faint"}`}>{STEP_TEXT[st]}</p>
                  </div>
                  {n < stepper.length - 1 ? <span className="mt-2.5 hidden h-px w-6 bg-line-strong sm:block" /> : null}
                </li>
              );
            })}
          </ol>
          <div className="flex items-center gap-2">
            <span data-testid="doc-state" className={`rounded-full px-2 py-0.5 text-xs ${state === "approved" ? "bg-ok text-raised" : "bg-tint ring-1 ring-line"}`}>{DOC_STATE_LABEL[state]}</span>
            <button type="button" onClick={save} disabled={!doc.text} title={doc.text ? "Download as PDF, Word, PowerPoint or Markdown" : "Available once there is an answer"} aria-haspopup="dialog" data-testid="export-open" className="rounded-lg bg-raised px-3 py-1.5 text-sm ring-1 ring-line hover:ring-thread disabled:opacity-50">
              Save
            </button>
            <details className="relative">
              <summary className="cursor-pointer list-none px-1 text-lg text-ink-dim hover:text-ink" aria-label="More">⋯</summary>
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg bg-raised p-2 text-sm ring-1 ring-line">
                <Link className="block py-1 hover:text-thread" href="/new">New question</Link>
                <Link className="block py-1 hover:text-thread" href={`/settings?project=${project.id}`}>Settings</Link>
                <Link className="block py-1 hover:text-thread" href={`/feedback?project=${project.id}`}>Feedback</Link>
                <a className="block py-1 hover:text-thread" href={HELP_MAILTO}>Help</a>
              </div>
            </details>
          </div>
        </div>
        <div className="border-t border-line px-4 py-2 text-sm lg:px-6" data-testid="brief-line">
          {briefOpen ? (
            <div>
              <textarea rows={5} value={briefText} onChange={(e) => setBriefText(e.target.value)} maxLength={5000} aria-label="Question and brief" className="w-full rounded-lg bg-canvas px-2 py-1 text-sm ring-1 ring-line" />
              <div className="mt-1 flex items-center gap-2">
                <button type="button" className="rounded-lg bg-thread px-2.5 py-1 text-xs text-raised" onClick={() => void saveBrief()}>Save</button>
                <button type="button" className="text-xs text-ink-dim" onClick={() => { setBriefText(project.brief); setBriefOpen(false); }}>Cancel</button>
                <span className="text-xs text-ink-faint">{doc.text ? "Applies to the next draft: use “Change something” on the draft to redraft now." : "The draft uses this."}</span>
              </div>
            </div>
          ) : (
            <p className="truncate">
              <span className="text-ink-dim">Question: </span>
              {question}{" "}
              <button type="button" className="text-xs text-thread" onClick={() => { setBriefText(project.brief); setBriefOpen(true); }} data-testid="edit-brief">Edit</button>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel px-4 py-2 lg:px-6">{actionBar}</div>
      </header>

      <div className="sticky top-0 z-10 flex border-b border-line bg-panel lg:hidden" role="tablist">
        {([{ id: "document", label: "Answer" }, ...sideTabs] as { id: Tab; label: string }[]).map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 text-[13px] ${tab === t.id ? "border-b-2 border-thread font-medium" : "text-ink-dim"}`}>
            {t.id === "claims" ? `Claims${openCount ? ` (${openCount})` : ""}` : t.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(340px,34%)] lg:p-4">
        <main className={`${tab === "document" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`}>
          {showFeedback && state === "approved" ? <div className="mb-3"><FeedbackInvite projectId={project.id} onClose={() => setShowFeedback(false)} /></div> : null}
          {error ? <p role="alert" className="mb-3 rounded-lg bg-thread-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            {view ? (
              <article data-testid="knot-view" className="mx-auto max-w-[820px] rounded-2xl bg-white px-5 py-6 shadow-[0_1px_3px_rgba(31,26,20,0.08)] ring-1 ring-line md:px-12 md:py-10">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-dim">
                  <span className="tracking-[0.12em] uppercase">{view.title}</span>
                  <button type="button" className="text-thread" onClick={() => void selectKnot(null)}>Back to the current answer</button>
                </div>
                {view.lines ? (
                  <div className="space-y-2 text-[15px] leading-relaxed">
                    {view.lines.every((l) => l.t === "same") ? <p className="text-sm text-ink-dim">No changes from the previous version.</p> : <p className="text-xs text-ink-dim">Green is new, struck through is gone.</p>}
                    {view.lines.map((l, i) => (
                      <div key={i} data-diff={l.t} className={l.t === "add" ? "rounded border-l-2 border-ok bg-ok/10 px-2" : l.t === "del" ? "rounded border-l-2 border-danger bg-danger/10 px-2 text-ink-dim line-through" : "px-2"}>
                        <MarkdownBody text={l.s} />
                      </div>
                    ))}
                  </div>
                ) : view.text !== null ? (
                  <div className="markdown paper"><MarkdownBody text={view.text} /></div>
                ) : null}
              </article>
            ) : null}
            <div className={view ? "hidden" : ""}>
              {conflicts.length > 0 ? (
                <div role="alert" data-testid="conflicts" className="mx-auto mb-3 max-w-[820px] rounded-xl bg-thread-soft p-4 text-sm ring-1 ring-danger/40">
                  <p className="font-medium text-danger">Not ready: the final answer disagrees with its fact-check.</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">{conflicts.map((c, i) => <li key={i}>{c.text}</li>)}</ul>
                </div>
              ) : null}
              <article className="mx-auto max-w-[820px] rounded-2xl bg-white px-5 py-6 shadow-[0_1px_3px_rgba(31,26,20,0.08)] ring-1 ring-line md:px-12 md:py-10">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-dim">
                  <span className="tracking-[0.12em] uppercase">{docLabel}</span>
                  {doc.text ? (
                    <span className="flex items-center gap-2">
                      {(doc.from === "draft" && version > 1) || (doc.from === "tieOff" && (steps.tieOff?.instructions.includes("Human requested changes:") ?? false)) ? (
                        <button type="button" className="text-thread" data-testid="what-changed" onClick={() => { const t = doc.from === "tieOff" ? steps.tieOff : steps.draft; if (t) void showChanges(t.id, docLabel); }}>
                          What changed
                        </button>
                      ) : null}
                      <span className="rounded-full bg-tint px-2 py-0.5 ring-1 ring-line">
                        {doc.from === "draft" ? `Version ${version}` : finalChecked ? "Fact-checked" : "Not fact-checked yet"}
                        {docTime ? <> · <LocalTime iso={docTime} format="short" /></> : null}
                      </span>
                    </span>
                  ) : null}
                </div>
                {doc.text ? (
                  <>
                    {/* Keyed by content: the claim <mark>s rewrite this DOM, so React must replace it, not patch it. */}
                    <div key={docKey(doc.from, doc.text)} ref={docRef} data-testid="document" className="markdown paper">
                      <MarkdownBody text={doc.text} />
                    </div>
                    {doc.from === "tieOff" ? (
                      <ClaimTable checkOutput={finalChecked ? steps.finalCheck?.output : steps.challenge?.output} checkedVersion={finalChecked ? "final" : "draft"} text={doc.text} decisions={data.decisions} />
                    ) : null}
                  </>
                ) : (
                  <div ref={docRef} className="text-sm leading-normal text-ink-dim">
                    <h2 className="font-serif text-3xl text-ink">{project.name}</h2>
                    <p className="mt-4">Nothing written yet.</p>
                    <ol className="mt-3 list-decimal space-y-1 pl-5">
                      <li><b>{STAGE.draft}</b>: one model answers your question, citing a source for each claim.</li>
                      <li><b>{STAGE.check}</b>: a second model checks every key claim against its source: supported, not supported or wrong.</li>
                      <li><b>{STAGE.review}</b>: you decide only the flagged claims: keep, fix or remove.</li>
                      <li><b>{STAGE.final}</b>: the answer is rewritten from your decisions and checked again, with a claims table.</li>
                    </ol>
                    <p className="mt-3">You can step in at every stage with “Change something”. Nothing runs until you click.</p>
                  </div>
                )}
              </article>
            </div>
          </div>
        </main>

        <aside className={`${tab === "document" ? "hidden" : "flex"} min-h-0 flex-col gap-3 overflow-y-auto lg:flex`}>
          <div className="hidden gap-4 border-b border-line px-1 lg:flex" role="tablist">
            {sideTabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={sideTab === t.id} onClick={() => setTab(t.id)} className={`-mb-px py-2 text-sm ${sideTab === t.id ? "border-b-2 border-thread font-medium text-ink" : "text-ink-dim hover:text-ink"}`}>
                {t.label}
              </button>
            ))}
          </div>
          {sideTab === "claims" ? <div className="rounded-2xl bg-raised p-4 ring-1 ring-line">{claimsPanel(true)}</div> : null}
          {sideTab === "sources" ? sources : null}
          {sideTab === "details" ? details : null}
        </aside>
      </div>
      <ExportPicker open={exportOpen} onClose={() => setExportOpen(false)} build={buildExport} name={project.name} />
    </div>
  );
}
