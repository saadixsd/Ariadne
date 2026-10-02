"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/OutputView";
import { useClocks, useHydrated } from "@/components/use-now";
import { handText, reviewStepFor, type Attribution as AttributionData } from "@/lib/attribution";
import { compareVersions, critiqueOf, markAddressed, noteLineFor, parseCritique, type Critique, type FlagMark } from "@/lib/critique";
import { foldPlan } from "@/lib/text-fold";
import { changeNotesFor } from "@/lib/lineage";
import { critiqueBetween, mayHaveEarlierVersion, versionsOf, type Version } from "@/lib/versions";
import type { ProjectDTO, TaskDTO, TaskRunDTO } from "@/lib/types";

/* ---------- attribution ---------- */

/**
 * "Made by GPT · Daedalus — Reviewed by Claude · Odysseus". Built from the agent and
 * task graph (lib/attribution.ts); never names a reviewer that has not spun.
 */
export function AttributionLine({ attribution, tone = "paper", className = "" }: { attribution: AttributionData; tone?: "paper" | "ink"; className?: string }) {
  const { madeBy } = attribution;
  if (!madeBy) return null;
  const strong = tone === "ink" ? "font-semibold text-[#f4eee3]" : "font-semibold text-ink";
  const quiet = tone === "ink" ? "text-[#c9bba5]" : "text-ink-faint";
  if (madeBy.human) {
    return (
      <p data-attribution className={`text-[12px] leading-snug ${quiet} ${className}`}>
        Judged by <b className={strong}>You</b>
      </p>
    );
  }
  return (
    <p data-attribution className={`text-[12px] leading-snug ${quiet} ${className}`}>
      Made by <b className={strong}>{handText(madeBy)}</b>
      {attribution.reviews ? (
        <>
          {" "}
          — Reviewing <b className={strong}>{handText(attribution.reviews)}</b>
        </>
      ) : attribution.reviewedBy ? (
        <>
          {" "}
          — Reviewed by <b className={strong}>{handText(attribution.reviewedBy)}</b>
        </>
      ) : attribution.reviewPending ? (
        <> — review by {handText(attribution.reviewPending)} not spun yet</>
      ) : null}
      {attribution.tiedOff ? <> · tied off by You</> : null}
    </p>
  );
}

/* ---------- run cost ---------- */

/** The quiet "1 run" beside a button that calls a model. Approvals and knots cost nothing. */
export function RunCost({ className = "" }: { className?: string }) {
  return (
    <span data-run-cost className={`font-mono text-[10.5px] font-normal tracking-normal opacity-80 ${className}`}>
      · 1 run
    </span>
  );
}

/* ---------- critique flags ---------- */

const FLAGS_SHOWN = 6;

/**
 * Odysseus's review as discrete flags: what part, what's wrong, the suggested fix, and
 * a one-tap "Add to note". When no flags parse out, the review is shown as written.
 */
export function CritiqueFlags({
  critique,
  reviewer,
  note,
  onAdd,
}: {
  critique: Critique;
  reviewer: string;
  /** The current note, so a flag already in it shows as added. */
  note?: string;
  onAdd?: (line: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { flags, verdict } = critique;
  const shown = open ? flags : flags.slice(0, FLAGS_SHOWN);
  const hidden = flags.length - shown.length;

  if (flags.length === 0) {
    const plan = foldPlan(critique.prose);
    return (
      <section aria-label="Review" data-critique="prose" className="rounded-xl border border-line bg-tint px-4 py-3.5 text-[13px] leading-normal text-ink-dim">
        <p className="flex items-baseline gap-2">
          <span aria-hidden>⚑</span>
          <b className="text-ink">{reviewer}&apos;s review</b>
        </p>
        <div className={!open && plan.fold ? "fold-fade mt-1.5 max-h-[16rem] overflow-hidden" : "mt-1.5"}>
          <Markdown text={critique.prose} />
        </div>
        {plan.fold ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="touch-pad mt-1 text-xs font-[560] text-thread hover:text-thread-bright">
            {open ? "Fold it back" : `Read more · ${plan.label}`}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label="Review flags" data-critique="flags" className="rounded-xl border border-line bg-tint px-3.5 py-3 text-[13px] leading-normal text-ink-dim">
      <p className="flex items-baseline gap-2 px-0.5">
        <span aria-hidden className="text-thread">
          ⚑
        </span>
        <b className="text-ink">
          {reviewer} flagged {flags.length} {flags.length === 1 ? "point" : "points"}
        </b>
      </p>
      {verdict ? <p className="mt-1 px-0.5 text-ink">Verdict: {verdict}</p> : null}
      <ol className="mt-2 grid gap-2">
        {shown.map((flag, index) => {
          const line = noteLineFor(flag);
          const added = !!note && note.split("\n").some((existing) => existing.trim().replace(/^[-•]\s*/, "") === line);
          return (
            <li key={flag.id} data-flag={flag.id} className="rounded-lg border border-line bg-raised px-3 py-2.5 [overflow-wrap:anywhere]">
              <p className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-[10.5px] text-ink-faint tnum">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  {flag.section ? (
                    <span className="mr-1.5 rounded bg-panel px-1.5 py-px font-mono text-[10.5px] tracking-[0.04em] text-ink-dim uppercase ring-1 ring-line">{flag.section}</span>
                  ) : null}
                  <span className="text-ink">{flag.issue}</span>
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5 pl-[26px]">
                {flag.fix ? (
                  <p className="min-w-0 flex-1 basis-[12rem] text-[12.5px]">
                    <span className="font-mono text-[10.5px] tracking-[0.06em] text-gate-ink uppercase">Fix</span> {flag.fix}
                  </p>
                ) : (
                  <p className="min-w-0 flex-1 basis-[12rem] text-[12px] text-ink-faint italic">No fix suggested.</p>
                )}
                {onAdd ? (
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => onAdd(line)}
                    aria-label={added ? `Flag ${index + 1} is in your note` : `Add flag ${index + 1} to your note`}
                    className={`rt-btn h-7 shrink-0 px-2.5 text-xs ${added ? "rt-btn-ghost text-ok" : ""}`}
                  >
                    {added ? "In your note ✓" : "Add to note"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {flags.length > FLAGS_SHOWN ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="touch-pad mt-2 text-xs font-[560] text-thread hover:text-thread-bright">
          {open ? "Fold it back" : `Show ${hidden} more ${hidden === 1 ? "flag" : "flags"}`}
        </button>
      ) : null}
    </section>
  );
}

/**
 * The review parsed into flags, on the client only. The Worker renders the first page
 * under a tight CPU budget, so the knot's flags fill in after hydration instead of
 * being parsed during SSR; repeat renders (polls, clock ticks) reuse the parse.
 */
export function useCritique(text: string | null | undefined): Critique | null {
  const hydrated = useHydrated();
  return useMemo(() => (hydrated && text ? critiqueOf(text) : null), [hydrated, text]);
}

/* ---------- run history (read-only) ---------- */

type RunsState = { status: "idle" } | { status: "loading" } | { status: "ready"; versions: Version[] } | { status: "error"; message: string };

/** Versions of a step from GET /api/tasks/:id/runs. Read-only; refetches when `key` changes. */
export function useVersions(taskId: string | null, key: string): RunsState {
  const [state, setState] = useState<{ for: string; value: RunsState }>({ for: "", value: { status: "idle" } });
  const id = taskId ? `${taskId}\n${key}` : "";
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    void fetch(`/api/tasks/${taskId}/runs`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { runs?: TaskRunDTO[]; error?: string } | null;
        if (cancelled) return;
        setState({
          for: id,
          value: response.ok && body?.runs ? { status: "ready", versions: versionsOf(body.runs) } : { status: "error", message: body?.error ?? "Could not load the earlier versions." },
        });
      })
      .catch(() => !cancelled && setState({ for: id, value: { status: "error", message: "Could not reach the server for the earlier versions." } }));
    return () => {
      cancelled = true;
    };
  }, [taskId, id]);
  if (!taskId) return { status: "idle" };
  return state.for === id ? state.value : { status: "loading" };
}

/* ---------- v1 → v2 ---------- */

const KIND_LABEL = { changed: "changed", added: "new", removed: "cut" } as const;

/**
 * Stacked sections of the newer version, the ones that changed highlighted (with the
 * older wording a tap away), cut sections shown struck through. Below: the critique
 * that came in between, each flag marked "looks addressed" or "not yet".
 */
export function VersionCompare({
  before,
  after,
  critique,
  reviewer,
  note,
}: {
  before: Version;
  after: Version;
  /** The review that sat between the two versions, if one did. */
  critique: Version | null;
  reviewer: string;
  /** Your change note that sent the work back, if any. */
  note: string | null;
}) {
  const { clock } = useClocks();
  const beforeText = before.run.output ?? "";
  const afterText = after.run.output ?? "";
  const critiqueText = critique?.run.output ?? "";
  // One comparison per pair of versions, not one per render (and markAddressed reuses it).
  const comparison = useMemo(() => compareVersions(beforeText, afterText), [beforeText, afterText]);
  const marks: FlagMark[] = useMemo(
    () => (critiqueText ? markAddressed(parseCritique(critiqueText).flags, beforeText, afterText, comparison) : []),
    [critiqueText, beforeText, afterText, comparison],
  );
  const addressed = marks.filter((mark) => mark.status === "addressed").length;
  const summary = [
    comparison.changed ? `${comparison.changed} changed` : null,
    comparison.added ? `${comparison.added} new` : null,
    comparison.removed ? `${comparison.removed} cut` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div data-compare className="grid gap-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-ink-dim">
        <span className="font-mono text-[11px] text-ink-faint tnum">
          {before.label}
          {clock(before.run.completedAt ?? before.run.createdAt) ? ` · ${clock(before.run.completedAt ?? before.run.createdAt)}` : ""}
        </span>
        <span aria-hidden className="text-thread">
          →
        </span>
        <span className="font-mono text-[11px] text-ink-faint tnum">
          {after.label}
          {clock(after.run.completedAt ?? after.run.createdAt) ? ` · ${clock(after.run.completedAt ?? after.run.createdAt)}` : ""}
        </span>
        <span className="ml-auto">{summary || "No sections changed."}</span>
      </p>
      {note ? (
        <div className="rounded-lg border-l-2 border-gate bg-gate-bg/60 px-3 py-2 text-[12.5px] leading-snug">
          <p className="font-mono text-[10.5px] tracking-[0.06em] text-gate-ink uppercase">Your note between them</p>
          <p className="mt-0.5 whitespace-pre-line">{note}</p>
        </div>
      ) : null}
      {marks.length > 0 ? (
        <section aria-label="Earlier flags" className="rounded-xl border border-line bg-tint px-3.5 py-3">
          <p className="text-[13px]">
            <b className="text-ink">
              {reviewer}&apos;s {marks.length} {marks.length === 1 ? "flag" : "flags"} on {before.label}
            </b>
            <span className="text-ink-dim"> · {addressed} look{addressed === 1 ? "s" : ""} addressed</span>
          </p>
          <ul className="mt-2 grid gap-1.5">
            {marks.map((mark) => (
              <li key={mark.flag.id} data-mark={mark.status} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 text-[12.5px] leading-snug [overflow-wrap:anywhere]">
                <span
                  className={`rounded-full px-2 py-px font-mono text-[10.5px] whitespace-nowrap ${
                    mark.status === "addressed" ? "bg-ok/12 text-ok ring-1 ring-ok/30" : "bg-gate-bg text-gate-ink ring-1 ring-gate-line"
                  }`}
                >
                  {mark.status === "addressed" ? "looks addressed" : "not yet"}
                </span>
                <span className="text-ink">
                  {mark.flag.section ? <b className="font-semibold">{mark.flag.section}: </b> : null}
                  {mark.flag.issue}
                  <span className="block font-mono text-[10.5px] text-ink-faint">{mark.evidence}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-ink-faint">A word-level check, not a judgment. You decide whether each one is really fixed.</p>
        </section>
      ) : null}
      <ol className="grid gap-2">
        {comparison.rows.map((row, index) =>
          row.kind === "same" ? (
            <li key={index} className="px-3 text-ink">
              <Markdown text={row.after.text} />
            </li>
          ) : row.kind === "removed" ? (
            <li key={index} data-row="removed" className="rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-ink-faint line-through decoration-thread/50">
              <span className="font-mono text-[10px] tracking-[0.06em] uppercase no-underline">{KIND_LABEL.removed} from {before.label}</span>
              <Markdown text={row.before.text} />
            </li>
          ) : (
            <li
              key={index}
              data-row={row.kind}
              className={`rounded-lg border-l-[3px] px-3 py-1.5 text-ink ${row.kind === "added" ? "border-thread bg-thread-soft/45" : "border-gate bg-gate-bg/70"}`}
            >
              <span className={`font-mono text-[10px] tracking-[0.06em] uppercase ${row.kind === "added" ? "text-thread" : "text-gate-ink"}`}>
                {KIND_LABEL[row.kind]} in {after.label}
              </span>
              <Markdown text={row.after.text} />
              {row.kind === "changed" ? (
                <details className="mt-1 text-ink-dim">
                  <summary className="cursor-pointer font-mono text-[10.5px] text-ink-faint">{before.label} said</summary>
                  <div className="mt-1 border-l border-line-strong pl-2.5 opacity-80">
                    <Markdown text={row.before.text} />
                  </div>
                </details>
              ) : null}
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

/** Picks the pair to compare: by default the version before the newest, and the newest. */
export function VersionPicker({ versions, from, to, onPick }: { versions: Version[]; from: number; to: number; onPick: (from: number, to: number) => void }) {
  if (versions.length < 3) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-dim" role="group" aria-label="Versions to compare">
      <span>Compare</span>
      <select value={from} onChange={(event) => onPick(Number(event.target.value), Math.max(Number(event.target.value) + 1, to))} className="rounded-md bg-raised px-1.5 py-0.5 font-mono text-[11.5px] ring-1 ring-line" aria-label="Older version">
        {versions.slice(0, -1).map((version) => (
          <option key={version.run.id} value={version.number}>
            {version.label}
          </option>
        ))}
      </select>
      <span aria-hidden>→</span>
      <select value={to} onChange={(event) => onPick(Math.min(from, Number(event.target.value) - 1), Number(event.target.value))} className="rounded-md bg-raised px-1.5 py-0.5 font-mono text-[11.5px] ring-1 ring-line" aria-label="Newer version">
        {versions.slice(1).map((version) => (
          <option key={version.run.id} value={version.number}>
            {version.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The comparison for one step, loading its run history and (when the thread has one)
 * its review step's history, so the flags in between can be marked.
 */
export function StepVersions({
  taskId,
  reviewTaskId,
  reviewer,
  notes,
  refreshKey,
}: {
  taskId: string;
  reviewTaskId: string | null;
  reviewer: string;
  /** Your change notes for this step, oldest first, with when you wrote them. */
  notes: { note: string; at: string }[];
  refreshKey: string;
}) {
  const runs = useVersions(taskId, refreshKey);
  const reviews = useVersions(reviewTaskId, refreshKey);
  const [pick, setPick] = useState<{ from: number; to: number } | null>(null);
  if (runs.status === "loading" || runs.status === "idle") return <p className="text-[13px] text-ink-faint">Reading the earlier versions…</p>;
  if (runs.status === "error") return <p className="text-[13px] text-danger">{runs.message}</p>;
  const versions = runs.versions;
  if (versions.length < 2) {
    return <p className="text-[13px] text-ink-dim">Only one version so far. A v1 → v2 appears here after this step is spun again.</p>;
  }
  const to = Math.min(pick?.to ?? versions.length, versions.length);
  const from = Math.min(pick?.from ?? to - 1, to - 1);
  const before = versions[from - 1];
  const after = versions[to - 1];
  const reviewVersions = reviews.status === "ready" ? reviews.versions : [];
  const critique = critiqueBetween(reviewVersions, before, after);
  const beforeAt = Date.parse(before.run.completedAt ?? before.run.createdAt);
  const afterAt = Date.parse(after.run.startedAt ?? after.run.createdAt);
  const between = notes.filter((item) => {
    const at = Date.parse(item.at);
    return at >= beforeAt && at <= afterAt;
  });
  return (
    <div className="grid gap-3">
      <VersionPicker versions={versions} from={from} to={to} onPick={(nextFrom, nextTo) => setPick({ from: nextFrom, to: nextTo })} />
      <VersionCompare before={before} after={after} critique={critique} reviewer={reviewer} note={between.map((item) => item.note).join("\n") || null} />
      <p className="text-[11.5px] text-ink-faint">
        Every version stays in the run history{versions.length > 2 ? ` (${versions.length} in all)` : ""}. Open “Beside its inputs” to read any attempt in full.
      </p>
    </div>
  );
}

/** A modal around StepVersions, opened from an output card's "v1 → v2". */
export function VersionsDialog({
  title,
  hand,
  onClose,
  ...rest
}: Parameters<typeof StepVersions>[0] & { title: string; hand: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
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
  return (
    <div className="modal-safe fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="versions-title"
        data-versions-dialog
        className="enter flex vh-cap-92 w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-raised"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
          <div className="min-w-0">
            <p className="eyebrow">Before → after · {hand}</p>
            <h2 id="versions-title" className="mt-1 font-serif text-[28px] leading-[1.05]">
              {title}
            </h2>
            <p className="mt-1 text-[13px] text-ink-dim">What changed between versions, from the run history. Nothing here calls a model.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="rt-btn rt-btn-ghost h-7 shrink-0 px-2" aria-label="Close before and after">
            Esc ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <StepVersions {...rest} />
        </div>
      </div>
    </div>
  );
}

/** The refetch key for a step's history: changes whenever a new version lands. */
export function versionKey(task: TaskDTO): string {
  return `${task.status}|${task.completedAt ?? ""}|${task.output?.length ?? 0}`;
}

/**
 * "v1 → v2" on an output card, shown once the step has been spun more than once
 * (judged from events the board already has). Opens the before/after dialog.
 */
export function VersionsButton({ task, project, className = "" }: { task: TaskDTO; project: ProjectDTO; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!mayHaveEarlierVersion(task, project)) return null;
  const agent = project.agents.find((item) => item.id === task.agentId);
  const review = reviewStepFor(task, project);
  const reviewer = project.agents.find((item) => item.id === review?.agentId)?.name ?? "The reviewer";
  return (
    <>
      <button type="button" data-versions={task.id} onClick={() => setOpen(true)} className={`rt-btn rt-btn-ghost h-7 px-2 text-xs ${className}`}>
        v1 → v2
      </button>
      {open ? (
        <VersionsDialog
          title={task.title}
          hand={agent?.name ?? "This step"}
          taskId={task.id}
          reviewTaskId={review?.id ?? null}
          reviewer={reviewer}
          notes={changeNotesFor(task.id, project)}
          refreshKey={versionKey(task)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
