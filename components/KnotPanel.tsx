"use client";

import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AttributionLine, CritiqueFlags, RunCost, StepVersions, VersionsButton, useCritique, versionKey } from "@/components/Critique";
import { FinalArtifactView, isTieOffWriteup } from "@/components/FinalArtifact";
import { OutputView } from "@/components/OutputView";
import { ContextBar, Monogram } from "@/components/ThreadBits";
import { useClocks, useNow } from "@/components/use-now";
import { attributionFor, reviewStepFor, runVerb, stepPhase } from "@/lib/attribution";
import { latestChangeNote } from "@/lib/change-notes";
import { appendToNote } from "@/lib/critique";
import { MAX_NOTE_CHARS } from "@/lib/limits";
import { changeNotesFor } from "@/lib/lineage";
import { hideModelIds } from "@/lib/model-label";
import { delphicLine, socraticQuestion } from "@/lib/philosophy";
import { canRunTask, taskNumber } from "@/lib/task-rules";
import {
  agentOf,
  agentTone,
  carriedInto,
  charsLabel,
  inputChars,
  knotFor,
  objectOf,
  since,
  stepRange,
  stopwatch,
  type Knot,
  failureReason,
} from "@/lib/thread";
import type { ProjectDTO, TaskDTO } from "@/lib/types";
import { mayHaveEarlierVersion } from "@/lib/versions";

export type KnotPanelHandle = {
  focusDecision: () => void;
  /** Append a structured intervene line into the knot note. False if no knot is open. */
  appendNote: (line: string) => boolean;
  /** True when a knot sheet is mounted (awaiting your judgment). */
  isJudging: () => boolean;
};

function MergeThreads({ knot, project }: { knot: Knot; project: ProjectDTO }) {
  // The door (your brief) is the first thread into every knot: you judge against it.
  const brief = project.brief.trim();
  const doorRow = { key: "door", title: "The door — your brief", gist: brief || "No brief yet.", chars: brief.length };
  const rows = knot.inputs.length + 1;
  const rowHeight = 46;
  const height = Math.max(rowHeight, rows * rowHeight);
  const max = Math.max(1, doorRow.chars, ...knot.inputs.map((input) => input.chars));
  const cy = height / 2;
  return (
    <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-x-2.5">
      <svg
        viewBox={`0 0 70 ${height}`}
        width={70}
        height={height}
        fill="none"
        style={{ gridRow: `span ${Math.max(1, rows)}` }}
        role="img"
        aria-label={`${rows} threads merge into this knot, drawn to scale by how much context each carries`}
      >
        {[doorRow, ...knot.inputs.map((input) => ({ key: input.task.id, chars: input.chars }))].map((input, index) => {
          const y = rowHeight * index + rowHeight / 2;
          const width = 1.4 + 4.6 * (input.chars / max);
          return (
            <path
              key={input.key}
              d={y === cy ? `M0 ${y} H64` : `M0 ${y} C40 ${y} 36 ${cy} 64 ${cy}`}
              stroke="var(--color-thread)"
              strokeWidth={width}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx="62" cy={cy} r="6.5" fill="var(--color-gate)" stroke="var(--color-raised)" strokeWidth="2" />
      </svg>
      <div className="flex h-[46px] min-w-0 flex-col justify-center border-b border-dashed border-line">
        <p className="flex items-baseline justify-between gap-2 text-[13px]">
          <b className="truncate font-semibold">{doorRow.title}</b>
          <span className="shrink-0 font-mono text-[10.5px] text-ink-faint tnum">{charsLabel(doorRow.chars)}</span>
        </p>
        <p className="truncate font-serif text-[13px] text-ink-dim italic">{doorRow.gist}</p>
      </div>
      {knot.inputs.length === 0 ? (
        <p className="flex h-[46px] items-center text-xs text-ink-dim">No finished steps feed this knot yet.</p>
      ) : (
        knot.inputs.map((input, index) => (
          <div
            key={input.task.id}
            className={`flex h-[46px] min-w-0 flex-col justify-center ${index < knot.inputs.length - 1 ? "border-b border-dashed border-line" : ""}`}
          >
            <p className="flex items-baseline justify-between gap-2 text-[13px]">
              <b className="truncate font-semibold">
                {taskNumber(input.task.id, project.tasks)} · {input.agent?.name ?? "Unassigned"} — {input.noun}
              </b>
              <span className="shrink-0 font-mono text-[10.5px] text-ink-faint tnum">{charsLabel(input.chars)}</span>
            </p>
            <p className="truncate text-xs text-ink-dim">{input.gist}</p>
          </div>
        ))
      )}
    </div>
  );
}

function Waited({ openedAt }: { openedAt: string | null }) {
  const now = useNow();
  const waited = since(openedAt, now);
  return waited !== null ? <>{` · ${stopwatch(waited)}`}</> : null;
}

const noopSubscribe = () => () => {};

/**
 * The knot, opened: a wide reading sheet over the dimmed board. One scroll area (the
 * body); the header and the decision footer stay put so the question, the note and
 * the two buttons are always in view.
 */
function KnotBody({
  knot,
  project,
  handle,
  open,
  onClose,
  onDecide,
  onOpenPacket,
  onOpenHandoff,
  onOpenReader,
}: {
  knot: Knot;
  project: ProjectDTO;
  handle: Ref<KnotPanelHandle>;
  open: boolean;
  onClose: () => void;
  onDecide: (taskId: string, approved: boolean, note: string) => Promise<void>;
  onOpenPacket: (taskId: string) => void;
  onOpenHandoff: (taskId: string) => void;
  onOpenReader: (taskId: string) => void;
}) {
  const { clock } = useClocks();
  const { task } = knot;
  const agents = project.agents;
  const approveRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "changes" | null>(null);
  const [needNote, setNeedNote] = useState(false);
  useImperativeHandle(handle, () => ({
    focusDecision: () => approveRef.current?.focus(),
    appendNote: (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      setNote((current) => (current.trim() ? `${current.trimEnd()}\n${trimmed}` : trimmed));
      setNeedNote(false);
      noteRef.current?.focus();
      return true;
    },
    isJudging: () => true,
  }));

  const client = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const backdropRef = useRef<HTMLDivElement>(null);
  useVisualViewportBox(backdropRef, open && client);

  useEffect(() => {
    if (!open || !client) return;
    const previous = document.activeElement as HTMLElement | null;
    approveRef.current?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, [open, client]);

  const reviewer = knot.reviewers.find((item) => item.output) ?? null;
  const critique = useCritique(reviewer?.output);
  const reviewerName = agentOf(reviewer ?? undefined, agents)?.name ?? "The challenger";
  const judged = knot.artifact?.output ? knot.artifact : null;
  const respun = !!judged && mayHaveEarlierVersion(judged, project);
  const [view, setView] = useState<"latest" | "compare">("compare");
  const artifactAgent = agentOf(knot.artifact ?? undefined, agents);
  const unlock = knot.unlocks[0];
  const unlockAgent = agentOf(unlock, agents);
  const total = project.tasks.length;
  const number = taskNumber(task.id, project.tasks);
  const rewinds = knot.resets.filter((item) => item.id !== task.id);
  const rounds = changeNotesFor(task.id, project).length;
  const question = socraticQuestion(task.id, rounds);
  const hasNotes = !!critique && critique.prose.length > 0;

  function addToNote(line: string) {
    setNote((current) => appendToNote(current, line, MAX_NOTE_CHARS));
    setNeedNote(false);
    requestAnimationFrame(() => {
      const field = noteRef.current;
      if (field) field.scrollTop = field.scrollHeight;
    });
  }

  async function submit(approved: boolean) {
    if (!approved && note.trim().length === 0) {
      setNeedNote(true);
      noteRef.current?.focus();
      return;
    }
    setBusy(approved ? "approve" : "changes");
    try {
      await onDecide(task.id, approved, note);
    } finally {
      setBusy(null);
    }
  }

  if (!open || !client) return null;
  return createPortal(
    <div
      ref={backdropRef}
      className="knot-sheet-backdrop fixed inset-0 z-40 flex items-stretch justify-center bg-ink/35 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="knot-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        className="knot-sheet-dialog enter flex h-full w-full flex-col overflow-hidden bg-raised sm:h-auto sm:w-[92vw] sm:max-w-[1100px] sm:rounded-[18px] sm:border sm:border-gate-line sm:shadow-[0_30px_60px_-30px_rgba(120,80,10,.45),0_6px_18px_-8px_rgba(31,26,20,.25)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#f0ddb0] bg-[linear-gradient(180deg,#fcf1d6,#fbf6ea)] px-4 pt-3 pb-2.5 sm:px-6 sm:pt-4 sm:pb-3">
          <div className="min-w-0">
            <p className="eyebrow text-gate-ink">
              ● Judge · the knot · step {number} of {total}
              <span className="ml-2 font-mono text-[11px] tracking-normal normal-case tnum max-sm:hidden">
                {clock(knot.openedAt) ? `opened ${clock(knot.openedAt)}` : null}
                <Waited openedAt={knot.openedAt} />
              </span>
            </p>
            <h2 id="knot-title" className="mt-1 font-serif text-[24px] leading-[1.05] sm:text-[30px]">
              {task.title}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-dim" data-knot-sub>
              You decide what survives.
              <span className="max-sm:hidden"> Add the challenges you agree with to your note, or Intervene with a structured dispute. Tie Off or Ask for changes — there is no Accept/Reject per line yet.</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rt-btn rt-btn-ghost h-8 shrink-0 px-2.5 text-xs" aria-label="Close the knot">
            Close ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-6" data-knot-scroll>
          <details className="mb-4 rounded-xl border border-line bg-panel/50 px-3.5 py-2">
            <summary className="cursor-pointer text-[11.5px] text-ink-faint">
              <span className="eyebrow text-[10px]">What reaches you · {knot.inputs.length + 1} threads · {charsLabel(inputChars(knot.carried))} · show</span>
            </summary>
            <div className="mt-2">
              <MergeThreads knot={knot} project={project} />
            </div>
            <button type="button" onClick={() => onOpenHandoff(task.id)} className="mt-1.5 text-[11.5px] font-[560] text-thread hover:text-thread-bright">
              {charsLabel(inputChars(knot.carried))} reach you →
            </button>
          </details>
          <div className={`grid gap-5 ${hasNotes ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]" : ""}`}>
            <section aria-label="What you are judging" className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="min-w-0">
                  <p className="eyebrow text-[10px]">What you&apos;re judging{judged ? ` · ${objectOf(judged.title)}` : ""}</p>
                  {judged ? <AttributionLine attribution={attributionFor(judged, project)} className="mt-0.5" /> : null}
                </div>
                {respun ? (
                  <div role="tablist" aria-label="Version view" className="flex shrink-0 rounded-full border border-line bg-panel p-[3px]">
                    {(
                      [
                        ["compare", "v1 → v2"],
                        ["latest", "Latest only"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={view === id}
                        onClick={() => setView(id)}
                        className={`rounded-full px-3 py-[3px] text-[12px] font-[550] ${view === id ? "bg-ink text-raised" : "text-ink-dim hover:text-ink"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {judged?.output && respun && view === "compare" ? (
                <StepVersions
                  taskId={judged.id}
                  reviewTaskId={reviewStepFor(judged, project)?.id ?? null}
                  reviewer={agentOf(reviewStepFor(judged, project) ?? undefined, agents)?.name ?? reviewerName}
                  notes={changeNotesFor(judged.id, project)}
                  refreshKey={versionKey(judged)}
                />
              ) : judged?.output ? (
                <OutputView output={judged.output} foldable={false} onCompare={() => onOpenReader(judged.id)} />
              ) : task.output ? (
                <OutputView output={task.output} foldable={false} />
              ) : (
                <p className="text-[13px] text-ink-dim">Nothing was handed to this knot yet.</p>
              )}
            </section>
            {hasNotes && critique ? (
              <div className="min-w-0">
                <CritiqueFlags critique={critique} reviewer={reviewerName} note={note} onAdd={addToNote} />
              </div>
            ) : null}
          </div>
          <button type="button" onClick={() => onOpenPacket(task.id)} className="mt-4 text-xs font-[560] text-ink-dim underline decoration-line-strong underline-offset-4 hover:text-ink">
            Read the full packet
          </button>
        </div>
        <div className="foot-safe shrink-0 border-t border-gate-line/60 bg-gate-bg/50 px-4 pt-2.5 sm:px-6">
          <p className="font-serif text-[15px] leading-snug text-gate-ink italic sm:text-[16px]" data-socratic>
            Before you tie off: {question}
          </p>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <label className="block rounded-[10px] border border-dashed border-line-strong bg-raised px-3 py-1.5 focus-within:border-thread">
              <span className="sr-only">Your note, if you ask for changes</span>
              <textarea
                ref={noteRef}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  if (needNote) setNeedNote(false);
                }}
                rows={2}
                placeholder={`Your note for ${artifactAgent?.name ?? "the hands"}, if you ask for changes…`}
                className="w-full resize-none bg-transparent text-[12.5px] leading-normal text-ink outline-none placeholder:text-ink-faint"
                aria-invalid={needNote}
                aria-describedby="knot-note-hint"
              />
              <span id="knot-note-hint" data-knot-hint={needNote ? undefined : ""} className={`block truncate font-mono text-[11px] ${needNote ? "text-danger" : "text-ink-faint"}`}>
                {needNote
                  ? "Add a note first, so the hands know what to change."
                  : rewinds.length > 0
                    ? `↺ resets ${stepRange(rewinds, project.tasks)} · your note carries into ${stepRange(knot.rerunFirst, project.tasks)}`
                    : "↺ sends this step back with your note"}
              </span>
            </label>
            <div className="grid gap-1.5">
              <div className="flex gap-2">
                <button
                  ref={approveRef}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void submit(true)}
                  className="rt-btn rt-btn-knot h-10 flex-1 px-4 text-sm whitespace-nowrap"
                >
                  {busy === "approve" ? "Tying off…" : "Tie Off"}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void submit(false)} className="rt-btn h-10 flex-1 px-4 text-sm whitespace-nowrap">
                  {busy === "changes" ? "Sending back…" : "Ask for changes"}
                </button>
              </div>
              <p className={`text-[11.5px] text-ink-faint ${note.trim() ? "leading-snug" : "truncate max-sm:hidden"}`} data-knot-hint>
                {note.trim() ? (
                  // Approving ignores the note (decideTask), so say so before it is lost.
                  "↳ Your note goes with Ask for changes. Tie Off keeps this version as it is."
                ) : unlock ? (
                  <>
                    ↳ Unlocks{" "}
                    <b className="font-semibold text-ink-dim">
                      {taskNumber(unlock.id, project.tasks)} · {unlock.title}
                    </b>{" "}
                    for {unlockAgent?.name ?? "the next step"}
                  </>
                ) : (
                  "↳ Tie Off approves this version as your answer."
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Pins a full-screen overlay to the *visual* viewport. With the phone keyboard up, iOS
 * Safari keeps fixed elements on the layout viewport (and 100dvh ignores the keyboard),
 * so the sheet's decision footer would sit under the keys. Writing the visible height and
 * offset into --vvh/--vvt keeps the footer above them; without visualViewport the CSS
 * falls back to 100dvh.
 */
export function useVisualViewportBox(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const viewport = typeof window === "undefined" ? null : window.visualViewport;
    const element = ref.current;
    if (!active || !viewport || !element) return;
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom || "1") || 1;
    const sync = () => {
      element.style.setProperty("--vvh", `${viewport.height / zoom}px`);
      element.style.setProperty("--vvt", `${viewport.offsetTop / zoom}px`);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [ref, active]);
}

/** The column card while the knot sheet is closed: what is waiting, and a way back in. */
function KnotSummary({ knot, project, onOpen }: { knot: Knot; project: ProjectDTO; onOpen: () => void }) {
  const { clock } = useClocks();
  const reviewer = knot.reviewers.find((item) => item.output);
  const flagCount = useCritique(reviewer?.output)?.flags.length ?? 0;
  const reviewerName = agentOf(reviewer, project.agents)?.name ?? "the challenger";
  const artifactAgent = agentOf(knot.artifact ?? undefined, project.agents);
  return (
    <>
      <div className="border-b border-[#f0ddb0] bg-[linear-gradient(180deg,#fcf1d6,#fbf6ea)] px-5 pt-4 pb-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow text-gate-ink">
            ● Judge · the knot · step {taskNumber(knot.task.id, project.tasks)} of {project.tasks.length}
          </p>
          <p className="font-mono text-[11.5px] text-gate-ink tnum">
            {clock(knot.openedAt) ? `opened ${clock(knot.openedAt)}` : null}
            <Waited openedAt={knot.openedAt} />
          </p>
        </div>
        <h2 id="knot-title-card" className="mt-1.5 font-serif text-[30px] leading-[1.05]">
          {knot.task.title}
        </h2>
        <p className="mt-1 text-[13px] text-ink-dim">You decide what survives. Nothing moves on until you do.</p>
      </div>
      <div className="grid content-start gap-3 px-5 py-4">
        <p className="text-[13px] leading-normal text-ink-dim">
          {knot.artifact?.output ? `${artifactAgent?.name ?? "The hands"}’s work is ready for you to judge` : "The work upstream is ready for you"}
          {flagCount > 0 ? `, with ${flagCount} ${flagCount === 1 ? "challenge" : "challenges"} from ${reviewerName}.` : "."}
        </p>
        <button type="button" onClick={onOpen} className="rt-btn rt-btn-knot h-10 text-sm">
          Open the knot
        </button>
      </div>
    </>
  );
}
/** The name of the hand that challenges this draft step, if the thread has one. */
function challengerOf(task: TaskDTO, project: ProjectDTO): string | null {
  return agentOf(reviewStepFor(task, project) ?? undefined, project.agents)?.name ?? null;
}

function SpinningLine({ name, startedAt }: { name: string; startedAt: string | null }) {
  const now = useNow();
  const seconds = since(startedAt, now);
  return <>{`${name} is spinning${seconds !== null ? ` · ${stopwatch(seconds)}` : ""}. Nothing else moves until it lands.`}</>;
}

function StepBody({
  task,
  project,
  pendingId,
  onRun,
  onRerun,
  onOpenHandoff,
  onOpenReader,
}: {
  task: TaskDTO;
  project: ProjectDTO;
  pendingId: string | null;
  onRun: (id: string) => void;
  onRerun: (id: string) => void;
  onOpenHandoff: (taskId: string) => void;
  onOpenReader: (taskId: string) => void;
}) {
  const { clock } = useClocks();
  const agents = project.agents;
  const agent = agentOf(task, agents);
  const tone = agentTone(agent, agents);
  const carriedNote = latestChangeNote(task.instructions);
  const number = taskNumber(task.id, project.tasks);
  const carried = carriedInto(task, project);
  const running = task.status === "running" || pendingId === task.id;
  const runnable = canRunTask(task, project.tasks);
  const failure = failureReason(task.id, project.events);
  const phase = stepPhase(task, project);
  const verb = runVerb(phase);
  const eyebrow = running
    ? "Spinning"
    : task.status === "failed"
      ? "Frayed"
      : task.status === "done"
        ? "Spun"
        : runnable
          ? "Next on the thread"
          : "Unspun";
  const line = running
    ? null
    : task.status === "failed"
      ? "The thread frayed here. Respin calls the agent again."
      : task.status === "done"
        ? `${tone.name} finished this${clock(task.completedAt) ? ` at ${clock(task.completedAt)}` : ""}.`
        : runnable
          ? agent?.provider === "human"
            ? "Opening the knot packages earlier work for your decision. No model is called."
            : phase === "challenge"
              ? carriedNote
                ? `Revise round: ${tone.name} challenges the new draft in full (not only what changed). Press Challenge to start.`
                : `${tone.name} will try to find claims that are incorrect, unsupported, outdated, contradictory, or misleading. Press Challenge to start. Steer first with Intervene if you want.`
              : phase === "draft"
                ? carriedNote
                  ? `Revise — your note is in the packet. ${tone.name} redrafts; then Daedalus challenges the new version in full.`
                  : `${tone.name} writes the answer from your brief. Press Draft to start; ${challengerOf(task, project) ?? "a different model"} challenges it next. You can Intervene before that.`
                : `Press Run to call ${tone.name}. Opening the page never does.`
          : "Locked until the steps it needs are spun.";

  return (
    <>
      <div className="border-b border-line px-5 pt-4 pb-3.5">
        <p className={`eyebrow ${task.status === "failed" ? "text-danger" : running ? "text-thread" : ""}`}>
          ● {eyebrow} · step {number} of {project.tasks.length}
        </p>
        <h2 className="mt-1.5 font-serif text-[30px] leading-[1.05]">{task.title}</h2>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-dim">
          <Monogram tone={tone} />
          {line ?? <SpinningLine name={tone.name} startedAt={task.startedAt} />}
        </p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-3 overflow-x-hidden overflow-y-auto px-5 py-3.5">
        {task.status === "failed" ? (
          <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 font-mono text-[12px] text-danger">
            {failure ? hideModelIds(failure) : "No error text was stored."}
          </p>
        ) : null}
        <ContextBar sections={carried.sections} title={carried.handed ? `Context carried to ${tone.name}` : `Context ${tone.name} will receive`} />
        <button type="button" onClick={() => onOpenHandoff(task.id)} className="-mt-1 justify-self-start text-xs font-[560] text-thread hover:text-thread-bright">
          Open the full handoff →
        </button>
        {carriedNote ? (
          <div className="rounded-lg border-l-2 border-gate bg-gate-bg/60 px-3 py-2 text-[12.5px] leading-snug">
            <p className="font-mono text-[10.5px] tracking-[0.06em] text-gate-ink uppercase">Your note, carried forward</p>
            <p className="mt-0.5">“{carriedNote}”</p>
          </div>
        ) : null}
        {task.output ? (
          <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
            <p className="eyebrow text-[10px]">{isTieOffWriteup(task, project.agents, task.agentId) ? "Tied-off answer" : "Output"}</p>
            <AttributionLine attribution={attributionFor(task, project)} className="mt-0.5 mb-1" />
            {isTieOffWriteup(task, project.agents, task.agentId) ? (
              <FinalArtifactView output={task.output} />
            ) : (
              <OutputView output={task.output} onCompare={() => onOpenReader(task.id)} extraTools={<VersionsButton task={task} project={project} />} />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
            <p className="eyebrow text-[10px]">Instructions</p>
            <p className="mt-1.5 text-[13px] leading-normal whitespace-pre-wrap text-ink-dim">{task.instructions}</p>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 pt-3.5 pb-4">
        {task.status === "done" ? (
          <button type="button" onClick={() => onRerun(task.id)} className="rt-btn h-10 gap-1 text-sm">
            Rerun{agent?.provider === "human" ? null : <RunCost />}
          </button>
        ) : (
          <button
            type="button"
            disabled={!runnable || running}
            onClick={() => onRun(task.id)}
            className="rt-btn rt-btn-thread h-10 gap-1 text-sm"
          >
            {running ? "Spinning…" : task.status === "failed" ? "Respin" : agent?.provider === "human" ? "Open the knot" : verb}
            {running || agent?.provider === "human" ? null : <RunCost />}
          </button>
        )}
      </div>
    </>
  );
}

export function KnotPanel({
  project,
  selectedId,
  pendingId,
  handle,
  onDecide,
  onOpenPacket,
  onOpenHandoff,
  onRun,
  onRerun,
  onOpenReader,
}: {
  project: ProjectDTO;
  selectedId: string | null;
  pendingId: string | null;
  handle: Ref<KnotPanelHandle>;
  onDecide: (taskId: string, approved: boolean, note: string) => Promise<void>;
  onOpenPacket: (taskId: string) => void;
  onOpenHandoff: (taskId: string) => void;
  onRun: (id: string) => void;
  onRerun: (id: string) => void;
  onOpenReader: (taskId: string) => void;
}) {
  const tasks = project.tasks;
  const waiting = tasks.find((task) => task.status === "awaiting_approval");
  const knot = waiting ? knotFor(waiting, project) : null;
  const focus =
    tasks.find((task) => task.status === "running" || task.id === pendingId) ??
    tasks.find((task) => task.status === "failed") ??
    tasks.find((task) => task.id === selectedId) ??
    tasks.find((task) => canRunTask(task, tasks)) ??
    [...tasks].reverse().find((task) => task.status === "done") ??
    null;
  // The sheet opens by itself for each new knot; Close tucks it into the column card.
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const [reopenTick, setReopenTick] = useState(0);
  const sheetRef = useRef<KnotPanelHandle>(null);
  const sheetOpen = !!knot && closedFor !== knot.task.id;
  useImperativeHandle(handle, () => ({
    focusDecision: () => {
      setClosedFor(null);
      setReopenTick((tick) => tick + 1);
    },
    appendNote: (line: string) => {
      // KnotBody stays mounted while a knot exists (even if the sheet is tucked away),
      // so the note state is always reachable.
      return sheetRef.current?.appendNote(line) ?? false;
    },
    isJudging: () => !!knot,
  }));
  useEffect(() => {
    if (reopenTick > 0) sheetRef.current?.focusDecision();
  }, [reopenTick]);

  return (
    <aside
      aria-labelledby={knot ? "knot-title-card" : undefined}
      aria-label={knot ? undefined : "Step detail"}
      className={`mb-[18px] flex flex-col ${knot ? "" : "min-h-[420px]"} overflow-hidden rounded-[18px] border bg-raised ${
        knot
          ? "border-gate-line shadow-[0_30px_60px_-30px_rgba(120,80,10,.35),0_6px_18px_-8px_rgba(31,26,20,.18)]"
          : "border-line shadow-[0_6px_18px_-8px_rgba(31,26,20,.18)]"
      }`}
    >
      {knot ? (
        <KnotSummary knot={knot} project={project} onOpen={() => setClosedFor(null)} />
      ) : null}
      {knot ? (
        <KnotBody
          key={knot.task.id}
          knot={knot}
          project={project}
          handle={sheetRef}
          open={sheetOpen}
          onClose={() => setClosedFor(knot.task.id)}
          onDecide={onDecide}
          onOpenPacket={onOpenPacket}
          onOpenHandoff={onOpenHandoff}
          onOpenReader={onOpenReader}
        />
      ) : null}
      {knot ? null : focus ? (
        <StepBody
          key={focus.id}
          task={focus}
          project={project}
          pendingId={pendingId}
          onRun={onRun}
          onRerun={onRerun}
          onOpenHandoff={onOpenHandoff}
          onOpenReader={onOpenReader}
        />
      ) : (
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div>
            <p className="font-serif text-[26px] leading-tight">No steps on the thread yet</p>
            <p className="mt-2 text-[13px] text-ink-dim">Add a step to start. Nothing runs until you press Run.</p>
            <p className="mt-5 font-serif text-[15px] text-ink-faint italic">{delphicLine(project.id)} <span className="font-sans text-[11px] not-italic">— Delphi</span></p>
          </div>
        </div>
      )}
    </aside>
  );
}
