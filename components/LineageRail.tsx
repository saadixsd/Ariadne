"use client";

import { useEffect, useRef, useState } from "react";
import { OutputView } from "@/components/OutputView";
import { excerptText, type LineageStep, type LineageWorkNode } from "@/lib/lineage";

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function nodeMeta(node: LineageWorkNode) {
  const parts: string[] = [];
  if (node.kind === "decision" && node.approval) {
    parts.push(node.approval.approver ? `Approved by ${node.approval.approver}` : node.approval.message);
    const approvedAt = timeLabel(node.approval.at);
    if (approvedAt) parts.push(approvedAt);
  } else if (node.timestamp) {
    const stamp = timeLabel(node.timestamp);
    if (stamp) parts.push(stamp);
  }
  if (node.duration) parts.push(node.duration);
  return parts.join(" · ");
}

function Mark({ node }: { node: LineageStep["node"] }) {
  if (node.kind === "brief") {
    return <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-thread" />;
  }
  if (node.kind === "decision") {
    return (
      <span className="font-mono text-lg leading-none text-gate" aria-label="approval">
        ◆
      </span>
    );
  }
  if (node.status === "done") {
    return (
      <span className="font-mono text-lg leading-none text-thread" aria-label="done">
        ●
      </span>
    );
  }
  if (node.status === "failed") {
    return (
      <span className="font-mono text-lg leading-none text-danger" aria-label="failed">
        ✕
      </span>
    );
  }
  if (node.status === "running") {
    return (
      <span className="pulse-status font-mono text-lg leading-none text-working" aria-label="running">
        ◉
      </span>
    );
  }
  return (
    <span className="font-mono text-lg leading-none text-ink-dim" aria-label="pending">
      ○
    </span>
  );
}

function Excerpt({
  body,
  empty,
  noun,
}: {
  body: string | null;
  empty: string;
  noun: string;
}) {
  const [open, setOpen] = useState(false);
  if (!body || body.trim().length === 0) {
    return <p className="text-sm leading-normal text-ink-dim">{empty}</p>;
  }
  const flat = body.replace(/\s+/g, " ").trim();
  const long = flat.length > 220 || body.includes("\n");
  return (
    <div className="mt-2">
      {open ? (
        <div className="max-h-64 overflow-auto">
          <OutputView output={body} foldable={false} />
        </div>
      ) : (
        <p className="font-mono text-xs leading-normal text-ink-dim">{excerptText(body)}</p>
      )}
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="mt-2 text-xs font-medium text-thread-bright hover:text-ink"
        >
          {open ? `Hide ${noun}` : `Show ${noun}`}
        </button>
      ) : null}
    </div>
  );
}

function LineageList({ steps }: { steps: LineageStep[] }) {
  return (
    <ol>
      {steps.map((step, index) => {
        const node = step.node;
        const isFirst = index === 0;
        const isLast = index === steps.length - 1;
        const decision = node.kind === "decision";
        const lineClass = isFirst
          ? "absolute top-6 bottom-0 w-0.5 bg-thread"
          : isLast
            ? "absolute top-0 h-6 w-0.5 bg-thread"
            : "absolute inset-y-0 w-0.5 bg-thread";
        const meta = node.kind === "brief" ? "" : nodeMeta(node);
        return (
          <li key={node.id} data-lineage-node={node.kind} data-lineage-id={node.id}>
            {index > 0 ? (
              <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                <div className="relative flex justify-center">
                  <span aria-hidden className="absolute inset-y-0 w-0.5 bg-thread" />
                </div>
                <div className={step.handoffLabels.length > 0 ? "space-y-1 py-2" : "h-3"}>
                  {step.handoffLabels.map((label, labelIndex) => (
                    <p
                      key={`${node.id}-${labelIndex}`}
                      data-handoff-label
                      className="font-mono text-[11px] leading-normal text-thread-bright"
                    >
                      {label}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            <div
              className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="relative flex justify-center">
                {steps.length > 1 ? <span aria-hidden className={lineClass} /> : null}
                <span className="relative z-10 mt-3 grid h-6 w-6 place-items-center bg-raised">
                  <Mark node={node} />
                </span>
              </div>
              <article
                className={`mb-1 rounded-xl px-3 py-3 ring-1 ${
                  decision
                    ? "bg-gate-bg/50 ring-gate-line"
                    : node.kind !== "brief" && node.selected
                      ? "bg-panel ring-thread-bright"
                      : "bg-panel ring-line"
                }`}
              >
                {node.kind === "brief" ? (
                  <p className="eyebrow text-thread">BRIEF</p>
                ) : decision ? (
                  <p className="eyebrow text-gate-ink">DECISION</p>
                ) : null}
                <p className="font-serif text-[19px] leading-tight">
                  {node.kind === "brief" ? null : (
                    <span className="mr-2 font-mono text-xs text-ink-dim">#{node.number}</span>
                  )}
                  {node.title}
                </p>
                {node.kind === "brief" ? null : (
                  <p className="mt-1">
                    <span className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink-dim ring-1 ring-line">
                      {node.badge}
                    </span>
                  </p>
                )}
                {meta ? <p className="mt-2 font-mono text-xs text-ink-dim">{meta}</p> : null}
                {node.kind !== "brief" && node.notes.length > 0 ? (
                  <ul className="mt-2 grid gap-1.5">
                    {node.notes.map((item) => (
                      <li key={`${item.at}-${item.note}`} className="rounded-lg border-l-2 border-gate bg-gate-bg/60 px-2.5 py-1.5 text-[12.5px] leading-snug">
                        <span className="block font-mono text-[10.5px] tracking-[0.06em] text-gate-ink uppercase">
                          Your note{item.gateTitle ? ` · at ${item.gateTitle}` : ""}
                          {timeLabel(item.at) ? ` · ${timeLabel(item.at)}` : ""}
                        </span>
                        “{item.note}”
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Excerpt
                  body={node.body}
                  empty={node.kind === "brief" ? "No brief yet." : "No output yet."}
                  noun={node.kind === "brief" ? "brief" : "output"}
                />
              </article>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LineageRail({
  steps,
  onClose,
  embedded = false,
}: {
  steps: LineageStep[];
  onClose: () => void;
  embedded?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = [...steps].reverse().find((step) => step.node.kind !== "brief")?.node;

  useEffect(() => {
    if (embedded) return;
    closeRef.current?.focus();
  }, [embedded]);

  useEffect(() => {
    if (embedded) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded, onClose]);

  if (embedded) return <LineageList steps={steps} />;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" role="presentation" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="lineage-title"
        data-lineage-rail
        className="enter flex h-full w-full max-w-md flex-col border-l border-line bg-raised"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="lineage-title" className="font-serif text-[26px] font-normal leading-tight">
                Lineage
              </h2>
              {selected && selected.kind !== "brief" ? (
                <p className="mt-1 text-sm leading-normal text-ink-dim">
                  <span className="font-mono text-xs">#{selected.number}</span> {selected.title}
                </p>
              ) : null}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="px-2 py-1 text-sm text-ink-dim hover:text-ink"
            >
              Close
            </button>
          </div>
          <p className="mt-2 text-sm leading-normal text-ink-dim">
            The brief, then every task this one depends on, then this task. The thread is the path the work took.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <LineageList steps={steps} />
        </div>
      </aside>
    </div>
  );
}
