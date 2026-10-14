"use client";

import { useState } from "react";
import { VERDICT_LABEL } from "@/lib/knots";
import { isResolved, issueTitle, stripQuotes, type Issue, type IssueState } from "@/lib/workspace";

type Filter = "all" | "high" | "medium" | "resolved";

const STATE_LABEL: Record<IssueState, string> = {
  open: "Open",
  accepted: "Accepted",
  rejected: "Rejected",
  edited: "Edited",
  investigating: "Needs investigation",
};

// Fact-check projects: Daedalus gives each claim a verdict (wrong / unsupported) and a
// severity. Older projects only have Daedalus's confidence (high / medium / low).
const BADGE = {
  high: "bg-thread-soft text-thread-bright",
  medium: "bg-gate-bg text-gate-ink",
  low: "bg-tint text-ink-dim",
} as const;

const VERDICT_BADGE = {
  wrong: "bg-danger text-raised",
  unsupported: "bg-gate-bg text-gate-ink ring-1 ring-gate-ink/30",
  supported: "bg-ok text-raised",
} as const;

export function IssuesPanel({
  issues,
  challengeDone,
  canDecide,
  onDecide,
  onShowInDocument,
  anchored,
  compact = false,
}: {
  issues: Issue[];
  challengeDone: boolean;
  canDecide: boolean;
  onDecide: (issue: Issue, state: IssueState, extra?: { edit?: string; reason?: string }) => Promise<void>;
  onShowInDocument: (key: string) => void;
  anchored: Set<string>;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = {
    all: issues.length,
    high: issues.filter((i) => i.flag.confidence === "high" && !isResolved(i.state)).length,
    medium: issues.filter((i) => i.flag.confidence === "medium" && !isResolved(i.state)).length,
    resolved: issues.filter((i) => isResolved(i.state)).length,
  };
  const shown = issues.filter((i) =>
    filter === "all" ? true : filter === "resolved" ? isResolved(i.state) : i.flag.confidence === filter && !isResolved(i.state),
  );
  const open = issues.filter((i) => !isResolved(i.state)).length;

  return (
    <section aria-labelledby={compact ? undefined : "issues-title"} className="flex min-h-0 flex-col">
      {!compact ? (
        <div className="flex items-center gap-2">
          <h2 id="issues-title" className="font-serif text-[22px] leading-none">
            Flagged claims
          </h2>
          {issues.length ? <span className="rounded-full bg-thread px-1.5 text-[11px] leading-[18px] font-medium text-raised">{open}</span> : null}
        </div>
      ) : null}
      {!challengeDone ? (
        <p className="mt-3 rounded-xl bg-panel p-3 text-sm leading-normal text-ink-dim ring-1 ring-line">
          Nothing flagged yet. When Daedalus fact-checks the draft, each claim it marks Wrong or Unsupported shows here, with its evidence, for you to judge.
        </p>
      ) : issues.length === 0 ? (
        <p className="mt-3 rounded-xl bg-panel p-3 text-sm leading-normal text-ink-dim ring-1 ring-line">
          Daedalus flagged no claims. That does not prove the draft is right; read it yourself before you approve.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Issue filter">
            {(["all", "high", "medium", "resolved"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs ring-1 ${filter === f ? "bg-ink text-raised ring-ink" : "bg-raised text-ink-dim ring-line hover:text-ink"}`}
              >
                {f === "all" ? "All" : f === "high" ? "High" : f === "medium" ? "Medium" : "Resolved"} ({counts[f]})
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-normal text-ink-faint">
            High / Medium is Daedalus&apos;s rating of how much a claim matters. Daedalus is a second model, not an authority: open the evidence and source before you decide. Deciding on claims is not approving the answer.
          </p>
          <ol className="mt-3 space-y-3 pb-2">
            {shown.length === 0 ? <li className="text-sm text-ink-dim">Nothing here.</li> : null}
            {shown.map((issue) => (
              <IssueCard
                key={issue.key}
                issue={issue}
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
  canDecide,
  onDecide,
  anchored,
  onShow,
}: {
  issue: Issue;
  canDecide: boolean;
  onDecide: (issue: Issue, state: IssueState, extra?: { edit?: string; reason?: string }) => Promise<void>;
  anchored: boolean;
  onShow: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "reject">("idle");
  const [text, setText] = useState(issue.edit ?? issue.flag.fix ?? "");
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const { flag } = issue;
  const resolved = isResolved(issue.state);

  async function decide(state: IssueState, extra?: { edit?: string; reason?: string }) {
    setBusy(true);
    try {
      await onDecide(issue, state, extra);
      setMode("idle");
    } finally {
      setBusy(false);
    }
  }

  const outline = "rounded-lg bg-raised px-2.5 py-1.5 text-xs ring-1 ring-line hover:ring-thread disabled:opacity-50";
  return (
    <li id={`issue-${issue.key}`} className={`scroll-mt-4 rounded-xl bg-raised p-3.5 shadow-[0_1px_2px_rgba(31,26,20,0.06)] ring-1 ring-line ${resolved ? "opacity-80" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {flag.verdict ? (
            <span data-verdict={flag.verdict} className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_BADGE[flag.verdict]}`} title="Daedalus's fact-check verdict on this claim">
              {VERDICT_LABEL[flag.verdict]}
            </span>
          ) : null}
          {flag.confidence ? (
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ${BADGE[flag.confidence]}`} title={flag.verdict ? "Severity: how much this claim matters to your goal" : "Daedalus's confidence in this dispute"}>
              {flag.confidence}
            </span>
          ) : null}
          <span className="truncate text-sm font-medium">{issueTitle(flag)}</span>
        </div>
        <span className={`shrink-0 text-[11px] ${issue.state === "open" ? "text-ink-faint" : "text-ok"}`}>{STATE_LABEL[issue.state]}</span>
      </div>
      {flag.claim ? <p className="mt-2 text-sm leading-normal font-medium">“{stripQuotes(flag.claim)}”</p> : null}
      {flag.verdict && flag.evidence ? (
        <div className="mt-1 space-y-1 text-[13px] leading-normal text-ink-dim">
          <p>
            <span className="font-medium text-ink">Evidence: </span>
            {flag.evidence}
          </p>
          {flag.source && /^https?:\/\//i.test(flag.source) ? (
            <p className="break-words text-xs">
              <span className="text-ink-faint">Source: </span>
              <a href={flag.source} target="_blank" rel="noopener noreferrer nofollow" className="text-thread underline">
                {flag.source.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
              </a>
            </p>
          ) : flag.source ? (
            <p className="break-words text-xs"><span className="text-ink-faint">Source: </span>{flag.source}</p>
          ) : flag.verdict === "unsupported" ? (
            <p className="text-xs text-gate-ink">No source found: check this one yourself.</p>
          ) : null}
          {flag.fix ? <p className="text-xs"><span className="text-ink-faint">Suggested fix: </span>{flag.fix}</p> : null}
        </div>
      ) : (
        <p className="mt-1 text-[13px] leading-normal text-ink-dim">{flag.issue}</p>
      )}
      {issue.state === "edited" && issue.edit ? <p className="mt-1 text-xs text-ok">Your correction: {issue.edit}</p> : null}
      {issue.state === "rejected" && issue.reason ? <p className="mt-1 text-xs text-ink-dim">Your reason: {issue.reason}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {flag.verdict && flag.evidence ? null : (
          <button type="button" aria-expanded={evidence} onClick={() => setEvidence(!evidence)} className="text-thread hover:text-thread-bright">
            View evidence {evidence ? "▴" : "▾"}
          </button>
        )}
        {anchored ? (
          <button type="button" onClick={onShow} className="text-ink-dim hover:text-ink">
            Show in document
          </button>
        ) : null}
      </div>
      {evidence ? (
        <div className="mt-2 space-y-1 rounded-lg bg-panel p-2.5 text-xs leading-normal ring-1 ring-line">
          {flag.verdict && flag.evidence ? (
            <p>
              <span className="text-ink-dim">Evidence: </span>
              {flag.evidence}
            </p>
          ) : flag.opinion ? (
            <p className="text-gate-ink">No source given: Daedalus is working from its own knowledge here. Check this one yourself.</p>
          ) : flag.evidence ? (
            <p>
              <span className="text-ink-dim">From the draft: </span>
              {flag.evidence}
            </p>
          ) : (
            <p className="text-ink-dim">Daedalus gave no evidence for this point.</p>
          )}
          {flag.source ? (
            <p className="break-words">
              <span className="text-ink-dim">Source: </span>
              {/^https?:\/\//i.test(flag.source) ? (
                <a href={flag.source} target="_blank" rel="noopener noreferrer nofollow" className="text-thread underline">
                  {flag.source}
                </a>
              ) : (
                flag.source
              )}
            </p>
          ) : null}
          {flag.fix ? (
            <p>
              <span className="text-ink-dim">Suggested fix: </span>
              {flag.fix}
            </p>
          ) : null}
        </div>
      ) : null}
      {mode !== "idle" ? (
        <div className="mt-2">
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "edit" ? "Your correction for this claim" : "Why the claim is fine as written (optional)"}
            className="w-full rounded-lg bg-canvas px-2 py-1 text-sm ring-1 ring-line"
            maxLength={mode === "edit" ? 2000 : 1000}
          />
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className="px-2 py-1 text-xs text-ink-dim" onClick={() => setMode("idle")}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || (mode === "edit" && !text.trim())}
              className="rounded-lg bg-thread px-2.5 py-1.5 text-xs font-medium text-raised disabled:opacity-50"
              onClick={() => void decide(mode === "edit" ? "edited" : "rejected", mode === "edit" ? { edit: text } : { reason: text })}
            >
              Save
            </button>
          </div>
        </div>
      ) : canDecide ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
          {issue.state !== "investigating" ? (
            <button type="button" disabled={busy} className="mr-auto text-xs text-ink-dim hover:text-ink" onClick={() => void decide("investigating")}>
              Needs investigation
            </button>
          ) : (
            <span className="mr-auto" />
          )}
          {issue.state !== "open" ? (
            <button type="button" disabled={busy} className="px-2 py-1 text-xs text-ink-dim hover:text-ink" onClick={() => void decide("open")}>
              Undo
            </button>
          ) : null}
          <button type="button" disabled={busy} className={outline} onClick={() => { setText(issue.edit ?? flag.fix ?? ""); setMode("edit"); }}>
            Edit
          </button>
          <button type="button" disabled={busy} className={outline} onClick={() => { setText(issue.reason ?? ""); setMode("reject"); }}>
            Reject
          </button>
          {issue.state !== "accepted" ? (
            <button type="button" disabled={busy} className="rounded-lg bg-thread px-3 py-1.5 text-xs font-medium text-raised hover:bg-thread-bright disabled:opacity-50" onClick={() => void decide("accepted")}>
              Accept
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
