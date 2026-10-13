"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityPanel } from "@/components/ActivityPanel";
import { BrandMark } from "@/components/BrandMark";
import { FirstRunFeedback } from "@/components/FeedbackForm";
import { IssuesPanel } from "@/components/IssuesPanel";
import MarkdownBody from "@/components/MarkdownBody";
import { SourcesPanel } from "@/components/SourcesPanel";
import type { WorkspaceData } from "@/lib/workspace-server";
import {
  DOC_STATE_LABEL,
  docState,
  documentOf,
  hashText,
  isResolved,
  issuesFrom,
  nextAction,
  reviseNote,
  threadSteps,
  type Issue,
  type IssueState,
} from "@/lib/workspace";

type Tab = "document" | "issues" | "sources";

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

  const primary = "bg-thread px-3 py-2 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50";
  const secondary = "bg-raised px-3 py-2 text-sm ring-1 ring-line hover:ring-thread disabled:opacity-50";

  const actionBar = (() => {
    if (busy) return <p className="text-sm text-ink-dim" role="status">{busy} This can take a minute.</p>;
    switch (action.kind) {
      case "custom":
        return <p className="text-sm text-ink-dim">This project has a custom thread. Use the <Link className="text-thread" href={`/dashboard?project=${project.id}`}>Board</Link> to run it.</p>;
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
            <button
              className={primary}
              onClick={() => {
                if (openCount > 0 && !window.confirm(`${openCount} issue${openCount === 1 ? " is" : "s are"} still open or under investigation. Approve the deliverable anyway?`)) return;
                void act("Approving…", async () => {
                  const res = (await post(`/api/projects/${project.id}/approve`, { hash: hashText(doc.text ?? "") })) as { promptFeedback?: boolean };
                  if (res.promptFeedback) setShowFeedback(true);
                });
              }}
            >
              Approve deliverable
            </button>
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
            Approved {data.approvedAt ? new Date(data.approvedAt).toLocaleString() : ""}. <Link className="text-thread" href={`/feedback?project=${project.id}`}>Tell us how it went</Link>
          </p>
        );
    }
  })();

  const sources = (
    <SourcesPanel
      projectId={project.id}
      name={project.name}
      brief={project.brief}
      sources={data.sources}
      locked={Boolean(busy)}
      onChanged={refresh}
    />
  );
  const issuesPanel = (
    <IssuesPanel
      issues={issues}
      challengeDone={steps.challenge?.status === "done"}
      canDecide={judging}
      onDecide={decide}
      onShowInDocument={showInDocument}
      anchored={anchored}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-canvas text-ink">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-panel px-4 py-2">
        <BrandMark />
        <h1 className="min-w-0 flex-1 truncate font-serif text-[22px] leading-tight">{project.name}</h1>
        <span data-testid="doc-state" className={state === "approved" ? "bg-ok px-2 py-0.5 text-xs text-raised" : "bg-tint px-2 py-0.5 text-xs ring-1 ring-line"}>
          {DOC_STATE_LABEL[state]}
        </span>
        <nav className="flex items-center gap-3 text-sm">
          <Link className="text-ink-dim hover:text-ink" href="/new">New</Link>
          <details className="relative">
            <summary className="cursor-pointer text-ink-dim hover:text-ink">Advanced views</summary>
            <div className="absolute right-0 z-20 mt-1 w-40 bg-raised p-2 text-sm ring-1 ring-line">
              <Link className="block py-1 hover:text-thread" href={`/dashboard?project=${project.id}`}>Board</Link>
              <Link className="block py-1 hover:text-thread" href={`/tree?project=${project.id}`}>Tree</Link>
            </div>
          </details>
          <Link className="text-ink-dim hover:text-ink" href={`/feedback?project=${project.id}`}>Feedback</Link>
        </nav>
      </header>

      <div className="flex border-b border-line bg-panel lg:hidden" role="tablist">
        {(["document", "issues", "sources"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 py-2 text-sm ${tab === t ? "border-b-2 border-thread font-medium" : "text-ink-dim"}`}>
            {t === "document" ? "Document" : t === "issues" ? `Issues${issues.length ? ` (${openCount})` : ""}` : `Sources${data.sources.length ? ` (${data.sources.length})` : ""}`}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(240px,22%)_1fr_minmax(300px,28%)]">
        <aside className={`${tab === "sources" ? "block" : "hidden"} min-h-0 overflow-y-auto border-line p-4 lg:block lg:border-r`}>{sources}</aside>

        <main className={`${tab === "document" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">{actionBar}</div>
          {error ? <p role="alert" className="mx-4 mt-3 bg-thread-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-10">
            <div className="mx-auto max-w-[72ch]">
              <p className="mb-3 text-xs tracking-[0.14em] text-ink-dim uppercase">
                {doc.from === "tieOff" ? "Tied-off answer · Odysseus" : doc.from === "draft" ? `${state === "revised" || steps.draft?.instructions.includes("Human requested changes:") ? "Revised draft" : "Draft"} · Odysseus (Claude)` : "Deliverable"}
              </p>
              {doc.text ? (
                <div ref={docRef} data-testid="document" className="text-[15px] leading-relaxed">
                  <MarkdownBody text={doc.text} />
                </div>
              ) : (
                <div ref={docRef} className="bg-panel p-6 text-sm leading-normal text-ink-dim ring-1 ring-line">
                  <p>Nothing drafted yet.</p>
                  <p className="mt-2">
                    When you click <b>Draft and Challenge</b>, Odysseus (Claude) drafts from your brief and sources, then Daedalus (GPT) tries to prove the draft wrong. You judge each issue, revise if you want, tie off, and approve. Nothing runs until you click.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className={`${tab === "issues" ? "flex" : "hidden"} min-h-0 flex-col overflow-y-auto border-line p-4 lg:flex lg:border-l`}>
          {issuesPanel}
          {issues.length > 0 ? (
            <p className="mt-auto pt-3 text-xs text-ink-faint">
              {decided} decided · {openCount} open. {judging ? "" : "Decisions can be made at Judge."}
            </p>
          ) : null}
        </aside>
      </div>

      <ActivityPanel project={project} steps={steps} />
      {showFeedback ? <FirstRunFeedback projectId={project.id} onClose={() => setShowFeedback(false)} /> : null}
    </div>
  );
}
