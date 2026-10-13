"use client";

import { useState } from "react";
import { isResolved, type Issue, type IssueState } from "@/lib/workspace";

type Filter = "open" | "investigating" | "resolved";

const STATE_LABEL: Record<IssueState, string> = {
  open: "Open",
  accepted: "Accepted",
  rejected: "Rejected",
  edited: "Edited",
  investigating: "Needs investigation",
};

export function IssuesPanel({
  issues,
  challengeDone,
  canDecide,
  onDecide,
  onShowInDocument,
  anchored,
}: {
  issues: Issue[];
  challengeDone: boolean;
  canDecide: boolean;
  onDecide: (issue: Issue, state: IssueState, extra?: { edit?: string; reason?: string }) => Promise<void>;
  onShowInDocument: (key: string) => void;
  anchored: Set<string>;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const counts = {
    open: issues.filter((i) => i.state === "open").length,
    investigating: issues.filter((i) => i.state === "investigating").length,
    resolved: issues.filter((i) => isResolved(i.state)).length,
  };
  const shown = issues.filter((i) =>
    filter === "open" ? i.state === "open" : filter === "investigating" ? i.state === "investigating" : isResolved(i.state),
  );

  return (
    <section aria-labelledby="issues-title" className="flex min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="issues-title" className="text-xs font-semibold tracking-[0.14em] text-ink-dim uppercase">
          Issues from Daedalus
        </h2>
        <span className="text-xs text-ink-faint">{issues.length} total</span>
      </div>
      {!challengeDone ? (
        <p className="mt-3 text-sm leading-normal text-ink-dim">
          Daedalus (GPT) has not challenged the draft yet. When it does, each objection shows here as an issue for you to judge.
        </p>
      ) : issues.length === 0 ? (
        <p className="mt-3 text-sm leading-normal text-ink-dim">
          Daedalus listed no disputes. That does not mean the draft is right; read it yourself before you approve.
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-1" role="tablist" aria-label="Issue filter">
            {(["open", "investigating", "resolved"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={
                  filter === f
                    ? "bg-ink px-2 py-1 text-xs text-raised"
                    : "bg-panel px-2 py-1 text-xs text-ink-dim ring-1 ring-line hover:text-ink"
                }
              >
                {f === "open" ? "Open" : f === "investigating" ? "Investigating" : "Resolved"} {counts[f]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-normal text-ink-faint">
            Daedalus is a second model, not an authority. Resolving issues is not approving the deliverable.
          </p>
          <ol className="mt-3 min-h-0 space-y-3 overflow-y-auto pb-4">
            {shown.length === 0 ? <li className="text-sm text-ink-dim">Nothing here.</li> : null}
            {shown.map((issue) => (
              <IssueCard
                key={issue.key}
                issue={issue}
                number={issues.indexOf(issue) + 1}
                canDecide={canDecide}
                onDecide={onDecide}
                anchored={anchored.has(issue.key)}
                onShow={() => onShowInDocument(issue.key)}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function IssueCard({
  issue,
  number,
  canDecide,
  onDecide,
  anchored,
  onShow,
}: {
  issue: Issue;
  number: number;
  canDecide: boolean;
  onDecide: (issue: Issue, state: IssueState, extra?: { edit?: string; reason?: string }) => Promise<void>;
  anchored: boolean;
  onShow: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "reject">("idle");
  const [text, setText] = useState(issue.edit ?? issue.flag.fix ?? "");
  const [busy, setBusy] = useState(false);
  const { flag } = issue;

  async function decide(state: IssueState, extra?: { edit?: string; reason?: string }) {
    setBusy(true);
    try {
      await onDecide(issue, state, extra);
      setMode("idle");
    } finally {
      setBusy(false);
    }
  }

  const btn = "px-2 py-1 text-xs ring-1 ring-line hover:ring-thread disabled:opacity-50";
  return (
    <li id={`issue-${issue.key}`} className="bg-raised p-3 ring-1 ring-line scroll-mt-4">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono text-ink-faint">#{number}</span>
        <span className="flex items-center gap-2">
          {flag.confidence ? <span className={flag.confidence === "high" ? "text-thread" : "text-ink-dim"}>{flag.confidence} confidence</span> : null}
          <span className={issue.state === "open" ? "text-ink-dim" : "text-ok"}>{STATE_LABEL[issue.state]}</span>
        </span>
      </div>
      {flag.claim ? (
        <p className="mt-2 text-sm leading-normal">
          <span className="text-ink-dim">Claim: </span>“{flag.claim}”
        </p>
      ) : null}
      <p className="mt-1 text-sm leading-normal">
        <span className="text-ink-dim">Why: </span>
        {flag.issue}
      </p>
      {flag.opinion ? (
        <p className="mt-1 text-xs leading-normal text-gate-ink">Opinion: no source in the draft. Daedalus is working from its own knowledge and cannot search the web here.</p>
      ) : flag.evidence ? (
        <p className="mt-1 text-xs leading-normal text-ink-dim">Evidence: {flag.evidence}</p>
      ) : null}
      {flag.fix ? <p className="mt-1 text-xs leading-normal text-ink-dim">Suggested fix: {flag.fix}</p> : null}
      {issue.state === "edited" && issue.edit ? <p className="mt-1 text-xs text-ok">Your correction: {issue.edit}</p> : null}
      {issue.state === "rejected" && issue.reason ? <p className="mt-1 text-xs text-ink-dim">Your reason: {issue.reason}</p> : null}
      {anchored ? (
        <button type="button" onClick={onShow} className="mt-2 text-xs text-thread hover:text-thread-bright">
          Show in document
        </button>
      ) : null}
      {mode !== "idle" ? (
        <div className="mt-2">
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "edit" ? "Your correction for this claim" : "Why the challenge is wrong (optional)"}
            className="w-full bg-canvas px-2 py-1 text-sm ring-1 ring-line"
            maxLength={mode === "edit" ? 2000 : 1000}
          />
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className="px-2 py-1 text-xs text-ink-dim" onClick={() => setMode("idle")}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || (mode === "edit" && !text.trim())}
              className="bg-thread px-2 py-1 text-xs text-raised disabled:opacity-50"
              onClick={() => void decide(mode === "edit" ? "edited" : "rejected", mode === "edit" ? { edit: text } : { reason: text })}
            >
              Save
            </button>
          </div>
        </div>
      ) : canDecide ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" disabled={busy} className={btn} onClick={() => void decide("accepted")}>
            Accept
          </button>
          <button type="button" disabled={busy} className={btn} onClick={() => { setText(issue.reason ?? ""); setMode("reject"); }}>
            Reject
          </button>
          <button type="button" disabled={busy} className={btn} onClick={() => { setText(issue.edit ?? flag.fix ?? ""); setMode("edit"); }}>
            Edit
          </button>
          {issue.state !== "investigating" ? (
            <button type="button" disabled={busy} className={btn} onClick={() => void decide("investigating")}>
              Needs investigation
            </button>
          ) : null}
          {issue.state !== "open" ? (
            <button type="button" disabled={busy} className="px-2 py-1 text-xs text-ink-dim" onClick={() => void decide("open")}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
