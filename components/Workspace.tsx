"use client";

import { LocalTime } from "@/components/LocalTime";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityTab, AgentActivityList, StatusIcon } from "@/components/ActivityPanel";
import { BrandMark } from "@/components/BrandMark";
import { FeedbackInvite } from "@/components/FeedbackForm";
import { IssuesPanel } from "@/components/IssuesPanel";
import MarkdownBody from "@/components/MarkdownBody";
import { SourcesPanel } from "@/components/SourcesPanel";
import type { WorkspaceData } from "@/lib/workspace-server";
import {
  DOC_STATE_LABEL,
  docState,
  documentOf,
  draftVersion,
  goalLine,
  stepStatus,
  hashText,
  isResolved,
  issuesFrom,
  nextAction,
  reviseNote,
  threadSteps,
  type Issue,
  type IssueState,
} from "@/lib/workspace";

type Tab = "document" | "issues" | "activity" | "context";

/** Wraps the first occurrence of each issue's quote in the rendered document with a <mark>. */
function anchorIssues(root: HTMLElement, issues: Issue[]): Set<string> {
  root.querySelectorAll("mark[data-issue]").forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
  root.normalize();
  const found = new Set<string>();
  issues.forEach((issue, index) => {
    const candidates = [issue.flag.claim, issue.flag.evidence]
      .map((q) => (q ?? "").replace(/^["“”']+|["“”']+$/g, "").trim())
      .filter((q) => q.length >= 12);
    for (const quote of candidates) {
      const needle = quote.slice(0, 80).toLowerCase();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? "";
        const at = text.toLowerCase().indexOf(needle);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        const mark = document.createElement("mark");
        mark.dataset.issue = issue.key;
        mark.id = `claim-${issue.key}`;
        mark.title = `Issue #${index + 1}`;
        mark.className = issue.state === "open" ? "bg-thread-soft cursor-pointer" : "bg-tint cursor-pointer";
        range.surroundContents(mark);
        found.add(issue.key);
        return;
      }
    }
  });
  return found;
}

export function Workspace({ initial }: { initial: WorkspaceData }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("document");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(initial.promptFeedback);
  const [anchored, setAnchored] = useState<Set<string>>(new Set());
  const docRef = useRef<HTMLDivElement>(null);

  const { project } = data;
  const steps = useMemo(() => threadSteps(project), [project]);
  const doc = documentOf(steps);
  const state = docState(steps, data.approvedHash);
  const issues = useMemo(() => issuesFrom(steps.challenge?.status === "done" ? steps.challenge.output : null, data.decisions), [steps, data.decisions]);
  const action = nextAction(steps, state === "approved");
  const openCount = issues.filter((i) => i.state === "open" || i.state === "investigating").length;
  const decided = issues.filter((i) => isResolved(i.state)).length;
  const changes = issues.filter((i) => i.state === "accepted" || i.state === "edited").length;
  const judging = action.kind === "judge";

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}/workspace`, { cache: "no-store" });
    if (res.ok) setData((await res.json()) as WorkspaceData);
  }, [project.id]);

  useEffect(() => {
    if (!docRef.current) return;
    // Anchors only make sense on the version Daedalus read (the draft).
    setAnchored(doc.from === "draft" ? anchorIssues(docRef.current, issues) : new Set());
  }, [doc.text, doc.from, issues]);

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
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

  async function runSteps(ids: string[]) {
    for (const id of ids) {
      setBusy(id === steps.challenge?.id ? "Daedalus (GPT) is challenging the draft…" : id === steps.tieOff?.id ? "Odysseus is writing the tied-off answer…" : "Odysseus (Claude) is drafting…");
      await post(`/api/tasks/${id}/run`);
    }
  }

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
      setTab("issues");
      requestAnimationFrame(() => document.getElementById(`issue-${mark.dataset.issue}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  const primary = "rounded-lg bg-thread px-3 py-2 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50";
  const secondary = "rounded-lg bg-raised px-3 py-2 text-sm ring-1 ring-line hover:ring-thread disabled:opacity-50";

  const actionBar = (() => {
    if (busy) return <p className="text-sm text-ink-dim" role="status">{busy} This can take a minute.</p>;
    switch (action.kind) {
      case "custom":
        return <p className="text-sm text-ink-dim">This project was made with an older custom thread that the Workspace cannot run. Its outputs are under Activity. <Link className="text-thread" href="/new">Start a new project</Link>.</p>;
      case "run": {
        const revising = action.task.id === steps.draft?.id && action.task.instructions.includes("Human requested changes:");
        const label = revising ? "Revise draft, then Challenge again" : action.label;
        return (
          <button className={primary} onClick={() => void act(label, () => runSteps(action.then ? [action.task.id, action.then.id] : [action.task.id]))}>
            {label} · uses {action.runs} run{action.runs > 1 ? "s" : ""}
          </button>
        );
      }
      case "open_judge":
        return <button className={primary} onClick={() => void act("Opening Judge…", () => post(`/api/tasks/${action.task.id}/run`).then(() => undefined))}>Open Judge</button>;
      case "judge":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={secondary}
              disabled={changes === 0}
              title={changes === 0 ? "Accept or edit at least one issue first" : undefined}
              onClick={() => void act("Sending your decisions…", () => post(`/api/tasks/${action.task.id}/approve`, { approved: false, note: reviseNote(issues) }).then(() => undefined))}
            >
              Revise with {changes} accepted issue{changes === 1 ? "" : "s"}
            </button>
            <button className={primary} onClick={() => void act("Tying off…", () => post(`/api/tasks/${action.task.id}/approve`, { approved: true }).then(() => undefined))}>
              Tie off this draft
            </button>
            <span className="text-xs text-ink-faint">Revise clears the draft and asks Odysseus again; it does not run until you click.</span>
          </div>
        );
      case "approve":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <button className={primary} onClick={approveNow}>Approve deliverable</button>
            <span className="text-xs text-ink-dim">Your sign-off. Ariadne does not guarantee it is correct.</span>
          </div>
        );
      case "busy":
        return <p className="text-sm text-ink-dim">A step is running. <button className="text-thread" onClick={() => void refresh()}>Refresh</button></p>;
      case "failed":
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-danger">“{action.task.title}” failed.</span>
            <button className={secondary} onClick={() => void act("Retrying…", () => post(`/api/tasks/${action.task.id}/rerun`).then(() => undefined))}>
              Retry · uses 1 run
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
    if (openCount > 0 && !window.confirm(`${openCount} issue${openCount === 1 ? " is" : "s are"} still open or under investigation. Approve the deliverable anyway?`)) return;
    void act("Approving…", async () => {
      const res = (await post(`/api/projects/${project.id}/approve`, { hash: hashText(doc.text ?? "") })) as { promptFeedback?: boolean };
      if (res.promptFeedback) setShowFeedback(true);
    });
  }

  function save() {
    if (!doc.text) return;
    const url = URL.createObjectURL(new Blob([doc.text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "deliverable"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const goal = goalLine(project.brief, project.name);
  const stepper: { label: string; task?: typeof steps.draft }[] = [
    { label: "Draft", task: steps.draft },
    { label: "Challenge", task: steps.challenge },
    { label: "Judge", task: steps.judge },
    { label: "Tie Off", task: steps.tieOff },
  ];
  const STEP_TEXT = { pending: "Not started", running: "In progress", done: "Completed", failed: "Failed", waiting: "Waiting on you" } as const;
  const version = draftVersion(steps.draft);
  const docTime = (doc.from === "tieOff" ? steps.tieOff : steps.draft)?.completedAt;
  const docLabel =
    doc.from === "tieOff" ? "Tied-off answer · Odysseus (Claude)" : doc.from === "draft" ? `${version > 1 ? "Revised draft" : "Draft"} · Odysseus (Claude)` : "Deliverable";
  const approveReady = action.kind === "approve";

  const sources = (
    <SourcesPanel
      projectId={project.id}
      name={project.name}
      brief={project.brief}
      sources={data.sources}
      events={project.events}
      locked={Boolean(busy)}
      onChanged={refresh}
    />
  );
  const issuesPanel = (compact: boolean) => (
    <IssuesPanel
      issues={issues}
      challengeDone={steps.challenge?.status === "done"}
      canDecide={judging}
      onDecide={decide}
      onShowInDocument={showInDocument}
      anchored={anchored}
      compact={compact}
    />
  );
  const centreTabs: { id: Tab; label: string }[] = [
    { id: "document", label: "Deliverable" },
    { id: "issues", label: `Review Issues${issues.length ? ` (${openCount})` : ""}` },
    { id: "activity", label: "Activity" },
  ];
  const mobileTabs: { id: Tab; label: string }[] = [{ id: "context", label: "Context" }, ...centreTabs];
  const centreTab = tab === "context" ? "document" : tab;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink lg:h-dvh">
      <header className="border-b border-line bg-raised">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
          <BrandMark />
          <div className="min-w-0 flex-1 basis-[55%] sm:basis-0">
            <h1 className="truncate font-serif text-[22px] leading-tight">{project.name}</h1>
            {goal ? <p className="truncate text-[13px] text-ink-dim" title={goal}>{goal}</p> : null}
          </div>
          <ol className="order-last flex w-full items-start gap-1 overflow-x-auto xl:order-none xl:w-auto" aria-label="Steps">
            {stepper.map((s, n) => {
              const st = stepStatus(s.task);
              return (
                <li key={s.label} className="flex min-w-[92px] flex-1 items-start gap-2">
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
            <span data-testid="doc-state" className={`rounded-full px-2 py-0.5 text-xs ${state === "approved" ? "bg-ok text-raised" : "bg-tint ring-1 ring-line"}`}>
              {DOC_STATE_LABEL[state]}
            </span>
            <button type="button" onClick={save} disabled={!doc.text} title="Download the current document as Markdown" className="rounded-lg bg-raised px-3 py-1.5 text-sm ring-1 ring-line hover:ring-thread disabled:opacity-50">
              Save
            </button>
            {state !== "approved" ? (
            <button
              type="button"
              onClick={() => (approveReady ? approveNow() : setTab("issues"))}
              disabled={Boolean(busy) || (!approveReady && !judging)}
              title={approveReady ? "Your sign-off on the tied-off answer" : judging ? "Judge the issues first" : "Available once the answer is tied off"}
              className="rounded-lg bg-thread px-3 py-1.5 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50"
            >
              Review & Approve
            </button>
            ) : null}
            <details className="relative">
              <summary className="cursor-pointer list-none px-1 text-lg text-ink-dim hover:text-ink" aria-label="More">⋯</summary>
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg bg-raised p-2 text-sm ring-1 ring-line">
                <Link className="block py-1 hover:text-thread" href="/new">New project</Link>
                <Link className="block py-1 hover:text-thread" href={`/settings?project=${project.id}`}>Settings</Link>
                <Link className="block py-1 hover:text-thread" href={`/feedback?project=${project.id}`}>Feedback</Link>
              </div>
            </details>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel px-4 py-2 lg:px-6">{actionBar}</div>
      </header>

      <div className="sticky top-0 z-10 flex border-b border-line bg-panel lg:hidden" role="tablist">
        {mobileTabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2 text-[13px] ${tab === t.id ? "border-b-2 border-thread font-medium" : "text-ink-dim"}`}>
            {t.id === "issues" ? `Issues${issues.length ? ` (${openCount})` : ""}` : t.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-3 lg:grid-cols-[minmax(250px,21%)_1fr_minmax(320px,27%)] lg:p-4">
        <aside className={`${tab === "context" ? "block" : "hidden"} min-h-0 overflow-y-auto lg:block`}>{sources}</aside>

        <main className={`${tab === "context" ? "hidden" : "flex"} min-h-0 flex-col lg:flex`}>
          <div className="hidden gap-5 border-b border-line px-1 lg:flex" role="tablist">
            {centreTabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={centreTab === t.id} onClick={() => setTab(t.id)} className={`-mb-px py-2 text-sm ${centreTab === t.id ? "border-b-2 border-thread font-medium text-ink" : "text-ink-dim hover:text-ink"}`}>
                {t.label}
              </button>
            ))}
          </div>
          {showFeedback && state === "approved" ? <div className="mt-3"><FeedbackInvite projectId={project.id} onClose={() => setShowFeedback(false)} /></div> : null}
          {error ? <p role="alert" className="mt-3 rounded-lg bg-thread-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto py-3">
            <div className={centreTab === "document" ? "" : "hidden"}>
              <article className="mx-auto max-w-[820px] rounded-2xl bg-white px-5 py-6 shadow-[0_1px_3px_rgba(31,26,20,0.08)] ring-1 ring-line md:px-12 md:py-10">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-dim">
                  <span className="tracking-[0.12em] uppercase">{docLabel}</span>
                  {doc.text ? (
                    <span className="rounded-full bg-tint px-2 py-0.5 ring-1 ring-line">
                      Version {version}
                      {docTime ? <> · <LocalTime iso={docTime} format="short" /></> : null}
                    </span>
                  ) : null}
                </div>
                {doc.text ? (
                  <div ref={docRef} data-testid="document" className="markdown paper">
                    <MarkdownBody text={doc.text} />
                  </div>
                ) : (
                  <div ref={docRef} className="text-sm leading-normal text-ink-dim">
                    <h2 className="font-serif text-3xl text-ink">{project.name}</h2>
                    <p className="mt-4">Nothing drafted yet.</p>
                    <p className="mt-2">
                      When you click <b>Draft and Challenge</b>, Odysseus (Claude) drafts from your brief and sources, then Daedalus (GPT) tries to prove the draft wrong. You judge each issue, revise if you want, tie off, and approve. Nothing runs until you click.
                    </p>
                  </div>
                )}
              </article>
            </div>
            {centreTab === "issues" ? <div className="mx-auto max-w-[820px]">{issuesPanel(false)}</div> : null}
            {centreTab === "activity" ? <div className="mx-auto max-w-[820px]"><ActivityTab project={project} steps={steps} /></div> : null}
          </div>
        </main>

        <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto lg:flex">
          <div className="rounded-2xl bg-raised p-4 ring-1 ring-line">
            {issuesPanel(true)}
            {issues.length > 0 ? (
              <p className="pt-3 text-xs text-ink-faint">
                {decided} decided · {openCount} open. {judging ? "" : "Decisions can be made at Judge."}
              </p>
            ) : null}
          </div>
          <AgentActivityList steps={steps} approvedAt={data.approvedAt} />
        </aside>
      </div>
    </div>
  );
}
