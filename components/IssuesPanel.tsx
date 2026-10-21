"use client";

import { useState } from "react";
import { sourceLinks, type CritiqueFlag } from "@/lib/critique";
import { VERDICT_LABEL, verdictCounts, verdictSummary } from "@/lib/knots";
import { DECISION_LABEL, isResolved, issueTitle, stripQuotes, type Issue, type IssueState } from "@/lib/workspace";

export type DecideExtra = { edit?: string; reason?: string };
export type BulkDecision = { issue: Issue; state: IssueState };

const VERDICT_BADGE = {
  wrong: "bg-danger text-raised",
  unsupported: "bg-gate-bg text-gate-ink ring-1 ring-gate-ink/30",
  supported: "bg-ok text-raised",
  disputed: "bg-raised text-danger ring-1 ring-danger/50",
} as const;

const GROUPS: { id: string; title: string; test: (i: Issue) => boolean }[] = [
  { id: "wrong", title: "Wrong", test: (i) => i.flag.verdict === "wrong" },
  { id: "disputed", title: "Sources disagree", test: (i) => i.flag.verdict === "disputed" },
  { id: "unsupported", title: "Not supported by sources", test: (i) => i.flag.verdict === "unsupported" },
  { id: "other", title: "Other points", test: (i) => !i.flag.verdict },
];

/**
 * The fact-check, claim by claim. Every checked claim is counted; only flagged ones need you.
 * Decide them one by one, or in bulk (U3). Each button says what it does (U2).
 */
export function IssuesPanel({
  issues,
  supported,
  challengeDone,
  canDecide,
  whyNot,
  onDecide,
  onBulk,
  onShowInDocument,
  anchored,
  compact = false,
}: {
  issues: Issue[];
  /** Claims the check found supported: shown collapsed, no decision needed. */
  supported: CritiqueFlag[];
  challengeDone: boolean;
  canDecide: boolean;
  /** Why the decision buttons are disabled, shown next to them (U8). */
  whyNot: string | null;
  onDecide: (issue: Issue, state: IssueState, extra?: DecideExtra) => Promise<void>;
  onBulk: (list: BulkDecision[]) => Promise<void>;
  onShowInDocument: (key: string) => void;
  anchored: Set<string>;
  compact?: boolean;
}) {
  const [bulkBusy, setBulkBusy] = useState(false);
  const open = issues.filter((i) => !isResolved(i.state));
  const counts = verdictCounts([...supported, ...issues.map((i) => i.flag)]);
  const wrongWithFix = open.filter((i) => i.flag.verdict === "wrong" && i.flag.fix);
  const unsupportedOpen = open.filter((i) => i.flag.verdict === "unsupported");

  async function bulk(list: BulkDecision[]) {
    setBulkBusy(true);
    try {
      await onBulk(list);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section aria-labelledby={compact ? undefined : "issues-title"} className="flex min-h-0 flex-col" data-testid="claims-panel">
      <div className="flex items-center gap-2">
        <h2 id="issues-title" className={compact ? "text-[13px] font-semibold" : "font-serif text-[22px] leading-none"}>
          Fact-check, claim by claim
        </h2>
        {open.length ? <span className="rounded-full bg-thread px-1.5 text-[11px] leading-[18px] font-medium text-raised" title="Claims waiting for your decision">{open.length}</span> : null}
      </div>
      {!challengeDone ? (
        <p className="mt-3 rounded-xl bg-panel p-3 text-sm leading-normal text-ink-dim ring-1 ring-line">
          Nothing checked yet. When the fact-check runs, a second model checks every key claim of the draft against its sources and marks it supported, not supported or wrong. Only the claims that need your judgement wait for you here.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[13px] text-ink-dim" data-testid="claim-counts">
            {counts.checked} claim{counts.checked === 1 ? "" : "s"} checked: {verdictSummary(counts)}.
          </p>
          {issues.length === 0 ? (
            <p className="mt-3 rounded-xl bg-panel p-3 text-sm leading-normal text-ink-dim ring-1 ring-line">
              No claim needs your decision. The check is a second model&apos;s reading, not a guarantee: skim the answer yourself before you approve it.
            </p>
          ) : null}
          {canDecide && (wrongWithFix.length > 0 || unsupportedOpen.length > 0) ? (
            <div className="mt-3 rounded-xl bg-panel p-3 ring-1 ring-line" data-testid="bulk-actions">
              <p className="text-xs text-ink-dim">Decide in one click, or go through them one by one below.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {wrongWithFix.length ? (
                  <button type="button" disabled={bulkBusy} className="rounded-lg bg-thread px-2.5 py-1.5 text-xs font-medium text-raised hover:bg-thread-bright disabled:opacity-50" onClick={() => void bulk(wrongWithFix.map((issue) => ({ issue, state: "accepted" })))}>
                    Apply suggested fix to all wrong ({wrongWithFix.length})
                  </button>
                ) : null}
                {unsupportedOpen.length ? (
                  <button type="button" disabled={bulkBusy} className="rounded-lg bg-raised px-2.5 py-1.5 text-xs ring-1 ring-line hover:ring-thread disabled:opacity-50" onClick={() => void bulk(unsupportedOpen.map((issue) => ({ issue, state: "removed" })))}>
                    Remove all not supported ({unsupportedOpen.length})
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {!canDecide && whyNot && open.length > 0 ? <p className="mt-2 text-xs text-gate-ink">{whyNot}</p> : null}
          <div className="mt-3 space-y-4 pb-2">
            {GROUPS.map((g) => {
              const list = issues.filter(g.test);
              if (!list.length) return null;
              return (
                <div key={g.id}>
                  <h3 className="text-[11px] font-semibold tracking-wide text-ink-dim uppercase">
                    {g.title} · {list.length}
                  </h3>
                  <ol className="mt-2 space-y-3">
                    {list.map((issue) => (
                      <IssueCard key={issue.key} issue={issue} canDecide={canDecide} whyNot={whyNot} onDecide={onDecide} anchored={anchored.has(issue.key)} onShow={() => onShowInDocument(issue.key)} />
                    ))}
                  </ol>
                </div>
              );
            })}
            {supported.length ? (
              <details className="rounded-xl bg-raised p-3 ring-1 ring-line" data-testid="supported-claims">
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium text-ok">{supported.length} supported</span> <span className="text-ink-dim">· no decision needed</span>
                </summary>
                <ul className="mt-2 space-y-2 text-[13px] leading-normal">
                  {supported.map((f) => (
                    <li key={f.id}>
                      <p>“{stripQuotes(f.claim ?? f.issue)}”</p>
                      {f.evidence ? <p className="text-xs text-ink-dim">{f.evidence}</p> : null}
                      <SourceLine source={f.source} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function SourceLine({ source, verdict }: { source: string | null; verdict?: string | null }) {
  const links = sourceLinks(source).filter((u) => /^https?:\/\//i.test(u));
  if (links.length) {
    return (
      <p className="break-words text-xs">
        <span className="text-ink-faint">{links.length > 1 ? "Sources: " : "Source: "}</span>
        {links.map((u, i) => (
          <span key={u}>
            {i ? " · " : ""}
            <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="text-thread underline">
              {u.replace(/^https?:\/\//i, "").replace(/\/$/, "").slice(0, 80)}
            </a>
          </span>
        ))}
      </p>
    );
  }
  if (source) return <p className="break-words text-xs"><span className="text-ink-faint">Source: </span>{source}</p>;
  return <p className="text-xs text-gate-ink">No source found{verdict === "unsupported" ? ": check this one yourself" : ""}.</p>;
}

function IssueCard({
  issue,
  canDecide,
  whyNot,
  onDecide,
  anchored,
  onShow,
}: {
  issue: Issue;
  canDecide: boolean;
  whyNot: string | null;
  onDecide: (issue: Issue, state: IssueState, extra?: DecideExtra) => Promise<void>;
  anchored: boolean;
  onShow: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(issue.edit ?? issue.flag.fix ?? "");
  const [busy, setBusy] = useState(false);
  const { flag } = issue;
  const resolved = isResolved(issue.state);

  async function decide(state: IssueState, extra?: DecideExtra) {
    setBusy(true);
    try {
      await onDecide(issue, state, extra);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  const outline = "rounded-lg bg-raised px-2.5 py-1.5 text-xs ring-1 ring-line hover:ring-thread disabled:opacity-50";
  const chosen = (s: IssueState) => (issue.state === s ? " ring-2 ring-thread font-medium" : "");
  const noFix = !flag.fix;
  return (
    <li id={`issue-${issue.key}`} className={`scroll-mt-4 rounded-xl bg-raised p-3.5 shadow-[0_1px_2px_rgba(31,26,20,0.06)] ring-1 ring-line ${resolved ? "opacity-85" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {flag.verdict ? (
            <span data-verdict={flag.verdict} className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_BADGE[flag.verdict]}`} title="The fact-check's verdict on this claim">
              {VERDICT_LABEL[flag.verdict]}
            </span>
          ) : null}
          {flag.confidence ? <span className="shrink-0 text-[11px] text-ink-faint capitalize" title="How much this claim matters to the answer">{flag.confidence} importance</span> : null}
          {!flag.claim ? <span className="truncate text-sm font-medium">{issueTitle(flag)}</span> : null}
        </div>
        <span className={`shrink-0 text-[11px] ${resolved ? "text-ok" : "text-ink-faint"}`}>{resolved ? `✓ ${DECISION_LABEL[issue.state]}` : "Needs your decision"}</span>
      </div>
      {flag.claim ? <p className="mt-2 text-sm leading-normal font-medium">“{stripQuotes(flag.claim)}”</p> : null}
      <div className="mt-1 space-y-1 text-[13px] leading-normal text-ink-dim">
        {flag.verdict && flag.issue && flag.verdict !== "disputed" ? <p>{flag.issue}</p> : null}
        {flag.evidence ? (
          flag.verdict === "disputed" ? (
            <>
              <p className="font-medium text-ink">What each source says:</p>
              <ul className="list-disc space-y-1 pl-5" data-testid="disputed-values">
                {flag.evidence.split(/\n|;\s+(?=["“„«])/).map((v) => v.trim()).filter(Boolean).map((v, i) => <li key={i} className="break-words">{v}</li>)}
              </ul>
              <p className="text-xs text-danger">Sources disagree: compare them and decide which value to keep.</p>
            </>
          ) : (
            <p><span className="font-medium text-ink">{flag.verdict ? "Source says: " : "From the draft: "}</span>{flag.evidence}</p>
          )
        ) : flag.opinion ? (
          <p className="text-gate-ink">No source given for this point: check it yourself.</p>
        ) : null}
        <SourceLine source={flag.source} verdict={flag.verdict} />
        {flag.fix ? <p className="text-xs"><span className="text-ink-faint">Suggested fix: </span>{flag.fix}</p> : null}
      </div>
      {issue.state === "edited" && issue.edit ? <p className="mt-1 text-xs text-ok">Your correction: {issue.edit}</p> : null}
      {anchored ? (
        <button type="button" onClick={onShow} className="mt-2 text-xs text-ink-dim hover:text-ink">
          Show in the answer
        </button>
      ) : null}
      {editing ? (
        <div className="mt-2">
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your own correction for this claim" className="w-full rounded-lg bg-canvas px-2 py-1 text-sm ring-1 ring-line" maxLength={2000} />
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className="px-2 py-1 text-xs text-ink-dim" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" disabled={busy || !text.trim()} className="rounded-lg bg-thread px-2.5 py-1.5 text-xs font-medium text-raised disabled:opacity-50" onClick={() => void decide("edited", { edit: text })}>
              Use my correction
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="verdict-buttons">
          <button type="button" disabled={!canDecide || busy} className={outline + chosen("rejected")} title="The claim stays exactly as written" onClick={() => void decide("rejected")}>
            Keep as written
          </button>
          <button
            type="button"
            disabled={!canDecide || busy || noFix}
            className={outline + chosen("accepted")}
            title={noFix ? "No suggested fix from the source: write your own correction, or remove the claim" : "The final answer uses the corrected claim from the source"}
            onClick={() => void decide("accepted")}
          >
            Fix it (use the source)
          </button>
          <button type="button" disabled={!canDecide || busy} className={outline + chosen("removed")} title="The claim is left out of the final answer" onClick={() => void decide("removed")}>
            Remove
          </button>
          <button type="button" disabled={!canDecide || busy} className="px-1.5 py-1 text-xs text-thread hover:text-thread-bright disabled:opacity-50" onClick={() => { setText(issue.edit ?? flag.fix ?? ""); setEditing(true); }}>
            Write my own fix
          </button>
          {resolved && canDecide ? (
            <button type="button" disabled={busy} className="ml-auto px-1.5 py-1 text-xs text-ink-dim hover:text-ink" onClick={() => void decide("open")}>
              Undo
            </button>
          ) : null}
          {canDecide && noFix ? <p className="w-full text-[11px] text-ink-faint">“Fix it” needs a suggested fix from the source; this claim has none.</p> : null}
          {!canDecide && whyNot ? <p className="w-full text-[11px] text-ink-faint">{whyNot}</p> : null}
        </div>
      )}
    </li>
  );
}
