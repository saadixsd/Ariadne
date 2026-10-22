"use client";

import { useState } from "react";
import { quotesIn, sourceLinks } from "@/lib/critique";
import { hostOf } from "@/lib/pages";
import { CHOICE_LABEL, PLAIN_VERDICT, type Triaged } from "@/lib/simplify";
import { isResolved, stripQuotes, type IssueState } from "@/lib/workspace";

export type DecideFn = (issue: Triaged, state: IssueState, extra?: { edit?: string }) => void;

const CHOICES = ["rejected", "accepted", "removed", "edited"] as const;

function SourceLine({ evidence, source }: { evidence: string | null; source: string | null }) {
  const quote = evidence ? quotesIn(evidence)[0] ?? null : null;
  const link = sourceLinks(source)[0] ?? null;
  if (!quote && !link) return <p className="mt-1 text-[12.5px] text-ink-faint">No source quote.</p>;
  return (
    <p className="mt-1 text-[12.5px] leading-normal text-ink-dim">
      {quote ? <>The source says: <q className="text-ink">{quote.slice(0, 280)}</q></> : null}
      {link ? <> · <a className="text-thread underline" href={link} target="_blank" rel="noopener noreferrer nofollow">{hostOf(link)}</a></> : null}
    </p>
  );
}

/** One claim that needs you: the claim, what the source says, and four plain choices. */
function NeedsYouCard({ issue, n, canDecide, onDecide }: { issue: Triaged; n: number; canDecide: boolean; onDecide: DecideFn }) {
  const [writing, setWriting] = useState(false);
  const [own, setOwn] = useState(issue.edit ?? "");
  const done = isResolved(issue.state);
  return (
    <li id={`issue-${issue.key}`} data-testid="needs-you-item" className={`rounded-xl p-3 ring-1 ${done ? "bg-panel ring-line" : "bg-raised ring-gate-ink/40"}`}>
      <p className="text-[11px] font-medium tracking-wide text-gate-ink uppercase">
        {n}. {issue.flag.verdict ? PLAIN_VERDICT[issue.flag.verdict] : "Check this"}
      </p>
      <p className="mt-1 text-[14px] leading-snug">“{stripQuotes(issue.flag.claim ?? issue.flag.issue)}”</p>
      <SourceLine evidence={issue.flag.evidence} source={issue.flag.source} />
      {issue.flag.fix ? <p className="mt-1 text-[12.5px] text-ink-dim">Source&apos;s version: <span className="text-ink">{issue.flag.fix}</span></p> : null}
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Your choice">
        {CHOICES.map((c) => {
          const on = issue.state === c;
          return (
            <button
              key={c}
              type="button"
              disabled={!canDecide || (c === "accepted" && !issue.flag.fix && !issue.flag.evidence)}
              aria-pressed={on}
              data-choice={c}
              onClick={() => (c === "edited" ? setWriting(true) : onDecide(issue, on ? "open" : c))}
              className={`rounded-full px-2.5 py-1 text-[12px] ring-1 disabled:opacity-40 ${on ? "bg-ink text-raised ring-ink" : "bg-raised ring-line hover:ring-thread"}`}
            >
              {on ? "✓ " : ""}
              {CHOICE_LABEL[c]}
            </button>
          );
        })}
      </div>
      {writing ? (
        <div className="mt-2">
          <textarea rows={2} value={own} onChange={(e) => setOwn(e.target.value)} maxLength={2000} placeholder="Your version of this claim" className="w-full rounded-lg bg-canvas px-2 py-1 text-sm ring-1 ring-line" />
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className="text-xs text-ink-dim" onClick={() => setWriting(false)}>Cancel</button>
            <button type="button" disabled={!own.trim()} className="rounded-lg bg-thread px-2.5 py-1 text-xs text-raised disabled:opacity-50" onClick={() => { onDecide(issue, "edited", { edit: own.trim() }); setWriting(false); }}>
              Use my version
            </button>
          </div>
        </div>
      ) : issue.state === "edited" && issue.edit ? (
        <p className="mt-1 text-[12.5px] text-ink-dim">Your version: <span className="text-ink">{issue.edit}</span></p>
      ) : null}
    </li>
  );
}

/** "Needs you" (at most 5 claims) and, collapsed, everything checked automatically. */
export function NeedsYou({ list, supportedCount, checkDone, canDecide, whyNot, onDecide }: { list: Triaged[]; supportedCount: number; checkDone: boolean; canDecide: boolean; whyNot: string | null; onDecide: DecideFn }) {
  const asked = list.filter((i) => i.needsYou);
  const auto = list.filter((i) => !i.needsYou);
  const open = asked.filter((i) => !isResolved(i.state)).length;
  if (!checkDone) {
    return (
      <section className="rounded-2xl bg-raised p-4 ring-1 ring-line" data-testid="needs-you">
        <h2 className="text-[13px] font-semibold">Needs you</h2>
        <p className="mt-1 text-sm text-ink-dim">Nothing yet. After the fact-check, only claims a source contradicts, and that matter to the answer, wait for you here (at most 5).</p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl bg-raised p-4 ring-1 ring-line" data-testid="needs-you">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold">Needs you</h2>
        {open ? <span className="rounded-full bg-thread px-1.5 text-[11px] leading-[18px] font-medium text-raised">{open}</span> : null}
      </div>
      {asked.length === 0 ? (
        <p className="mt-1 text-sm text-ink-dim" data-testid="needs-you-none">Nothing needs you: no source contradicts a key claim.</p>
      ) : (
        <p className="mt-1 text-[12.5px] text-ink-dim">{open ? `Choose for ${open === 1 ? "this claim" : `these ${open} claims`}. Your choice is saved right away.` : "All decided. You can still change a choice."}</p>
      )}
      {whyNot ? <p className="mt-1 text-xs text-gate-ink" data-testid="why-disabled">{whyNot}</p> : null}
      <ol className="mt-2 space-y-2">
        {asked.map((issue, i) => (
          <NeedsYouCard key={issue.key} issue={issue} n={i + 1} canDecide={canDecide} onDecide={onDecide} />
        ))}
      </ol>
      <details className="mt-3 text-sm" data-testid="checked-auto">
        <summary className="cursor-pointer text-ink-dim">Checked automatically ({auto.length + supportedCount})</summary>
        <p className="mt-1 text-[12px] text-ink-faint">{supportedCount} matched the source. The others are minor, hedged or had no source; this is what was done with each. You can still decide any of them.</p>
        <ul className="mt-2 space-y-2">
          {auto.map((issue) => (
            <li key={issue.key} id={`issue-${issue.key}`} className="rounded-lg bg-panel p-2 ring-1 ring-line">
              <p className="text-[13px]">“{stripQuotes(issue.flag.claim ?? issue.flag.issue)}”</p>
              <p className="text-[12px] text-ink-dim">{issue.flag.verdict ? PLAIN_VERDICT[issue.flag.verdict] : "Checked"} · {issue.auto ? issue.autoReason : `Your choice: ${CHOICE_LABEL[issue.state as keyof typeof CHOICE_LABEL] ?? "not decided"}`}</p>
              <SourceLine evidence={issue.flag.evidence} source={issue.flag.source} />
              <div className="mt-1 flex flex-wrap gap-1">
                {CHOICES.filter((c) => c !== "edited").map((c) => (
                  <button key={c} type="button" disabled={!canDecide} onClick={() => onDecide(issue, c)} className="rounded-full bg-raised px-2 py-0.5 text-[11px] ring-1 ring-line hover:ring-thread disabled:opacity-40">
                    {CHOICE_LABEL[c]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
