"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AddTaskForm, type NewTaskInput } from "@/components/AddTaskForm";
import { OutputView } from "@/components/OutputView";
import { Monogram } from "@/components/ThreadBits";
import { useNow } from "@/components/use-now";
import { hideModelIds } from "@/lib/model-label";
import { canRunTask, dependenciesMet, taskNumber } from "@/lib/task-rules";
import {
  agentOf,
  agentTone,
  beadText,
  carriedInto,
  clock,
  durationSeconds,
  isHumanTask,
  modelTag,
  outputGist,
  peekLines,
  since,
  stopwatch,
  threadState,
  type ThreadState,
  failureReason,
} from "@/lib/thread";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

const RED = "var(--color-thread)";
const GRAPHITE = "var(--color-thread-dim)";
const FRAY = "var(--color-danger)";
const GOLD = "var(--color-gate)";

function Ticking({ from, prefix, className }: { from: string | null; prefix: string; className: string }) {
  const now = useNow();
  const seconds = since(from, now);
  return (
    <span className={className}>
      {prefix}
      {seconds !== null ? ` ${stopwatch(seconds)}` : ""}
    </span>
  );
}

type Eye = { id: string; x: number; y: number; state: ThreadState };
type Segment = { id: string; d: string; kind: "spun" | "spinning" | "frayed" | "unspun" };

function weave(a: { x: number; y: number }, b: { x: number; y: number }) {
  const my = (a.y + b.y) / 2;
  const w = 16;
  return `M${a.x} ${a.y} C ${a.x + w} ${a.y + 22}, ${a.x - w} ${my - 10}, ${a.x} ${my} S ${b.x + w} ${b.y - 22}, ${b.x} ${b.y}`;
}

function segmentKind(target: ThreadState): Segment["kind"] {
  if (target === "spun" || target === "knot") return "spun";
  if (target === "spinning") return "spinning";
  if (target === "frayed") return "frayed";
  return "unspun";
}

function Eyelet({ state }: { state: ThreadState }) {
  const base = "absolute top-[19px] -left-[26px] h-[14px] w-[14px] rounded-full";
  if (state === "knot") return <span data-eye className={`${base} opacity-0`} aria-hidden />;
  if (state === "spun") return <span data-eye aria-hidden className={`${base} border-2 border-thread bg-thread shadow-[inset_0_0_0_3px_var(--color-raised)]`} />;
  if (state === "spinning")
    return (
      <span data-eye aria-hidden className={`${base} grid place-items-center bg-raised`}>
        <svg viewBox="0 0 16 16" className="h-4 w-4">
          <circle cx="8" cy="8" r="6" fill="none" stroke={RED} strokeWidth="2" strokeDasharray="4 3" className="spindle" />
          <circle cx="8" cy="8" r="2" fill={RED} />
        </svg>
      </span>
    );
  if (state === "frayed")
    return (
      <span data-eye aria-hidden className={`${base} grid place-items-center border-2 border-danger bg-raised text-[9px] font-bold leading-none text-danger`}>
        ✕
      </span>
    );
  return (
    <span
      data-eye
      aria-hidden
      className={`${base} border-2 bg-raised ${state === "ready" ? "border-thread/70" : "border-dashed border-thread-dim"}`}
    />
  );
}

type Peek = { taskId: string; left: number; top: number };

export function TaskColumn({
  project,
  expandedId,
  pendingId,
  pulseRunId,
  showDependencyHint,
  onDismissHint,
  onToggle,
  onRun,
  onRerun,
  onTieOff,
  onCopyError,
  onAdd,
  lineageTaskId,
  onOpenLineage,
  onOpenHandoff,
}: {
  project: ProjectDTO;
  expandedId: string | null;
  pendingId: string | null;
  pulseRunId: string | null;
  showDependencyHint: boolean;
  onDismissHint: () => void;
  onToggle: (id: string) => void;
  onRun: (id: string) => void;
  onRerun: (id: string) => void;
  onTieOff: (id: string) => void;
  onCopyError: (message: string) => void;
  onAdd: (input: NewTaskInput) => Promise<string | null>;
  lineageTaskId: string | null;
  onOpenLineage: (id: string) => void;
  onOpenHandoff: (taskId: string) => void;
}) {
  const { tasks, agents, events } = project;
  const spool = useRef<HTMLDivElement>(null);
  const [eyes, setEyes] = useState<Eye[]>([]);
  const [peek, setPeek] = useState<Peek | null>(null);
  const states = tasks.map((task) => threadState(task, tasks, pendingId));
  const stateKey = states.join(",");
  const hintTaskId = showDependencyHint
    ? (tasks.find((task) => task.status === "pending" && !dependenciesMet(task, tasks))?.id ?? null)
    : null;

  useLayoutEffect(() => {
    const root = spool.current;
    if (!root) return;
    function measure() {
      const box = root?.getBoundingClientRect();
      if (!box || !root) return;
      const found = [...root.querySelectorAll<HTMLElement>("[data-step]")].map((step) => {
        const rect = step.getBoundingClientRect();
        return {
          id: step.dataset.step ?? "",
          x: rect.left - box.left - 19,
          y: rect.top - box.top + 26,
          state: (step.dataset.state ?? "unspun") as ThreadState,
        };
      });
      setEyes((current) =>
        current.length === found.length &&
        current.every((eye, index) => eye.x === found[index].x && eye.y === found[index].y && eye.state === found[index].state)
          ? current
          : found,
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const child of root.querySelectorAll("[data-step]")) observer.observe(child);
    return () => observer.disconnect();
  }, [stateKey, expandedId, tasks.length]);

  const segments: Segment[] = [];
  if (eyes.length > 0) {
    const first = eyes[0];
    segments.push({
      id: `entry-${first.id}`,
      d: weave({ x: first.x, y: -6 }, first),
      kind: first.state === "ready" || first.state === "unspun" ? "unspun" : segmentKind(first.state),
    });
    for (let index = 0; index < eyes.length - 1; index += 1) {
      const a = eyes[index];
      const b = eyes[index + 1];
      const kind = a.state === "spun" ? segmentKind(b.state) : "unspun";
      segments.push({ id: `${a.id}-${b.id}`, d: weave(a, b), kind });
    }
  }
  const knot = eyes.find((eye) => eye.state === "knot");

  function showPeek(taskId: string, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const width = 330;
    const left = Math.min(window.innerWidth - width - 16, rect.right + 12);
    setPeek({ taskId, left, top: rect.top - 6 });
  }

  const peekTask = peek ? tasks.find((task) => task.id === peek.taskId) : undefined;
  const peekCarried = peekTask ? carriedInto(peekTask, project) : null;
  const peekData = peekCarried ? peekLines(peekCarried) : null;

  return (
    <section id="workflow" aria-label="The thread" className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1" onScroll={() => setPeek(null)}>
        <div ref={spool} className="relative pt-1.5 pb-2">
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {segments.map((segment) => (
              <path
                key={`${segment.id}-${segment.kind}`}
                d={segment.d}
                fill="none"
                strokeLinecap="round"
                pathLength={segment.kind === "spun" ? 1 : undefined}
                className={segment.kind === "spun" ? "thread-draw" : segment.kind === "spinning" ? "thread-spin" : undefined}
                stroke={segment.kind === "unspun" ? GRAPHITE : segment.kind === "frayed" ? FRAY : RED}
                strokeWidth={segment.kind === "unspun" ? 1.6 : 2.4}
                strokeDasharray={segment.kind === "unspun" ? "2 5" : segment.kind === "frayed" ? "5 4 2 6" : undefined}
              />
            ))}
            {knot ? (
              <g>
                <circle cx={knot.x} cy={knot.y} r="11" fill="var(--color-gate-bg)" stroke={GOLD} strokeWidth="2" />
                <path
                  d={`M${knot.x - 6} ${knot.y + 3} c 3 -9 9 -9 12 0 c -3 5 -9 5 -12 -6`}
                  stroke={GOLD}
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
            ) : null}
          </svg>
          <ol>
            {tasks.map((task, index) => {
              const agent = agentOf(task, agents);
              const tone = agentTone(agent, agents);
              const state = states[index];
              const open = expandedId === task.id;
              const runnable = canRunTask(task, tasks);
              const busy = state === "spinning";
              const human = agent?.provider === "human";
              const summary = state === "spun" ? outputGist(task, agents) : null;
              const rawError = task.status === "failed" ? failureReason(task.id, events) : null;
              const errorText = rawError ? hideModelIds(rawError) : null;
              const seconds = durationSeconds(task);
              const tag = modelTag(task, agents);
              const next = tasks[index + 1];
              const blockers = task.dependsOn
                .map((id) => tasks.find((item) => item.id === id))
                .filter((item): item is TaskDTO => !!item && item.status !== "done");
              const humanBlocker = blockers.find((item) => isHumanTask(item, agents));
              const waitingSince =
                events
                  .filter((event) => event.type === "approval_requested" && event.taskId === task.id)
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                  .at(-1)?.createdAt ?? task.startedAt;
              const carriedNext = next ? carriedInto(next, project) : null;
              const bead = carriedNext ? beadText(carriedNext, project) : null;
              const beadLive = !!carriedNext?.handed;

              const cardTone =
                state === "knot"
                  ? "knot-breathe border-gate-line bg-[linear-gradient(0deg,var(--color-gate-bg),#fdf6e4)]"
                  : state === "unspun"
                    ? "border-dashed border-line-strong bg-transparent shadow-none"
                    : state === "frayed"
                      ? "border-danger/40 bg-raised"
                      : "border-line bg-raised";

              return (
                <li key={task.id} data-task-id={task.id} data-task-index={index} data-task-status={task.status}>
                  <article
                    data-step={task.id}
                    data-state={state}
                    className={`group/step relative ml-[78px] grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 rounded-[14px] border py-[13px] pr-4 pl-[18px] transition-[transform,box-shadow,border-color] duration-150 ${cardTone} ${
                      state === "unspun" ? "" : "shadow-[0_1px_0_rgba(31,26,20,.04),0_6px_18px_-8px_rgba(31,26,20,.18)] hover:-translate-y-px hover:border-line-strong hover:shadow-[0_1px_0_rgba(31,26,20,.04),0_14px_26px_-12px_rgba(31,26,20,.28)] motion-reduce:hover:translate-y-0"
                    } ${open ? "ring-2 ring-thread/25" : ""}`}
                  >
                    <span
                      aria-hidden
                      className={`absolute top-3 -left-[84px] w-10 text-right font-serif text-2xl ${
                        state === "knot" ? "text-gate-ink" : state === "frayed" ? "text-danger" : "text-ink-faint"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <Eyelet state={state} />
                    <div className="min-w-0">
                      <h3 className="font-serif text-[23px] leading-[1.1] tracking-[-0.005em]">
                        <button
                          type="button"
                          onClick={() => onToggle(task.id)}
                          aria-expanded={open}
                          className={`text-left hover:text-thread ${state === "unspun" ? "text-ink-faint" : "text-ink"}`}
                        >
                          <span className="sr-only">Step {index + 1}: </span>
                          {task.title}
                        </button>
                      </h3>
                      <p className={`mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] ${state === "unspun" ? "text-ink-faint" : "text-ink-dim"}`}>
                        <span className="inline-flex items-center gap-1.5">
                          <Monogram tone={tone} dim={state === "unspun"} />
                          {tone.name}
                        </span>
                        {state === "spun" ? (
                          <span className="font-mono text-[11.5px] text-ink-faint tnum">
                            {[stopwatch(seconds), tag].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                        {state === "knot" ? (
                          <Ticking
                            from={waitingSince}
                            prefix="waiting"
                            className="rounded-md bg-gate/15 px-[7px] py-0.5 font-mono text-[11.5px] text-gate-ink tnum"
                          />
                        ) : null}
                        {state === "spinning" ? (
                          <Ticking from={task.startedAt} prefix={`spinning${tag ? ` · ${tag}` : ""} ·`} className="font-mono text-[11.5px] text-thread tnum" />
                        ) : null}
                        {state === "frayed" ? (
                          <span className="font-mono text-[11.5px] text-danger">frayed · the run failed</span>
                        ) : null}
                        {state === "ready" ? (
                          <span className="font-mono text-[11.5px] text-ink-faint">
                            {human
                              ? `ready · packages ${carriedInto(task, project).arrived.length} inputs for you`
                              : `ready · nothing runs until you press Run`}
                          </span>
                        ) : null}
                        {state === "unspun" ? (
                          <span className="font-mono text-[11.5px]">
                            unspun ·{" "}
                            {humanBlocker
                              ? `unlocks when you tie off ${taskNumber(humanBlocker.id, tasks)}`
                              : blockers.length > 0
                                ? `unlocks when ${blockers.map((item) => taskNumber(item.id, tasks)).join(" + ")} ${blockers.length > 1 ? "are" : "is"} spun`
                                : "locked"}
                          </span>
                        ) : null}
                        {task.requiresApproval && !human && state !== "knot" ? (
                          <span className="font-mono text-[11px] text-ink-faint">· then waits for you</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-start gap-1.5">
                      {state === "knot" ? (
                        <button type="button" onClick={() => onTieOff(task.id)} className="rt-btn rt-btn-knot">
                          Tie off →
                        </button>
                      ) : state === "spun" ? (
                        <>
                          <button type="button" onClick={() => onToggle(task.id)} aria-expanded={open} className="rt-btn rt-btn-ghost">
                            {open ? "Hide" : "Output"}
                          </button>
                          <button type="button" onClick={() => onRerun(task.id)} className="rt-btn">
                            Rerun
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          data-can-run={runnable ? "true" : "false"}
                          disabled={!runnable || busy}
                          onClick={() => onRun(task.id)}
                          aria-label={task.status === "failed" ? "Retry" : undefined}
                          title={
                            !runnable
                              ? "Finish the tasks this one needs. Ariadne will not run it until you press Run."
                              : human
                                ? "Packages earlier work for your approval. Does not call Claude or GPT."
                                : "Calls this agent now. Opening the page does not."
                          }
                          className={`rt-btn ${runnable && !busy ? "rt-btn-thread" : "rt-btn-ghost"} ${
                            pulseRunId === task.id && runnable ? "pulse-run ring-2 ring-thread/40" : ""
                          }`}
                        >
                          {busy ? "Spinning…" : task.status === "failed" ? "Respin" : human && runnable ? "Open the knot" : "Run"}
                        </button>
                      )}
                    </div>
                    {summary ? (
                      <p className="col-span-2 mt-1.5 truncate text-[13px] leading-snug text-ink-dim">
                        {summary.lead ? <b className="font-semibold text-ink">{summary.lead}</b> : null}
                        {summary.lead && summary.rest ? " " : ""}
                        {summary.rest}
                      </p>
                    ) : null}
                    {state === "frayed" && errorText && !open ? (
                      <p className="col-span-2 mt-1.5 truncate font-mono text-[12px] text-danger">{errorText}</p>
                    ) : null}
                    {task.id === hintTaskId ? (
                      <p className="col-span-2 mt-2 flex items-start justify-between gap-3 rounded-lg bg-panel px-2.5 py-1.5 text-[12.5px] text-ink-dim">
                        <span>Locked until the tasks it needs are finished.</span>
                        <button type="button" onClick={onDismissHint} className="shrink-0 text-xs text-ink-faint hover:text-ink">
                          Dismiss
                        </button>
                      </p>
                    ) : null}
                    {open ? (
                      <div className="col-span-2 mt-3 space-y-3 border-t border-line pt-3">
                        <p className="text-[13px] leading-normal whitespace-pre-wrap text-ink">{task.instructions}</p>
                        <p className="flex flex-wrap items-center gap-3 text-[13px]">
                          {task.startedAt ? (
                            <span className="font-mono text-xs text-ink-faint tnum">
                              {[clock(task.startedAt) ? `started ${clock(task.startedAt)}` : null, stopwatch(seconds), tag]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            aria-expanded={lineageTaskId === task.id}
                            aria-haspopup="dialog"
                            onClick={() => onOpenLineage(task.id)}
                            className="font-[560] text-thread hover:text-thread-bright"
                          >
                            Lineage
                          </button>
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            onClick={() => onOpenHandoff(task.id)}
                            className="font-[560] text-thread hover:text-thread-bright"
                          >
                            What it was handed
                          </button>
                        </p>
                        {busy ? (
                          <div className="space-y-2" aria-hidden>
                            <div className="h-3 w-4/5 animate-pulse rounded bg-panel" />
                            <div className="h-3 w-3/5 animate-pulse rounded bg-panel" />
                          </div>
                        ) : null}
                        {task.status === "failed" && !busy ? (
                          <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-3">
                            <p className="text-sm font-semibold text-danger">The thread frayed here: this run failed.</p>
                            <p className="mt-1 text-sm leading-normal">
                              {errorText ?? "No error text was stored. Press Respin when you want another attempt."}
                            </p>
                            <p className="mt-1 text-xs text-ink-dim">Respin calls the agent again. Copy the error if you want to send it as feedback.</p>
                            {errorText ? (
                              <button type="button" onClick={() => onCopyError(errorText)} className="rt-btn mt-2 h-7 px-2.5 text-xs">
                                Copy error
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {task.output && !busy ? (
                          <div className="max-h-96 overflow-auto rounded-xl border border-line bg-panel px-3.5 py-3">
                            <OutputView output={task.output} />
                          </div>
                        ) : null}
                        {!task.output && !busy && task.status !== "failed" ? (
                          <p className="text-sm leading-normal text-ink-dim">
                            {human
                              ? "Nothing to decide yet. This gate opens when the steps before it are spun."
                              : index === 0 && agent
                                ? `Run step 1 to see ${agent.name} think.`
                                : "No output yet. Press Run when you want this step to work."}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                  {bead ? (
                    <div className="relative ml-[78px] flex h-[38px] items-center">
                      <button
                        type="button"
                        onClick={() => onOpenHandoff(next.id)}
                        onMouseEnter={(event) => showPeek(next.id, event.currentTarget)}
                        onMouseLeave={() => setPeek(null)}
                        onFocus={(event) => showPeek(next.id, event.currentTarget)}
                        onBlur={() => setPeek(null)}
                        data-bead={next.id}
                        aria-label={`${bead.lead}: ${bead.label}. Open the full handoff.`}
                        className={`-ml-5 inline-flex max-w-full items-center gap-2 rounded-full border py-[3px] pr-2.5 pl-2 text-xs transition-[box-shadow,border-color] ${
                          beadLive
                            ? "border-thread-soft bg-raised text-ink-dim hover:border-thread hover:shadow-[0_6px_18px_-10px_rgba(179,48,42,.7)]"
                            : "border-dashed border-line-strong bg-transparent text-ink-faint hover:border-ink-faint"
                        } ${peek?.taskId === next.id ? (beadLive ? "border-thread shadow-[0_6px_18px_-10px_rgba(179,48,42,.7)]" : "border-ink-faint") : ""}`}
                      >
                        <span aria-hidden className={beadLive ? "text-thread" : ""}>
                          ↳
                        </span>
                        <span className="truncate">{bead.lead}</span>
                        <span className={`shrink-0 font-mono text-[11px] tnum ${beadLive ? "text-thread" : ""}`}>{bead.label}</span>
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
        <AddTaskForm key={agents.map((agent) => agent.id).join()} tasks={tasks} agents={agents} onSubmit={onAdd} />
      </div>
      {peek && peekCarried && peekData ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-40 w-[330px] rounded-xl bg-ink px-3.5 py-3 text-[12.5px] text-[#f4eee3] shadow-[0_18px_40px_-16px_rgba(31,26,20,.6)]"
          style={{ left: peek.left, top: peek.top }}
        >
          <span aria-hidden className="absolute top-3.5 -left-1.5 h-3 w-3 rotate-45 rounded-[2px] bg-ink" />
          <p className="flex justify-between gap-3 font-mono text-[10.5px] tracking-[0.06em] text-[#c9bba5] uppercase">
            <span className="truncate">
              {peekCarried.handed ? "Context carried" : "Will carry"} ·{" "}
              {[...new Set(peekCarried.arrived.map((item) => agentOf(item, agents)?.name ?? ""))].filter(Boolean).join(" + ") || "brief"} →{" "}
              {peekCarried.human ? "You" : peekCarried.targetAgent?.name}
            </span>
            <span className="shrink-0">{clock(peekCarried.handoffAt) ?? ""}</span>
          </p>
          {peekData.lines.length > 0 ? (
            <ul className="mt-2 grid gap-[5px]">
              {peekData.lines.map((line, index) => (
                <li key={`${index}-${line}`} className="grid grid-cols-[14px_minmax(0,1fr)] gap-1.5 leading-snug">
                  <span aria-hidden className="text-[#d9584c]">
                    —
                  </span>
                  <span className="line-clamp-2">{line}</span>
                </li>
              ))}
              {peekData.more ? (
                <li className="grid grid-cols-[14px_minmax(0,1fr)] gap-1.5 leading-snug">
                  <span aria-hidden className="text-[#d9584c]">
                    —
                  </span>
                  <span>{peekData.more}</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-2 leading-snug">Nothing has been handed over yet. The upstream steps have to be spun first.</p>
          )}
          <p className="mt-2 border-t border-white/10 pt-2 font-mono text-[11px] text-[#c9bba5]">
            Click to open the full handoff, instructions included
          </p>
        </div>
      ) : null}
    </section>
  );
}
