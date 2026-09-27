"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { parseHandoffMessage, previewChips } from "@/lib/handoff-preview";
import { canRunTask } from "@/lib/task-rules";
import type { ActivityEventDTO, TaskDTO } from "@/lib/types";

function labelFor(type: string) {
  if (type === "handoff") return "Handoff";
  if (type === "approval_requested") return "Waiting on YOU";
  if (type === "started") return "Started";
  if (type === "completed") return "Completed";
  if (type === "approved") return "Approved";
  if (type === "failed") return "Failed";
  if (type === "note") return "Changes";
  return type;
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ActivityFeed({
  events,
  tasks,
  waitingTask,
  onReview,
  onRetry,
  onHide,
  missions,
}: {
  events: ActivityEventDTO[];
  tasks: TaskDTO[];
  waitingTask: TaskDTO | null;
  onReview: () => void;
  onRetry: (taskId: string) => void;
  onHide: () => void;
  missions: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const topId = events[0]?.id;
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.current?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [topId]);

  return (
    <section className="flex min-h-0 flex-col bg-panel ring-1 ring-white/10 xl:ring-y-0 xl:ring-r-0">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-ink-dim">ACTIVITY</h2>
        <button type="button" onClick={onHide} className="text-xs text-ink-dim hover:text-ink" aria-expanded={true}>
          Hide
        </button>
      </div>
      {missions}
      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-3" role="log" aria-live="polite">
        {waitingTask ? (
          <div className="sticky top-0 z-10 bg-gate/15 px-3 py-3 ring-1 ring-gate">
            <p className="text-xs font-semibold tracking-[0.16em] text-thread-bright">WAITING ON YOU</p>
            <p className="mt-1 text-sm leading-normal">{waitingTask.title}</p>
            <button
              type="button"
              onClick={onReview}
              className="mt-2 bg-thread px-3 py-1.5 text-sm font-medium text-(--color-base) hover:bg-thread-bright"
            >
              Review
            </button>
          </div>
        ) : null}
        {events.length === 0 ? (
          <p className="border border-dashed border-white/15 px-3 py-6 text-sm leading-normal text-ink-dim">
            Run task 1 to see Scout think. Starts, handoffs, and the approval gate show up here after you press Run.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => {
              const task = tasks.find((item) => item.id === event.taskId);
              const reviewable = event.type === "approval_requested" && task?.status === "awaiting_approval";
              const retryable = event.type === "failed" && !!task && canRunTask(task, tasks);
              const time = (
                <time className="font-mono text-xs text-ink-dim" dateTime={event.createdAt}>
                  {timeLabel(event.createdAt)}
                </time>
              );

              if (event.type === "handoff") {
                const parsed = parseHandoffMessage(event.message);
                const source = parsed
                  ? tasks.find((item) => item.title === parsed.title)
                  : undefined;
                const chips = previewChips(source?.output ?? "");
                const open = openDocId === event.id;
                return (
                  <li key={event.id} data-event-type={event.type} className="bg-thread/15 px-3 py-3 ring-1 ring-thread">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold tracking-[0.16em] text-thread-bright">HANDOFF</span>
                      {time}
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-snug text-ink">
                      {parsed ? `${parsed.from} → ${parsed.to}` : event.message}
                    </span>
                    {parsed ? (
                      <span className="mt-1 block text-xs leading-normal text-ink-dim">{parsed.title}</span>
                    ) : null}
                    {chips.length > 0 ? (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {chips.map((chip) => (
                          <span key={chip} className="bg-base px-1.5 py-0.5 font-mono text-[11px] leading-normal text-thread-bright ring-1 ring-thread/40">
                            {chip}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    {source?.output ? (
                      <button
                        type="button"
                        onClick={() => setOpenDocId(open ? null : event.id)}
                        className="mt-2 text-xs font-medium text-thread-bright hover:text-ink"
                      >
                        {open ? "Hide document" : "Full document"}
                      </button>
                    ) : null}
                    {open && source?.output ? (
                      <pre className="mt-2 max-h-48 overflow-auto bg-base p-2 font-mono text-xs leading-normal whitespace-pre-wrap text-ink">
                        {source.output}
                      </pre>
                    ) : null}
                  </li>
                );
              }

              if (event.type === "approval_requested") {
                return (
                  <li key={event.id} data-event-type={event.type} className="bg-gate/15 px-3 py-3 ring-1 ring-gate">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold tracking-[0.16em] text-thread-bright">{labelFor(event.type)}</span>
                      {time}
                    </span>
                    <span className="mt-1 block text-sm leading-normal">{event.message}</span>
                    {reviewable ? (
                      <button
                        type="button"
                        onClick={onReview}
                        className="mt-2 bg-thread px-3 py-1.5 text-sm font-medium text-(--color-base) hover:bg-thread-bright"
                      >
                        Review
                      </button>
                    ) : null}
                  </li>
                );
              }

              const tone =
                event.type === "failed"
                  ? "bg-danger/10 ring-1 ring-danger/40"
                  : event.type === "approved"
                    ? "bg-ok/10 ring-1 ring-ok/30"
                    : "bg-raised ring-1 ring-white/10";

              return (
                <li key={event.id} data-event-type={event.type} className={`px-3 py-2 ${tone}`}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={`text-xs font-semibold tracking-wide ${event.type === "failed" ? "text-danger" : ""}`}>
                      {labelFor(event.type)}
                    </span>
                    {time}
                  </span>
                  <span className="mt-1 block text-sm leading-normal">{event.message}</span>
                  {retryable && event.taskId ? (
                    <button
                      type="button"
                      onClick={() => onRetry(event.taskId as string)}
                      className="mt-2 ring-1 ring-danger/50 px-2 py-1 text-xs text-danger hover:bg-danger/10"
                    >
                      Retry
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
