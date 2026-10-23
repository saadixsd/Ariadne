"use client";

/*
  The one result page (Oct 22 redesign). The answer sits on top with each checked claim
  marked Checked / Needs you / Fixed; "Needs you" lists at most 5 claims; Approve, Copy and
  Export are always visible; "Change something" works on the same page throughout.
  Draft, fact-check and final check all still run (one progress indicator, no click-through
  screens): Ariadne moves on by itself and stops only where it needs you.
*/
import { LocalTime } from "@/components/LocalTime";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityTab } from "@/components/ActivityPanel";
import { ClaimTable } from "@/components/ClaimTable";
import { ThreadPanel } from "@/components/ThreadPanel";
import { ExportPicker } from "@/components/ExportPicker";
import { NeedsYou } from "@/components/NeedsYou";
import { buildExportModel } from "@/lib/export-doc";
import { HELP_MAILTO } from "@/lib/help";
import { diffParagraphs, type Knot } from "@/lib/knots";
import { HomeMark } from "@/components/BrandMark";
import { FeedbackInvite } from "@/components/FeedbackForm";
import MarkdownBody from "@/components/MarkdownBody";
import { SourcesPanel } from "@/components/SourcesPanel";
import { parseCritique, sourceLinks } from "@/lib/critique";
import { citedUrls, hostOf, urlKey } from "@/lib/pages";
import { changeSummary, openNeedsYou, PLAIN_VERDICT, triage, type Triaged } from "@/lib/simplify";
import type { TaskDTO } from "@/lib/types";
import type { WorkspaceData } from "@/lib/workspace-server";
import { conflictNote, decisionsToSave, docState, documentOf, finalConflicts, goalLine, hashText, isResolved, issuesFrom, mergeDecisions, nextAction, threadSteps, type IssueState, type ThreadSteps } from "@/lib/workspace";

type Tab = "answer" | "you" | "sources" | "details";
type Tone = "checked" | "needs" | "fixed";
type ClaimMark = { key: string; claim: string; tone: Tone; title: string };

const MARK_CLASS: Record<Tone, string> = {
  checked: "cursor-pointer underline decoration-ok decoration-2 underline-offset-4",
  needs: "cursor-pointer bg-gate-bg ring-1 ring-gate-ink/30",
  fixed: "cursor-pointer underline decoration-thread decoration-2 underline-offset-4",
};
const TONE_LABEL: Record<Tone, string> = { checked: "Checked", needs: "Needs you", fixed: "Fixed" };

/** The five parts of one run, as one progress indicator. */
const PHASES = ["Writing", "Fact-checking", "Your input", "Final answer", "Final check"] as const;

function phaseOf(steps: ThreadSteps): number {
  const { draft, challenge, judge, tieOff, finalCheck } = steps;
  if (!draft || draft.status !== "done") return 0;
  if (!challenge || challenge.status !== "done") return 1;
  if (!judge || judge.status !== "done") return 2;
  if (!tieOff || tieOff.status !== "done") return 3;
  if (finalCheck && finalCheck.status !== "done") return 4;
  return 5;
}

const QUICK_ANSWER = ["Lead with the number and its as-of date.", "Use this source: ", "Make it shorter.", "Show both values where sources disagree."];

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
function anchorIssues(root: HTMLElement, issues: ClaimMark[]): Set<string> {
  root.querySelectorAll("mark[data-issue]").forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
  root.normalize();
  const found = new Set<string>();
  issues.forEach((issue) => {
    const needleFull = claimNeedle(issue.claim);
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
      mark.title = issue.title;
      mark.dataset.tone = issue.tone;
      mark.className = MARK_CLASS[issue.tone];
      range.surroundContents(mark);
      found.add(issue.key);
    });
  });
  return found;
}

/** A disabled control always says why, next to it. */
function Why({ text }: { text: string | null }) {
  return text ? <span className="text-xs text-gate-ink" data-testid="why-disabled">{text}</span> : null;
}

function needsOf(d: WorkspaceData) {
  const s = threadSteps(d.project);
  return openNeedsYou(triage(issuesFrom(s.challenge?.status === "done" ? s.challenge.output : null, d.decisions))).length;
}

export function Workspace({ initial, autoStart = false }: { initial: WorkspaceData; autoStart?: boolean }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("answer");
  const [side, setSide] = useState<"sources" | "details">("sources");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(initial.promptFeedback);
  const [changeOpen, setChangeOpen] = useState(false);
  const [note, setNote] = useState("");
  const [knot, setKnot] = useState<Knot | null>(null);
  const [view, setView] = useState<{ title: string; added: string[]; removed: string[]; text: string | null } | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState(initial.project.brief);
  const docRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  // Choices still being saved: the run waits for them before it moves on (no stale read).
  const [saving] = useState(() => new Set<Promise<void>>());
  // Keys with a save in flight, and the latest choices on this page (read by advance()).
  const [pendingKeys] = useState(() => new Map<string, number>());
  const [savingCount, setSavingCount] = useState(0);
  // A mutable holder (like `saving`), read only in event handlers, never during render.
  const [latest] = useState(() => new Map([["decisions", initial.decisions]]));

  const { project, quota } = data;
  const steps = useMemo(() => threadSteps(project), [project]);
  const doc = documentOf(steps);
  const state = docState(steps, data.approvedHash);
  const approved = state === "approved";
  const checkDone = steps.challenge?.status === "done";
  const issues = useMemo(() => issuesFrom(checkDone ? steps.challenge!.output : null, data.decisions), [checkDone, steps.challenge, data.decisions]);
  const triaged = useMemo(() => triage(issues), [issues]);
  const needsOpen = openNeedsYou(triaged).length;
  const supported = useMemo(() => (checkDone ? parseCritique(steps.challenge!.output ?? "").flags.filter((f) => f.verdict === "supported") : []), [checkDone, steps.challenge]);
  const action = nextAction(steps, approved);
  const phase = phaseOf(steps);
  const runningTask = [steps.draft, steps.challenge, steps.tieOff, steps.finalCheck].find((t) => t?.status === "running");
  const pagesRead = data.pages.filter((p) => p.status === "ok").length;
  const finalWritten = doc.from === "tieOff";
  const finalChecked = finalWritten && (!steps.finalCheck || steps.finalCheck.status === "done");
  const finalCheckFailed = finalWritten && steps.finalCheck?.status === "failed";
  const conflicts = useMemo(
    () => (finalWritten && steps.finalCheck?.status === "done" ? finalConflicts({ finalText: doc.text, finalCheckOutput: steps.finalCheck?.output, issues: triaged, pagesRead }) : []),
    [finalWritten, doc.text, steps.finalCheck, triaged, pagesRead],
  );
  const freeFinalRewrite = quota.runsInWorkflowLeft >= 2;
  const canDecide = !busy && !runningTask && checkDone && !finalWritten;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}/workspace`, { cache: "no-store" });
    if (res.ok) {
      const fetched = (await res.json()) as WorkspaceData;
      // A save still in flight must not be undone by an older server copy.
      const next = { ...fetched, decisions: mergeDecisions(fetched.decisions, (latest.get("decisions") ?? []), pendingKeys.keys()) };
      latest.set("decisions", next.decisions);
      setData(next);
      return next;
    }
    return null;
  }, [project.id, pendingKeys, latest]);

  async function post<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json as T;
  }

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  /** Reads each cited page once, one request per page (Worker CPU). A page that fails is recorded as unreadable. */
  async function readPages(text: string | null | undefined, known: { url: string }[]) {
    const have = new Set(known.map((p) => urlKey(p.url)));
    const todo = citedUrls(text).filter((u) => !have.has(urlKey(u)));
    for (const [i, url] of todo.entries()) {
      setBusy(`Reading the sources (${i + 1} of ${todo.length}): ${hostOf(url)}`);
      await post(`/api/projects/${project.id}/pages`, { url }).catch(() => undefined);
      have.add(urlKey(url));
    }
    return [...have].map((url) => ({ url }));
  }

  async function runTask(id: string): Promise<TaskDTO | null> {
    const res = await post<{ task?: TaskDTO }>(`/api/tasks/${id}/run`);
    return res.task ?? null;
  }

  /** Fact-check one text: read its sources, check claim by claim, then check each quote against its page. */
  async function check(checkId: string, text: string | null | undefined, label: string, pages: { url: string }[]) {
    const known = await readPages(text, pages);
    setBusy(label);
    const done = await runTask(checkId);
    await readPages(done?.output, known);
    setBusy("Checking each quote against the page it came from");
    await post(`/api/projects/${project.id}/pages/verify`, { taskId: checkId }).catch(() => undefined);
  }

  /**
   * Moves the run on by itself, step by step, and stops only where it needs you (claims to
   * decide), on a failure, or when the final answer is ready to approve. Each step is still
   * its own request (Worker limits) and you can step in between any two.
   */
  async function advance() {
    await Promise.all([...saving]);
    let d = (await refresh()) ?? data;
    for (let i = 0; i < 8; i++) {
      const s = threadSteps(d.project);
      const a = nextAction(s, false);
      if (a.kind === "run" && a.task.id === s.draft?.id) {
        setBusy("Writing the answer");
        await runTask(a.task.id);
      } else if (a.kind === "review_draft") {
        await check(a.challenge.id, s.draft?.output, "Fact-checking the answer, claim by claim", d.pages);
      } else if (a.kind === "open_judge") {
        setBusy("Sorting what needs you");
        await runTask(a.task.id);
      } else if (a.kind === "judge") {
        const left = needsOf(d);
        if (left > 0) {
          setNotice(`Choose for the ${left} claim${left === 1 ? "" : "s"} under Needs you, then write the final answer.`);
          return;
        }
        setBusy("Writing the final answer");
        // Send every choice on this page again first, so none can be lost to a race.
        const challengeId = s.challenge?.id;
        const mine = challengeId ? decisionsToSave((latest.get("decisions") ?? []), challengeId) : [];
        if (mine.length) {
          const res = await fetch(`/api/projects/${project.id}/issues`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisions: mine }) });
          if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save your choices. Try again.");
        }
        await post(`/api/tasks/${a.task.id}/approve`, { approved: true });
      } else if (a.kind === "run" && a.task.id === s.tieOff?.id) {
        setBusy("Writing the final answer");
        await runTask(a.task.id);
      } else if (a.kind === "run" && a.task.id === s.finalCheck?.id) {
        await check(a.task.id, s.tieOff?.output, "Final check of the answer, claim by claim", d.pages);
      } else return;
      d = (await refresh()) ?? d;
    }
  }

  // Started from /new: run straight through (you clicked "Check" there).
  useEffect(() => {
    if (!autoStart || started.current) return;
    const timer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      window.history.replaceState(null, "", `/p/${project.id}`);
      void act("Starting", advance);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  /** A choice on a claim shows at once; it is saved in the background and undone if saving fails. */
  function decide(issue: Triaged, next: IssueState, extra?: { edit?: string }): Promise<void> {
    const before = (latest.get("decisions") ?? []);
    setError(null);
    const decisions = [...before.filter((x) => x.flagKey !== issue.key), ...(next === "open" ? [] : [{ flagKey: issue.key, state: next, edit: extra?.edit ?? null, reason: null }])];
    latest.set("decisions", decisions);
    setData((d) => ({ ...d, decisions }));
    pendingKeys.set(issue.key, (pendingKeys.get(issue.key) ?? 0) + 1);
    setSavingCount((n) => n + 1);
    const job: Promise<void> = fetch(`/api/projects/${project.id}/issues`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagKey: issue.key, taskId: steps.challenge?.id, state: next, ...extra }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save your choice");
      })
      .catch((e: Error) => {
        latest.set("decisions", before);
        setData((d) => ({ ...d, decisions: before }));
        setError(`${e.message}. Your choice was undone; try again.`);
      })
      .finally(() => {
        saving.delete(job);
        const left = (pendingKeys.get(issue.key) ?? 1) - 1;
        if (left > 0) pendingKeys.set(issue.key, left);
        else pendingKeys.delete(issue.key);
        setSavingCount((n) => n - 1);
      });
    saving.add(job);
    return job;
  }

  type VersionRun = { id: string; output: string | null; completedAt: string | null; createdAt: string };
  async function versions(taskId: string): Promise<VersionRun[]> {
    const res = await fetch(`/api/tasks/${taskId}/runs?view=versions`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load versions (${res.status})`);
    return ((await res.json()) as { runs: VersionRun[] }).runs;
  }

  /** "What changed": a short added / removed summary of the latest version against the one before. */
  async function showChanges(taskId: string, label: string) {
    setTab("answer");
    setView({ title: `${label} · loading what changed`, added: [], removed: [], text: null });
    try {
      const runs = (await versions(taskId)).filter((r) => r.output);
      if (runs.length < 2) return setView({ title: `${label} · first version`, added: [], removed: [], text: runs.at(-1)?.output ?? "" });
      const sum = changeSummary(diffParagraphs(runs[runs.length - 2].output ?? "", runs[runs.length - 1].output ?? ""));
      setView({ title: `What changed in the ${label.toLowerCase()}`, added: sum.added, removed: sum.removed, text: null });
    } catch (e) {
      setView({ title: label, added: [], removed: [], text: (e as Error).message });
    }
  }

  async function selectKnot(k: Knot | null) {
    setKnot(k);
    setView(null);
    if (!k?.version || !k.taskId || !k.runId) return;
    setTab("answer");
    try {
      const runs = await versions(k.taskId);
      const at = runs.findIndex((r) => r.id === k.runId);
      setView({ title: `${k.step} · version ${k.version}`, added: [], removed: [], text: runs[at]?.output ?? "" });
    } catch (e) {
      setView({ title: `${k.step} · version ${k.version}`, added: [], removed: [], text: (e as Error).message });
    }
  }

  function rerunFrom(k: Knot) {
    if (!k.taskId) return;
    if (!window.confirm(`Run “${k.step}” again? Earlier versions stay in the history.`)) return;
    void selectKnot(null);
    const id = k.taskId;
    void act("Running that step again", async () => {
      await post(`/api/tasks/${id}/rerun`);
      await advance();
    });
  }

  useEffect(() => {
    const root = docRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const mark = (e.target as HTMLElement).closest("mark[data-issue]") as HTMLElement | null;
      if (!mark) return;
      setTab("you");
      requestAnimationFrame(() => {
        const el = document.getElementById(`issue-${mark.dataset.issue}`);
        el?.closest("details")?.setAttribute("open", "");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  // Each checked claim, marked in the answer: Checked / Needs you / Fixed.
  const marks = useMemo<ClaimMark[]>(() => {
    const out: ClaimMark[] = [];
    const host = (src: string | null) => {
      const l = sourceLinks(src)[0];
      return l ? ` · ${hostOf(l)}` : "";
    };
    if (doc.from === "draft" && checkDone) {
      for (const i of triaged) {
        if (!i.flag.claim) continue;
        const tone: Tone = i.needsYou && !isResolved(i.state) ? "needs" : i.state === "accepted" || i.state === "edited" || i.state === "removed" ? "fixed" : "checked";
        const what = i.state === "removed" ? "will be removed" : i.state === "accepted" ? "will use the source's version" : i.state === "edited" ? "will use your version" : i.flag.verdict ? PLAIN_VERDICT[i.flag.verdict] : "checked";
        out.push({ key: i.key, claim: i.flag.claim, tone, title: `${TONE_LABEL[tone]}: ${what}${host(i.flag.source)}` });
      }
      for (const f of supported) if (f.claim) out.push({ key: `s-${f.id}`, claim: f.claim, tone: "checked", title: `Checked: matches the source${host(f.source)}` });
    } else if (doc.from === "tieOff" && steps.finalCheck?.status === "done") {
      for (const f of parseCritique(steps.finalCheck.output ?? "").flags) {
        if (!f.claim) continue;
        const tone: Tone = f.verdict === "wrong" || f.verdict === "disputed" ? "needs" : "checked";
        out.push({ key: `f-${f.id}`, claim: f.claim, tone, title: `${TONE_LABEL[tone]}: ${f.verdict ? PLAIN_VERDICT[f.verdict] : "checked"}${host(f.source)}` });
      }
    }
    return out;
  }, [doc.from, checkDone, triaged, supported, steps.finalCheck]);

  useEffect(() => {
    if (docRef.current) anchorIssues(docRef.current, marks);
  }, [doc.text, marks]);

  async function saveBrief() {
    await act("Saving the question", async () => {
      const res = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: briefText }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      setBriefOpen(false);
    });
  }

  /** "Change something": the note goes to the step that matters now, then the run moves on by itself. */
  function sendChange(text: string) {
    const n = text.trim();
    if (!n) return;
    setChangeOpen(false);
    setNote("");
    if (finalWritten && steps.tieOff) {
      const id = steps.tieOff.id;
      void act("Rewriting the final answer with your note", async () => {
        await post(`/api/tasks/${id}/steer`, { note: n });
        await advance();
        await showChanges(id, "Final answer");
      });
    } else if (steps.draft?.status === "done") {
      const id = steps.draft.id;
      void act("Rewriting the answer with your note", async () => {
        await post(`/api/tasks/${id}/steer`, { note: n });
        await advance();
      });
    } else if (steps.draft) {
      // Nothing written yet: the note joins the question.
      const id = steps.draft.id;
      void act("Adding your note", async () => {
        await post(`/api/tasks/${id}/steer`, { note: n });
        await advance();
      });
    }
  }

  function fixProblems() {
    if (!steps.tieOff) return;
    const id = steps.tieOff.id;
    const msg = finalCheckFailed && conflicts.length === 0 ? "Rewrite the final answer so every key claim has its source and as-of date." : conflictNote(conflicts);
    void act("Rewriting the final answer to fix the problems", async () => {
      await post(`/api/tasks/${id}/steer`, { note: msg });
      await advance();
    });
  }

  function approveNow(anyway: boolean) {
    if (anyway && !window.confirm("Approve this answer even though the final check found problems? They stay listed with the answer.")) return;
    void act("Approving", async () => {
      const res = await post<{ promptFeedback?: boolean }>(`/api/projects/${project.id}/approve`, { hash: hashText(doc.text ?? ""), anyway });
      if (res.promptFeedback) setShowFeedback(true);
    });
  }

  async function copy() {
    if (!doc.text) return;
    try {
      await navigator.clipboard.writeText(doc.text);
      setNotice("Copied the answer (Markdown) to your clipboard.");
    } catch {
      setError("Your browser did not allow copying. Use Export → Markdown instead.");
    }
  }

  const buildExport = () =>
    buildExportModel({
      name: project.name,
      brief: project.brief,
      text: doc.text ?? "",
      status: approved ? "Approved answer" : finalWritten ? "Final answer, not approved yet" : "Draft",
      challenge: finalChecked && steps.finalCheck ? steps.finalCheck.output : steps.challenge?.output,
      issues,
    });

  const primaryCls = "rounded-lg bg-thread px-3.5 py-2 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50";
  const secondaryCls = "rounded-lg bg-raised px-3 py-2 text-sm ring-1 ring-line hover:ring-thread disabled:opacity-50";
  const running = Boolean(busy) || Boolean(runningTask);
  const noRuns = !quota.runOpen && quota.runsLeft <= 0;

  // The one primary button for where the run is now.
  const primary = (() => {
    if (busy) return null;
    if (action.kind === "custom") return { label: "Start a new question", href: "/new" as string | undefined, why: "This older project can't run here; its outputs are under Details." };
    if (runningTask) return { label: "Refresh", onClick: () => void refresh(), why: "A step is running. This takes a minute or two." };
    if (action.kind === "failed") {
      const t = action.task;
      return {
        label: "Try again",
        onClick: () => void act("Trying again", async () => { await post(`/api/tasks/${t.id}/rerun`); if (t.id === steps.challenge?.id || t.id === steps.finalCheck?.id) await post(`/api/projects/${project.id}/pages/verify`, { taskId: t.id }).catch(() => undefined); await advance(); }),
        why: `“${t.title}” did not finish. Failed steps don't use a run.`,
      };
    }
    if (approved) return null;
    if (phase === 2) {
      return needsOpen > 0
        ? { label: "Write the final answer", disabled: true, why: `First choose for the ${needsOpen} claim${needsOpen === 1 ? "" : "s"} under Needs you.` }
        : savingCount > 0
          ? { label: "Write the final answer", disabled: true, why: "Saving your choices…" }
          : { label: "Write the final answer", onClick: () => void act("Writing the final answer", advance), why: null };
    }
    if (phase < 5) return { label: phase === 0 && !doc.text ? "Write the answer" : "Continue", onClick: () => void act("Continuing", advance), disabled: noRuns && !quota.runOpen, why: noRuns ? "Today's runs are used. A new one is available at the reset." : null };
    if (conflicts.length > 0 || finalCheckFailed) {
      return freeFinalRewrite
        ? { label: "Fix these problems", onClick: fixProblems, why: "Rewrites the final answer once more and checks it again (included)." }
        : { label: "Approve anyway", onClick: () => approveNow(true), why: "No rewrites left in this run. You can approve anyway, copy or export it, or ask a new question tomorrow." };
    }
    return { label: "Approve", onClick: () => approveNow(false), why: "Your sign-off. Ariadne does not guarantee it is correct." };
  })();
  const showApproveAnyway = !approved && phase === 5 && (conflicts.length > 0 || finalCheckFailed) && primary?.label !== "Approve anyway";
  const showApproveDisabled = !approved && phase < 5 && action.kind !== "custom";

  const question = goalLine(project.brief, "") ?? project.name;
  const pastedDraft = steps.draft?.model === "pasted";
  const docLabel = finalWritten ? "Final answer" : pastedDraft ? "The answer you pasted" : "Answer (draft)";
  const docTime = (finalWritten ? steps.tieOff : steps.draft)?.completedAt;
  const changedOnce = (steps.draft?.instructions.includes("Human requested changes:") ?? false) || (steps.tieOff?.instructions.includes("Human requested changes:") ?? false);
  const changeWhy = running ? "Wait for this step to finish." : !finalWritten && quota.runOpen && quota.rerunsLeft <= 0 ? "No rewrites left in this run: write the final answer, then you get one more rewrite there." : finalWritten && !freeFinalRewrite ? "No rewrites left in this run: approve, copy or export it." : null;

  const finishBar = (
    <div className="flex flex-wrap items-center gap-2" data-testid="finish-bar" data-phase={phase}>
      {busy ? (
        <p className="flex items-center gap-2 text-sm text-ink-dim" role="status" data-testid="busy">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-thread border-t-transparent" aria-hidden />
          {busy}… This can take a minute or two. You can read the page meanwhile.
        </p>
      ) : primary ? (
        primary.href ? (
          <Link className={primaryCls} href={primary.href}>{primary.label}</Link>
        ) : (
          <button className={primaryCls} data-testid="primary" disabled={primary.disabled} onClick={primary.onClick}>{primary.label}</button>
        )
      ) : null}
      {showApproveAnyway ? <button className={secondaryCls} data-testid="approve-anyway" disabled={running} onClick={() => approveNow(true)}>Approve anyway</button> : null}
      {showApproveDisabled ? <button className={secondaryCls} data-testid="approve" disabled title="Opens when the final answer is written and checked">Approve</button> : null}
      {approved ? (
        <span className="text-sm text-ok" data-testid="approved">✓ Approved {data.approvedAt ? <LocalTime iso={data.approvedAt} /> : null}</span>
      ) : null}
      <button className={secondaryCls} data-testid="copy" disabled={!doc.text} onClick={() => void copy()}>Copy</button>
      <button className={secondaryCls} data-testid="export-open" disabled={!doc.text} onClick={() => setExportOpen(true)} title="PDF, Word, PowerPoint or Markdown">Export</button>
      <div className="relative">
        <button type="button" className={secondaryCls} data-testid="change-something" aria-expanded={changeOpen} disabled={Boolean(changeWhy) || !steps.draft || action.kind === "custom"} onClick={() => setChangeOpen(!changeOpen)}>
          Change something
        </button>
        {changeOpen ? (
          <div className="absolute right-0 z-30 mt-1 w-[min(440px,86vw)] rounded-lg bg-raised p-3 shadow-lg ring-1 ring-line sm:left-0 sm:right-auto">
            <p className="text-xs text-ink-dim">{finalWritten ? "Your note goes to the writer; the final answer is rewritten and checked again." : "Your note goes to the writer; the answer is rewritten and fact-checked again. Your choices on claims are kept."}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_ANSWER.map((q) => (
                <button key={q} type="button" className="rounded-full bg-tint px-2 py-0.5 text-[11px] ring-1 ring-line hover:ring-thread" onClick={() => setNote((v) => (v.trim() ? `${v.trim()}\n${q}` : q))}>
                  {q.replace(/:\s*$/, "…")}
                </button>
              ))}
            </div>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What should change?" className="mt-2 w-full rounded-lg bg-canvas px-2 py-1 text-sm ring-1 ring-line" />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button type="button" className="px-2 py-1 text-xs text-ink-dim" onClick={() => setChangeOpen(false)}>Cancel</button>
              <button type="button" disabled={!note.trim()} className="rounded-lg bg-thread px-3 py-1.5 text-xs font-medium text-raised disabled:opacity-50" onClick={() => sendChange(note)}>
                {finalWritten ? "Rewrite the final answer" : "Rewrite the answer"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {!busy ? <Why text={primary?.disabled ? primary.why : null} /> : null}
      {!busy && primary && !primary.disabled && primary.why ? <span className="text-xs text-ink-dim">{primary.why}</span> : null}
      {!busy && changeWhy && !running ? <Why text={changeWhy} /> : null}
      {showApproveDisabled && !busy ? <span className="text-xs text-ink-faint">Approve opens when the final answer is ready.</span> : null}
    </div>
  );

  const progress = (
    <ol className="flex w-full items-center gap-1 overflow-x-auto" aria-label="Progress" data-testid="progress">
      {PHASES.map((label, i) => {
        const done = phase > i || approved;
        const now = phase === i && !approved;
        const live = now && running;
        const waiting = now && !running && i === 2 && needsOpen > 0;
        return (
          <li key={label} className="flex min-w-[92px] flex-1 items-center gap-1.5" data-state={done ? "done" : now ? "now" : "next"}>
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${done ? "bg-ok text-raised" : now ? "bg-thread text-raised" : "bg-tint ring-1 ring-line"}`} aria-hidden>
              {done ? "✓" : live ? <span className="h-2 w-2 animate-pulse rounded-full bg-raised" /> : ""}
            </span>
            <span className={`text-[12px] leading-tight ${done ? "" : now ? "font-medium" : "text-ink-faint"}`}>
              {label}
              {waiting ? <span className="block text-[10.5px] text-gate-ink">{needsOpen} to choose</span> : live ? <span className="block text-[10.5px] text-thread">working</span> : null}
            </span>
            {i < PHASES.length - 1 ? <span className={`h-px flex-1 ${done ? "bg-ok" : "bg-line-strong"}`} /> : null}
          </li>
        );
      })}
    </ol>
  );

  const answerCard = (
    <article className="mx-auto w-full max-w-[820px] rounded-2xl bg-white px-5 py-6 shadow-[0_1px_3px_rgba(31,26,20,0.08)] ring-1 ring-line md:px-10 md:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-dim">
        <span className="tracking-[0.12em] uppercase">{docLabel}</span>
        {doc.text ? (
          <span className="flex items-center gap-2">
            {changedOnce ? (
              <button type="button" className="text-thread" data-testid="what-changed" onClick={() => { const t = finalWritten ? steps.tieOff : steps.draft; if (t) void showChanges(t.id, finalWritten ? "Final answer" : "Answer"); }}>
                What changed
              </button>
            ) : null}
            <span className="rounded-full bg-tint px-2 py-0.5 ring-1 ring-line">
              {approved ? "Approved" : finalWritten ? (steps.finalCheck?.status === "done" ? "Final check done" : "Final check pending") : checkDone ? "Fact-checked" : "Not checked yet"}
              {docTime ? <> · <LocalTime iso={docTime} format="short" /></> : null}
            </span>
          </span>
        ) : null}
      </div>
      {marks.length ? (
        <p className="mb-3 flex flex-wrap gap-3 text-[11.5px] text-ink-dim" data-testid="legend">
          <span><span className="underline decoration-ok decoration-2 underline-offset-4">Checked</span> matches a source</span>
          <span><span className="bg-gate-bg px-1 ring-1 ring-gate-ink/30">Needs you</span> a source says otherwise</span>
          <span><span className="underline decoration-thread decoration-2 underline-offset-4">Fixed</span> changed by a choice</span>
          <span className="text-ink-faint">Click a marked claim for its source.</span>
        </p>
      ) : null}
      {doc.text ? (
        <>
          <div key={docKey(doc.from, doc.text)} ref={docRef} data-testid="document" className="markdown paper">
            <MarkdownBody text={doc.text} />
          </div>
          {finalWritten ? <ClaimTable checkOutput={finalChecked && steps.finalCheck ? steps.finalCheck.output : steps.challenge?.output} checkedVersion={finalChecked ? "final" : "draft"} text={doc.text} decisions={data.decisions} /> : null}
        </>
      ) : (
        <div ref={docRef} className="text-sm leading-normal text-ink-dim">
          <h2 className="font-serif text-3xl text-ink">{project.name}</h2>
          <p className="mt-4">{running ? "The writer is answering your question. The fact-checker checks it next, claim by claim." : "Nothing written yet."}</p>
          <p className="mt-2">The writer answers with a source for each claim, the fact-checker checks every key claim, and you only choose where a source says otherwise. You can change something at any point.</p>
        </div>
      )}
    </article>
  );

  const diffCard = view ? (
    <article data-testid="change-view" className="mx-auto mb-3 w-full max-w-[820px] rounded-2xl bg-white px-5 py-5 ring-1 ring-line md:px-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-dim">
        <span className="tracking-[0.12em] uppercase">{view.title}</span>
        <button type="button" className="text-thread" onClick={() => void selectKnot(null)}>Close</button>
      </div>
      {view.text !== null ? (
        <div className="markdown paper"><MarkdownBody text={view.text} /></div>
      ) : view.added.length === 0 && view.removed.length === 0 ? (
        <p className="text-sm text-ink-dim">No changes from the previous version.</p>
      ) : (
        <div className="space-y-2 text-[14.5px] leading-relaxed">
          <p className="text-sm text-ink-dim" data-testid="change-summary">{view.added.length} part{view.added.length === 1 ? "" : "s"} new or reworded · {view.removed.length} taken out</p>
          {view.added.map((s, i) => (
            <div key={i} className="rounded border-l-2 border-ok bg-ok/10 px-2" data-diff="add"><MarkdownBody text={s} /></div>
          ))}
          {view.removed.length ? (
            <details className="text-sm text-ink-dim">
              <summary className="cursor-pointer">Show what was taken out ({view.removed.length})</summary>
              {view.removed.map((s, i) => <div key={i} className="mt-1 px-2" data-diff="del"><MarkdownBody text={s} /></div>)}
            </details>
          ) : null}
        </div>
      )}
    </article>
  ) : null;

  const problemsBox =
    conflicts.length > 0 || finalCheckFailed ? (
      <div role="alert" data-testid="conflicts" className="mx-auto mb-3 w-full max-w-[820px] rounded-xl bg-gate-bg p-4 text-sm ring-1 ring-gate-ink/30">
        <p className="font-medium text-gate-ink">{finalCheckFailed ? "The final check did not finish." : `The final check found ${conflicts.length} thing${conflicts.length === 1 ? "" : "s"} to look at.`}</p>
        {conflicts.length ? <ul className="mt-1 list-disc space-y-1 pl-5">{conflicts.map((c, i) => <li key={i}>{c.text}</li>)}</ul> : null}
        <p className="mt-2 text-ink-dim">{freeFinalRewrite ? "“Fix these problems” rewrites it once more (included), or approve anyway." : "You can approve anyway, or copy or export it."}</p>
      </div>
    ) : null;

  const needsPanel = (
    <NeedsYou list={triaged} supportedCount={supported.length} checkDone={checkDone} canDecide={canDecide} whyNot={finalWritten && checkDone ? "Choices are closed: the final answer was written from them. Use “Change something” to change it." : running && checkDone ? "Wait for the running step to finish." : null} onDecide={decide} />
  );
  const sourcesPanel = (
    <div className="space-y-3">
      <SourcesPanel projectId={project.id} name={project.name} brief={project.brief} sources={data.sources} events={project.events} locked={running} onChanged={() => refresh().then(() => undefined)} />
      <section className="rounded-2xl bg-raised p-4 ring-1 ring-line" data-testid="pages-read">
        <h2 className="text-[13px] font-semibold">Web pages read</h2>
        <p className="mt-1 text-[11px] text-ink-faint">Each cited page is read once, and the writer and the fact-checker see the same text.</p>
        {data.pages.length === 0 ? <p className="mt-2 text-[13px] text-ink-dim">None yet.</p> : null}
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
  const detailsPanel = (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-dim">Every step, its versions, and a way to run any one again.</p>
      <ThreadPanel projectId={project.id} steps={steps} approvedAt={data.approvedAt} decisions={data.decisions} selected={knot?.id ?? null} onSelect={(k) => void selectKnot(k)} onRerun={rerunFrom} locked={running} onExport={() => setExportOpen(true)} />
      <ActivityTab project={project} steps={steps} />
    </div>
  );

  const mobileTabs: { id: Tab; label: string }[] = [
    { id: "answer", label: "Answer" },
    { id: "you", label: `Needs you${needsOpen ? ` (${needsOpen})` : ""}` },
    { id: "sources", label: "Sources" },
    { id: "details", label: "Details" },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink lg:h-dvh">
      <header className="border-b border-line bg-raised">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
          <HomeMark />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-[22px] leading-tight" title={project.name}>{project.name}</h1>
          </div>
          <span data-testid="doc-state" className={`rounded-full px-2 py-0.5 text-xs ${approved ? "bg-ok text-raised" : "bg-tint ring-1 ring-line"}`}>
            {approved ? "Approved" : phase === 5 ? "Ready to approve" : needsOpen > 0 && phase === 2 ? "Needs you" : running ? "Working" : "In progress"}
          </span>
          <details className="relative">
            <summary className="cursor-pointer list-none px-1 text-lg text-ink-dim hover:text-ink" aria-label="More">⋯</summary>
            <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg bg-raised p-2 text-sm ring-1 ring-line">
              <Link className="block py-1 hover:text-thread" href="/dashboard">My projects</Link>
              <Link className="block py-1 hover:text-thread" href="/new">New question</Link>
              <Link className="block py-1 hover:text-thread" href={`/settings?project=${project.id}`}>Settings</Link>
              <Link className="block py-1 hover:text-thread" href={`/feedback?project=${project.id}`}>Feedback</Link>
              <a className="block py-1 hover:text-thread" href={HELP_MAILTO}>Help</a>
            </div>
          </details>
        </div>
        <div className="border-t border-line px-4 py-2 lg:px-6">{progress}</div>
        <div className="border-t border-line px-4 py-2 text-sm lg:px-6" data-testid="brief-line">
          {briefOpen ? (
            <div>
              <textarea rows={5} value={briefText} onChange={(e) => setBriefText(e.target.value)} maxLength={5000} aria-label="Question and brief" className="w-full rounded-lg bg-canvas px-2 py-1 text-sm ring-1 ring-line" />
              <div className="mt-1 flex items-center gap-2">
                <button type="button" className="rounded-lg bg-thread px-2.5 py-1 text-xs text-raised" onClick={() => void saveBrief()}>Save</button>
                <button type="button" className="text-xs text-ink-dim" onClick={() => { setBriefText(project.brief); setBriefOpen(false); }}>Cancel</button>
                <span className="text-xs text-ink-faint">{doc.text ? "Used the next time the answer is rewritten (Change something)." : "The answer uses this."}</span>
              </div>
            </div>
          ) : (
            <p className="truncate">
              <span className="text-ink-dim">Question: </span>
              {question}{" "}
              <button type="button" className="text-xs text-thread" disabled={running} onClick={() => { setBriefText(project.brief); setBriefOpen(true); }} data-testid="edit-brief">Edit</button>
            </p>
          )}
        </div>
        <div className="border-t border-line bg-panel px-4 py-2 lg:px-6">{finishBar}</div>
      </header>

      <div className="sticky top-0 z-10 flex border-b border-line bg-panel lg:hidden" role="tablist">
        {mobileTabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 text-[13px] ${tab === t.id ? "border-b-2 border-thread font-medium" : "text-ink-dim"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(340px,34%)] lg:p-4">
        <main className={`${tab === "answer" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`}>
          {showFeedback && approved ? <div className="mb-3"><FeedbackInvite projectId={project.id} onClose={() => setShowFeedback(false)} /></div> : null}
          {error ? <p role="alert" className="mx-auto mb-3 w-full max-w-[820px] rounded-lg bg-thread-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
          {notice ? <p role="status" className="mx-auto mb-3 w-full max-w-[820px] rounded-lg bg-tint px-3 py-2 text-sm text-ok">{notice}</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            {problemsBox}
            {diffCard}
            {answerCard}
          </div>
        </main>
        <aside className={`${tab === "answer" ? "hidden" : "flex"} min-h-0 flex-col gap-3 overflow-y-auto lg:flex`}>
          <div className={`${tab === "you" ? "block" : "hidden"} lg:block`}>{needsPanel}</div>
          <div className={`${tab === "sources" || tab === "details" ? "block" : "hidden"} lg:block`}>
            <div className="hidden gap-4 border-b border-line px-1 lg:flex" role="tablist">
              {(["sources", "details"] as const).map((id) => (
                <button key={id} role="tab" aria-selected={side === id} onClick={() => setSide(id)} className={`-mb-px py-2 text-sm ${side === id ? "border-b-2 border-thread font-medium text-ink" : "text-ink-dim hover:text-ink"}`}>
                  {id === "sources" ? "Sources" : "Details"}
                </button>
              ))}
            </div>
            <div className="mt-3">{(tab === "sources" || tab === "details" ? tab : side) === "sources" ? sourcesPanel : detailsPanel}</div>
          </div>
        </aside>
      </div>
      <ExportPicker open={exportOpen} onClose={() => setExportOpen(false)} build={buildExport} name={project.name} />
    </div>
  );
}
