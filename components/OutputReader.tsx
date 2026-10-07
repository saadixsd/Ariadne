"use client";

import { useEffect, useRef, useState } from "react";
import { FinalArtifactView, isTieOffWriteup } from "@/components/FinalArtifact";
import { CopyButton, Markdown } from "@/components/OutputView";
import { useClocks } from "@/components/use-now";
import { CHANGE_MARKER } from "@/lib/change-notes";
import { hideModelIds } from "@/lib/model-label";
import { agentOf, carriedInto } from "@/lib/thread";
import type { ProjectDTO, TaskDTO, TaskRunDTO } from "@/lib/types";

type Loaded = { runs: TaskRunDTO[] } | { error: string } | null;

const OUTCOME: Record<string, string> = {
  succeeded: "spun",
  failed: "frayed",
  reclaimed: "recovered",
  discarded: "discarded",
  legacy: "earlier",
};

/** Splits a prompt at the human change notes so they can be shown in gold. */
function promptParts(prompt: string): { text: string; note: boolean }[] {
  const pieces = prompt.split(`\n\n${CHANGE_MARKER} `);
  return pieces.map((piece, index) => ({ text: piece, note: index > 0 }));
}

/**
 * The reader: one step's output beside exactly what that hand was given, for every
 * attempt in its run history (GET /api/tasks/:id/runs). Read-only.
 */
export function OutputReader({ task, project, onClose }: { task: TaskDTO; project: ProjectDTO; onClose: () => void }) {
  const { clock } = useClocks();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const agent = agentOf(task, project.agents);
  const hand = agent?.provider === "human" ? "You" : (agent?.name ?? "This step");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/tasks/${task.id}/runs`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { runs?: TaskRunDTO[]; error?: string } | null;
        if (cancelled) return;
        setLoaded(response.ok && body?.runs ? { runs: body.runs } : { error: body?.error ?? "Could not load the run history." });
      })
      .catch(() => !cancelled && setLoaded({ error: "Could not reach the server for the run history." }));
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const runs = loaded && "runs" in loaded ? [...loaded.runs].reverse() : [];
  const latest = runs.find((run) => run.outcome === "succeeded") ?? runs[0];
  const run = runs.find((item) => item.id === picked) ?? latest;
  const carried = carriedInto(task, project);
  // A human knot has no prompt: what it was given is the packaged upstream work.
  const given = run?.prompt ?? (agent?.provider === "human" ? null : carried.packet);
  const output = run ? (run.output ?? null) : task.output;

  return (
    <div className="modal-safe fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-title"
        className="enter flex vh-cap-92 w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-raised"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
          <div className="min-w-0">
            <p className="eyebrow">The reader · {hand}</p>
            <h2 id="reader-title" className="mt-1 font-serif text-[30px] leading-[1.05]">
              {task.title}
            </h2>
            <p className="mt-1 text-[13px] text-ink-dim">What {hand === "You" ? "you were" : `${hand} was`} given, beside what came back. Nothing here calls a model.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="rt-btn rt-btn-ghost h-7 px-2" aria-label="Close the reader">
            Esc ✕
          </button>
        </div>
        {runs.length > 1 ? (
          <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2 sm:px-6" role="tablist" aria-label="Attempts">
            {runs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === run?.id}
                onClick={() => setPicked(item.id)}
                className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                  item.id === run?.id ? "border-thread bg-thread-soft/50 text-thread" : "border-line text-ink-dim hover:border-line-strong"
                }`}
              >
                attempt {item.attempt} · {OUTCOME[item.outcome] ?? item.outcome}
                {clock(item.completedAt ?? item.createdAt) ? ` · ${clock(item.completedAt ?? item.createdAt)}` : ""}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-x-hidden overflow-y-auto overscroll-contain md:grid-cols-2">
          <section aria-label="What it was given" className="min-w-0 border-b border-line bg-panel/60 px-4 py-4 sm:px-6 md:border-r md:border-b-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="eyebrow">Given{run?.attempt ? ` · attempt ${run.attempt}` : ""}</p>
              {given ? <CopyButton text={given} label="Copy inputs" /> : null}
            </div>
            {loaded === null ? (
              <p className="text-[13px] text-ink-faint">Reading the ledger…</p>
            ) : given ? (
              promptParts(given).map((part, index) =>
                part.note ? (
                  <div key={index} className="my-3 rounded-lg border-l-2 border-gate bg-gate-bg/60 px-3 py-2">
                    <p className="font-mono text-[10.5px] tracking-[0.06em] text-gate-ink uppercase">Your note, carried forward</p>
                    <p className="mt-1 text-[13.5px] leading-normal">{part.text}</p>
                  </div>
                ) : (
                  <Markdown key={index} text={part.text} />
                ),
              )
            ) : (
              <p className="text-[13px] text-ink-dim">Every finished step upstream, packaged for your decision. Open the packet from the knot to read it section by section.</p>
            )}
          </section>
          <section aria-label="What came back" className="min-w-0 px-4 py-4 sm:px-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="eyebrow">
                Handed on{run ? ` · ${OUTCOME[run.outcome] ?? run.outcome}` : ""}
                {run?.latencyMs ? ` · ${(run.latencyMs / 1000).toFixed(1)}s` : ""}
              </p>
              {output ? <CopyButton text={output} label="Copy output" /> : null}
            </div>
            {run?.error ? (
              <p className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 font-mono text-[12px] text-danger">{hideModelIds(run.error)}</p>
            ) : null}
            {output ? (isTieOffWriteup(task, project.agents, task.agentId) ? <FinalArtifactView output={output} /> : <Markdown text={output} />) : <p className="text-[13px] text-ink-dim">No output on this attempt.</p>}
            {loaded && "error" in loaded ? <p className="mt-3 text-xs text-danger">{loaded.error}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
