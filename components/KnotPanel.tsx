"use client";

import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { OutputView } from "@/components/OutputView";
import { ContextBar, Monogram } from "@/components/ThreadBits";
import { useClocks, useNow } from "@/components/use-now";
import { hideModelIds } from "@/lib/model-label";
import { canRunTask, taskNumber } from "@/lib/task-rules";
import {
  agentOf,
  agentTone,
  artifactPreview,
  carriedInto,
  charsLabel,
  inputChars,
  knotFor,
  reviewFlags,
  since,
  stepRange,
  stopwatch,
  type Knot,
  failureReason,
} from "@/lib/thread";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

export type KnotPanelHandle = { focusDecision: () => void };

function MergeThreads({ knot, project }: { knot: Knot; project: ProjectDTO }) {
  const rows = knot.inputs.length;
  const rowHeight = 46;
  const height = Math.max(rowHeight, rows * rowHeight);
  const max = Math.max(1, ...knot.inputs.map((input) => input.chars));
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
        {knot.inputs.map((input, index) => {
          const y = rowHeight * index + rowHeight / 2;
          const width = 1.4 + 4.6 * (input.chars / max);
          return (
            <path
              key={input.task.id}
              d={y === cy ? `M0 ${y} H64` : `M0 ${y} C40 ${y} 36 ${cy} 64 ${cy}`}
              stroke="var(--color-thread)"
              strokeWidth={width}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx="62" cy={cy} r="6.5" fill="var(--color-gate)" stroke="var(--color-raised)" strokeWidth="2" />
      </svg>
      {knot.inputs.length === 0 ? (
        <p className="flex h-[46px] items-center text-xs text-ink-dim">No finished steps feed this knot yet.</p>
      ) : (
        knot.inputs.map((input, index) => (
          <div
            key={input.task.id}
            className={`flex h-[46px] min-w-0 flex-col justify-center ${index < rows - 1 ? "border-b border-dashed border-line" : ""}`}
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

function KnotBody({
  knot,
  project,
  handle,
  onDecide,
  onOpenPacket,
  onOpenHandoff,
}: {
  knot: Knot;
  project: ProjectDTO;
  handle: Ref<KnotPanelHandle>;
  onDecide: (taskId: string, approved: boolean, note: string) => Promise<void>;
  onOpenPacket: (taskId: string) => void;
  onOpenHandoff: (taskId: string) => void;
}) {
  const { clock } = useClocks();
  const { task } = knot;
  const agents = project.agents;
  const now = useNow();
  const approveRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "changes" | null>(null);
  const [needNote, setNeedNote] = useState(false);
  useImperativeHandle(handle, () => ({
    focusDecision: () => {
      approveRef.current?.scrollIntoView({ block: "nearest" });
      approveRef.current?.focus();
    },
  }));

  const preview = artifactPreview(knot.artifact, agents);
  const flags = reviewFlags(knot.reviewers, agents);
  const artifactAgent = agentOf(knot.artifact ?? undefined, agents);
  const unlock = knot.unlocks[0];
  const unlockAgent = agentOf(unlock, agents);
  const waited = since(knot.openedAt, now);
  const total = project.tasks.length;
  const number = taskNumber(task.id, project.tasks);
  const rewinds = knot.resets.filter((item) => item.id !== task.id);

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

  return (
    <>
      <div className="border-b border-[#f0ddb0] bg-[linear-gradient(180deg,#fcf1d6,#fbf6ea)] px-5 pt-4 pb-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow text-gate-ink">
            ● The knot · step {number} of {total}
          </p>
          <p className="font-mono text-[11.5px] text-gate-ink tnum">
            {clock(knot.openedAt) ? `opened ${clock(knot.openedAt)}` : null}
            {waited !== null ? ` · ${stopwatch(waited)}` : null}
          </p>
        </div>
        <h2 id="knot-title" className="mt-1.5 font-serif text-[30px] leading-[1.05]">
          {task.title}
        </h2>
        <p className="mt-1 text-[13px] text-ink-dim">Nothing moves past here until you decide.</p>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-5 py-3.5">
        <MergeThreads knot={knot} project={project} />
        <p className="-mt-1 flex justify-between text-[11.5px] text-ink-faint">
          <span>Threads drawn to scale by context carried</span>
          <button type="button" onClick={() => onOpenHandoff(task.id)} className="font-[560] text-thread hover:text-thread-bright">
            {charsLabel(inputChars(knot.carried))} reach you →
          </button>
        </p>
        {preview ? (
          <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
            <p className="eyebrow text-[10px]">
              What you&apos;re approving · {preview.eyebrow}
              {artifactAgent ? ` · by ${artifactAgent.name}` : ""}
            </p>
            <h3 className="mt-1.5 font-serif text-[25px] leading-[1.05]">{preview.title}</h3>
            {preview.body ? <p className="mt-1.5 line-clamp-2 text-[12.5px] text-ink-dim">{preview.body}</p> : null}
          </div>
        ) : null}
        {flags && (flags.flags.length > 0 || flags.verdict) ? (
          <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 rounded-[10px] bg-tint px-3 py-2.5 text-[12.5px] text-ink-dim">
            <span aria-hidden>⚑</span>
            <p>
              <b className="text-ink">
                {flags.reviewer} noted {flags.flags.length} {flags.flags.length === 1 ? "point" : "points"}
                {flags.flags.length > 0 ? ":" : "."}
              </b>{" "}
              <span className="line-clamp-3 inline">{flags.flags.slice(0, 3).map((flag) => flag.replace(/[.;:,]+\s*$/, "")).join("; ")}</span>
              {flags.verdict ? <span className="mt-1 block text-ink">Verdict: {flags.verdict}</span> : null}
            </p>
          </div>
        ) : null}
        <label className="block rounded-[10px] border border-dashed border-line-strong px-3 py-2 focus-within:border-thread">
          <span className="sr-only">Note for the agents if you request changes</span>
          <textarea
            ref={noteRef}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              if (needNote) setNeedNote(false);
            }}
            rows={2}
            placeholder={`Note for ${artifactAgent?.name ?? "the agents"}, if you request changes…`}
            className="w-full resize-none bg-transparent text-[12.5px] leading-normal text-ink outline-none placeholder:text-ink-faint"
            aria-invalid={needNote}
            aria-describedby="knot-note-hint"
          />
          <span id="knot-note-hint" className={`block font-mono text-[11px] ${needNote ? "text-danger" : "text-ink-faint"}`}>
            {needNote
              ? "Add a note first, so the agents know what to change."
              : rewinds.length > 0
                ? `↺ resets ${stepRange(rewinds, project.tasks)} · you rerun ${stepRange(knot.rerunFirst, project.tasks)} with your note`
                : "↺ sends this step back with your note"}
          </span>
        </label>
        <button type="button" onClick={() => onOpenPacket(task.id)} className="justify-self-start text-xs font-[560] text-ink-dim underline decoration-line-strong underline-offset-4 hover:text-ink">
          Read the full packet
        </button>
      </div>
      <div className="grid gap-2.5 border-t border-line px-5 pt-3.5 pb-4">
        <div className="flex gap-2">
          <button
            ref={approveRef}
            type="button"
            disabled={busy !== null}
            onClick={() => void submit(true)}
            className="rt-btn rt-btn-knot h-10 flex-1 text-sm"
          >
            {busy === "approve" ? "Tying off…" : "Approve · tie off & continue"}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void submit(false)} className="rt-btn h-10 text-sm">
            {busy === "changes" ? "Sending…" : "Request changes"}
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-ink-faint">
          {unlock ? (
            <>
              ↳ Unlocks{" "}
              <b className="font-semibold text-ink-dim">
                {taskNumber(unlock.id, project.tasks)} · {unlock.title}
              </b>{" "}
              for {unlockAgent?.name ?? "the next step"}
            </>
          ) : (
            "↳ Approving marks this step done."
          )}
        </p>
      </div>
    </>
  );
}

function StepBody({
  task,
  project,
  pendingId,
  onRun,
  onRerun,
  onOpenHandoff,
}: {
  task: TaskDTO;
  project: ProjectDTO;
  pendingId: string | null;
  onRun: (id: string) => void;
  onRerun: (id: string) => void;
  onOpenHandoff: (taskId: string) => void;
}) {
  const { clock } = useClocks();
  const agents = project.agents;
  const agent = agentOf(task, agents);
  const tone = agentTone(agent, agents);
  const now = useNow();
  const number = taskNumber(task.id, project.tasks);
  const carried = carriedInto(task, project);
  const running = task.status === "running" || pendingId === task.id;
  const runnable = canRunTask(task, project.tasks);
  const failure = failureReason(task.id, project.events);
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
    ? `${tone.name} is working${since(task.startedAt, now) !== null ? ` · ${stopwatch(since(task.startedAt, now))}` : ""}. Nothing else moves until it lands.`
    : task.status === "failed"
      ? "The thread frayed here. Respin calls the agent again."
      : task.status === "done"
        ? `${tone.name} finished this${clock(task.completedAt) ? ` at ${clock(task.completedAt)}` : ""}.`
        : runnable
          ? agent?.provider === "human"
            ? "Opening the knot packages earlier work for your decision. No model is called."
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
          {line}
        </p>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-5 py-3.5">
        {task.status === "failed" ? (
          <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 font-mono text-[12px] text-danger">
            {failure ? hideModelIds(failure) : "No error text was stored."}
          </p>
        ) : null}
        <ContextBar sections={carried.sections} title={carried.handed ? `Context carried to ${tone.name}` : `Context ${tone.name} will receive`} />
        <button type="button" onClick={() => onOpenHandoff(task.id)} className="-mt-1 justify-self-start text-xs font-[560] text-thread hover:text-thread-bright">
          Open the full handoff →
        </button>
        {task.output ? (
          <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
            <p className="eyebrow mb-1.5 text-[10px]">Output</p>
            <OutputView output={task.output} />
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
          <button type="button" onClick={() => onRerun(task.id)} className="rt-btn h-10 text-sm">
            Rerun
          </button>
        ) : (
          <button
            type="button"
            disabled={!runnable || running}
            onClick={() => onRun(task.id)}
            className="rt-btn rt-btn-thread h-10 text-sm"
          >
            {running ? "Spinning…" : task.status === "failed" ? "Respin" : agent?.provider === "human" ? "Open the knot" : "Run"}
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

  return (
    <aside
      aria-labelledby={knot ? "knot-title" : undefined}
      aria-label={knot ? undefined : "Step detail"}
      className={`mb-[18px] flex min-h-[420px] flex-col overflow-hidden rounded-[18px] border bg-raised ${
        knot
          ? "border-gate-line shadow-[0_30px_60px_-30px_rgba(120,80,10,.35),0_6px_18px_-8px_rgba(31,26,20,.18)]"
          : "border-line shadow-[0_6px_18px_-8px_rgba(31,26,20,.18)]"
      }`}
    >
      {knot ? (
        <KnotBody
          key={knot.task.id}
          knot={knot}
          project={project}
          handle={handle}
          onDecide={onDecide}
          onOpenPacket={onOpenPacket}
          onOpenHandoff={onOpenHandoff}
        />
      ) : focus ? (
        <StepBody
          key={focus.id}
          task={focus}
          project={project}
          pendingId={pendingId}
          onRun={onRun}
          onRerun={onRerun}
          onOpenHandoff={onOpenHandoff}
        />
      ) : (
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div>
            <p className="font-serif text-[26px] leading-tight">No steps on the thread yet</p>
            <p className="mt-2 text-[13px] text-ink-dim">Add a step to start. Nothing runs until you press Run.</p>
          </div>
        </div>
      )}
    </aside>
  );
}
