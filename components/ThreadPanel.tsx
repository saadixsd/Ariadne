"use client";

import { useEffect, useMemo, useState } from "react";
import { LocalTime } from "@/components/LocalTime";
import { buildKnots, type Knot, type ThreadData } from "@/lib/knots";
import type { Decision, ThreadSteps } from "@/lib/workspace";

const DOT: Record<Knot["actor"], string> = { Writer: "bg-thread", "Fact-checker": "bg-ink", You: "bg-gate-ink" };

/**
 * The thread: one knot per step that happened. Loads once per step change (not per
 * decision); your latest decisions are merged in locally.
 */
export function ThreadPanel({
  projectId,
  steps,
  approvedAt,
  decisions,
  selected,
  onSelect,
  onRerun,
  locked,
  onExport,
}: {
  projectId: string;
  steps: ThreadSteps;
  approvedAt: string | null;
  decisions: Decision[];
  selected: string | null;
  onSelect: (knot: Knot | null) => void;
  onRerun: (knot: Knot) => void;
  locked: boolean;
  onExport: () => void;
}) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [failed, setFailed] = useState(false);
  const stepKey = [steps.draft, steps.challenge, steps.judge, steps.tieOff, steps.finalCheck].map((t) => `${t?.status}:${t?.completedAt}`).join("|") + approvedAt;

  useEffect(() => {
    let live = true;
    fetch(`/api/projects/${projectId}/thread`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ThreadData>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && (setData(d), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [projectId, stepKey]);

  const knots = useMemo(() => {
    if (!data) return [];
    const at = new Map(data.decisions.map((d) => [d.flagKey, d.updatedAt]));
    const now = new Date().toISOString();
    const merged = decisions.map((d) => ({ flagKey: d.flagKey, state: d.state, edit: d.edit, updatedAt: at.get(d.flagKey) ?? now }));
    return buildKnots({ ...data, decisions: merged, approvedAt }, steps);
  }, [data, decisions, approvedAt, steps]);

  const rounds = knots.filter((k) => k.kind === "challenge").length;

  return (
    <section className="rounded-2xl bg-raised p-4 ring-1 ring-line" aria-labelledby="thread-h">
      <div className="flex items-center justify-between">
        <h2 id="thread-h" className="text-[13px] font-semibold">History</h2>
        {knots.length ? <span className="text-[11px] text-ink-faint">{rounds} check{rounds === 1 ? "" : "s"} · {knots.length} steps</span> : null}
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">The writer and the fact-checker work together toward your goal; you decide at each stage.</p>
      {failed ? <p className="mt-3 text-xs text-ink-dim">Could not load the thread. It updates after the next step.</p> : null}
      {data && knots.length === 0 ? <p className="mt-3 text-xs text-ink-dim">Nothing has run yet. Each step adds an entry here.</p> : null}
      {!data && !failed ? <p className="mt-3 text-xs text-ink-faint">Loading…</p> : null}
      <ol className="relative mt-4" data-testid="thread">
        {knots.length ? <span className="absolute bottom-3 left-[7px] top-2 w-[2px] bg-thread/40" aria-hidden /> : null}
        {knots.map((k) => {
          const open = selected === k.id;
          return (
            <li key={k.id} className="relative pb-4 pl-7" data-knot={k.kind}>
              <span
                className={`absolute left-0 top-1 h-4 w-4 rounded-full ring-4 ring-raised ${k.waiting ? "border-2 border-thread bg-raised" : k.kind === "failed" ? "bg-danger" : DOT[k.actor]} ${open ? "outline outline-2 outline-offset-2 outline-thread" : ""}`}
              />
              <button type="button" onClick={() => onSelect(open ? null : k)} aria-expanded={open} className="w-full text-left">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-medium">
                    {k.step}
                    {k.version ? <span className="ml-1 font-normal text-ink-faint">v{k.version}</span> : null}
                  </p>
                  <span className="shrink-0 text-[11px] text-ink-dim">{k.at ? <LocalTime iso={k.at} format="time" /> : <span className="text-thread">Now</span>}</span>
                </div>
                <p className="text-[11px] text-ink-faint">{k.actor}</p>
                <p className={`mt-0.5 text-[12px] ${k.waiting ? "text-thread" : k.kind === "failed" ? "text-danger" : "text-ink-dim"}`}>{k.summary}</p>
              </button>
              {open && (k.lines.length || k.version || k.canRerun) ? (
                <div className="mt-2 rounded-lg bg-panel p-3 ring-1 ring-line">
                  {k.lines.length ? (
                    <ul className="space-y-1 text-[12px]">
                      {k.lines.map((l, i) => <li key={i}>• {l}</li>)}
                    </ul>
                  ) : null}
                  {k.version ? <p className={`${k.lines.length ? "mt-2 " : ""}text-[12px] text-ink-dim`}>Showing this version{k.kind === "draft" ? "" : " and what changed"} on the left.</p> : null}
                  {k.canRerun ? (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onRerun(k)}
                      className="mt-2 rounded-md bg-raised px-2 py-1 text-[12px] ring-1 ring-line hover:ring-thread disabled:opacity-50"
                      title="Runs this step again and clears the steps after it. Earlier versions stay in the thread. Reruns inside a workflow follow the usual rerun limit."
                    >
                      Rerun from here
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {approvedAt ? (
        <div className="mt-1 border-t border-line pt-3">
          <button type="button" onClick={onExport} aria-haspopup="dialog" className="inline-block rounded-lg bg-raised px-3 py-1.5 text-sm ring-1 ring-line hover:ring-thread" data-testid="export-record">
            Export…
          </button>
          <p className="mt-1 text-[11px] text-ink-faint">PDF, Word, PowerPoint or Markdown: the approved answer, its sources, the fact-check and your decisions.</p>
        </div>
      ) : null}
    </section>
  );
}
