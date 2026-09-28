"use client";

import { useEffect, useRef, useState } from "react";
import { AddTaskForm, type NewTaskInput } from "@/components/AddTaskForm";
import { OutputView } from "@/components/OutputView";
import { displayModel, hideModelIds } from "@/lib/model-label";
import { canRunTask, dependenciesMet, dependencyLabel, providerLabel } from "@/lib/task-rules";
import type { ActivityEventDTO, AgentDTO, TaskDTO } from "@/lib/types";

function StatusMark({ status }: { status: string }) {
  if (status === "done") {
    return (
      <span className="font-mono text-lg leading-none text-ok" aria-label="done">
        ●
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="font-mono text-lg leading-none text-danger" aria-label="failed">
        ✕
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="pulse-status font-mono text-lg leading-none text-working" aria-label="running">
        ◉
      </span>
    );
  }
  if (status === "awaiting_approval") {
    return (
      <span className="pulse-status font-mono text-lg leading-none text-gate" aria-label="awaiting approval">
        ◆
      </span>
    );
  }
  return (
    <span className="font-mono text-lg leading-none text-ink-dim" aria-label="pending">
      ○
    </span>
  );
}

function elapsed(task: TaskDTO) {
  if (!task.startedAt || !task.completedAt) return null;
  const seconds = Math.max(
    0,
    Math.round((new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function failureMessage(taskId: string, events: ActivityEventDTO[]) {
  return events.find((event) => event.type === "failed" && event.taskId === taskId)?.message ?? null;
}

function WorkingTicker({ name, startedAt }: { name: string; startedAt: string | null }) {
  const origin = useRef(startedAt ? new Date(startedAt).getTime() : Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt) origin.current = new Date(startedAt).getTime();
  }, [startedAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.round((now - origin.current) / 1000));
  return (
    <p className="mt-2 font-mono text-xs text-working">
      {name} working · {seconds}s
    </p>
  );
}

export function TaskColumn({
  tasks,
  agents,
  events,
  expandedId,
  pendingId,
  pulseRunId,
  showDependencyHint,
  onDismissHint,
  onToggle,
  onRun,
  onRerun,
  onReview,
  onCopyError,
  onAdd,
  lineageTaskId,
  onOpenLineage,
}: {
  tasks: TaskDTO[];
  agents: AgentDTO[];
  events: ActivityEventDTO[];
  expandedId: string | null;
  pendingId: string | null;
  pulseRunId: string | null;
  showDependencyHint: boolean;
  onDismissHint: () => void;
  onToggle: (id: string) => void;
  onRun: (id: string) => void;
  onRerun: (id: string) => void;
  onReview: (id: string) => void;
  onCopyError: (message: string) => void;
  onAdd: (input: NewTaskInput) => Promise<string | null>;
  lineageTaskId: string | null;
  onOpenLineage: (id: string) => void;
}) {
  const anyOutput = tasks.some((task) => task.output);
  const hintTaskId = showDependencyHint
    ? (tasks.find((task) => task.status === "pending" && !dependenciesMet(task, tasks))?.id ?? null)
    : null;

  return (
    <section id="workflow" className="flex min-h-0 flex-col bg-base">
      <div className="px-4 pt-4">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-ink-dim">WORKFLOW</h2>
        {!anyOutput && events.length === 0 ? (
          <p className="mt-2 text-sm leading-normal text-ink-dim">
            Run task 1 to see Scout think. Instructions are readable now.
          </p>
        ) : null}
      </div>
      <ol className="flex-1 overflow-y-auto px-4 py-4">
        {tasks.map((task, index) => {
          const agent = agents.find((item) => item.id === task.agentId);
          const open = expandedId === task.id;
          const blocked = !dependenciesMet(task, tasks) && task.status !== "done" && task.status !== "running";
          const runnable = canRunTask(task, tasks);
          const busy = pendingId === task.id || task.status === "running";
          const displayStatus = busy && task.status !== "running" ? "running" : task.status;
          const flowed = task.status === "done";
          const needs = task.dependsOn.length > 0 ? dependencyLabel(task, tasks) : "";
          const timing = [displayModel(task.model, agent?.provider), elapsed(task)].filter(Boolean).join(" · ");
          const rawError = task.status === "failed" ? failureMessage(task.id, events) : null;
          const errorText = rawError ? hideModelIds(rawError) : null;
          const showHint = task.id === hintTaskId;
          const isLast = index === tasks.length - 1;
          const next = tasks[index + 1];
          const handedOn =
            flowed &&
            !!next &&
            next.dependsOn.includes(task.id) &&
            events.some((event) => event.type === "handoff" && event.taskId === next.id);
          const leadsToGate = !!next && next.status === "awaiting_approval";
          const threadGold = flowed || leadsToGate;
          const awaiting = task.status === "awaiting_approval";

          return (
            <li
              key={task.id}
              data-task-id={task.id}
              data-task-index={index}
              data-task-status={task.status}
              className="enter grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="relative flex justify-center">
                {isLast ? null : (
                  <span
                    aria-hidden
                    className={`absolute top-3 -bottom-3 w-0.5 ${threadGold ? "bg-thread" : "bg-thread-dim"} ${handedOn || leadsToGate ? "thread-flow" : ""}`}
                  />
                )}
                <span className="relative z-10 mt-3 grid h-6 w-6 place-items-center bg-base">
                  <StatusMark status={displayStatus} />
                </span>
              </div>
              <article
                className={`mb-5 min-w-0 bg-panel px-3 py-3 ${
                  awaiting
                    ? "ring-2 ring-thread shadow-[0_0_0_1px_rgba(245,158,11,0.35)]"
                    : "ring-1 ring-white/10"
                } ${blocked ? "opacity-70" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => onToggle(task.id)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
                    <span className="block text-base font-semibold leading-tight">
                      <span className="mr-2 font-mono text-xs text-ink-dim">#{index + 1}</span>
                      {task.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-dim">
                      <span className="bg-base px-1.5 py-0.5 font-mono text-[11px] text-thread-bright ring-1 ring-white/10">
                        {agent?.name ?? "Unassigned"} · {providerLabel(agent?.provider ?? "")}
                      </span>
                      {needs ? <span className="font-mono text-xs">{needs}</span> : null}
                      {task.requiresApproval ? <span className="text-xs font-semibold tracking-wide text-gate">GATE</span> : null}
                    </span>
                  </button>
                  <div className="shrink-0">
                    {task.status === "awaiting_approval" ? (
                      <button
                        type="button"
                        onClick={() => onReview(task.id)}
                        className="bg-thread px-3 py-1.5 text-sm font-medium text-(--color-base) hover:bg-thread-bright"
                      >
                        Review
                      </button>
                    ) : task.status === "done" ? (
                      <button
                        type="button"
                        onClick={() => onRerun(task.id)}
                        className="px-3 py-1.5 text-sm ring-1 ring-thread/60 text-thread-bright hover:bg-thread/10"
                      >
                        Re-run
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-can-run={runnable ? "true" : "false"}
                        disabled={!runnable || busy}
                        onClick={() => onRun(task.id)}
                        title={
                          !runnable
                            ? "Finish the tasks this one needs. Ariadne will not run it until you press Run."
                            : agent?.provider === "human"
                              ? "Packages earlier work for your approval. Does not call Claude or GPT."
                              : "Calls this agent now. Opening the page does not."
                        }
                        className={`bg-thread px-3 py-1.5 text-sm font-medium text-(--color-base) hover:bg-thread-bright disabled:cursor-not-allowed disabled:bg-thread-dim disabled:text-ink-dim ${
                          pulseRunId === task.id && runnable ? "pulse-run ring-2 ring-thread-bright" : ""
                        }`}
                      >
                        {busy ? "Running" : task.status === "failed" ? "Retry" : "Run"}
                      </button>
                    )}
                  </div>
                </div>
                {displayStatus === "running" ? (
                  <WorkingTicker name={agent?.name ?? "Agent"} startedAt={task.startedAt} />
                ) : null}
                {showHint ? (
                  <p className="mt-3 flex items-start justify-between gap-3 bg-raised px-2 py-2 text-sm leading-normal text-ink">
                    <span>Locked until the tasks it needs are finished.</span>
                    <button type="button" onClick={onDismissHint} className="shrink-0 text-xs text-ink-dim hover:text-ink">
                      Dismiss
                    </button>
                  </p>
                ) : null}
                {open ? (
                  <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                    <p className="text-sm leading-normal whitespace-pre-wrap text-ink">{task.instructions}</p>
                    {timing ? <p className="font-mono text-xs text-ink-dim">{timing}</p> : null}
                    <button
                      type="button"
                      aria-expanded={lineageTaskId === task.id}
                      aria-haspopup="dialog"
                      onClick={() => onOpenLineage(task.id)}
                      className="text-sm font-medium text-thread hover:text-thread-bright"
                    >
                      Lineage
                    </button>
                    {busy ? (
                      <div className="space-y-2" aria-hidden>
                        <div className="h-3 w-4/5 animate-pulse bg-raised" />
                        <div className="h-3 w-3/5 animate-pulse bg-raised" />
                        <div className="h-3 w-2/5 animate-pulse bg-raised" />
                      </div>
                    ) : null}
                    {task.status === "failed" && !busy ? (
                      <div className="bg-danger/10 px-3 py-3 ring-1 ring-danger/40">
                        <p className="text-sm font-semibold text-danger">This run failed.</p>
                        <p className="mt-1 text-sm leading-normal">
                          {errorText ?? "No error text was stored. Press Retry when you want another attempt."}
                        </p>
                        <p className="mt-1 text-xs text-ink-dim">Retry calls the agent again. Copy the error if you want to send it as feedback.</p>
                        {errorText ? (
                          <button
                            type="button"
                            onClick={() => onCopyError(errorText)}
                            className="mt-2 ring-1 ring-white/20 px-2 py-1 text-xs hover:ring-thread"
                          >
                            Copy error
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {task.output && !busy ? <OutputView output={task.output} /> : null}
                    {!task.output && !busy && task.status !== "failed" ? (
                      <p className="text-sm leading-normal text-ink-dim">
                        {index === 0
                          ? "Run task 1 to see Scout think."
                          : "No output yet. Press Run when you want this step to work."}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
      <AddTaskForm key={agents.map((agent) => agent.id).join()} tasks={tasks} agents={agents} onSubmit={onAdd} />
    </section>
  );
}
