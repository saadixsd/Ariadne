"use client";

import { useEffect, useRef, useState } from "react";
import { useClocks } from "@/components/use-now";
import { Monogram } from "@/components/ThreadBits";
import { providerLabel, taskNumber } from "@/lib/task-rules";
import { delphicLine } from "@/lib/philosophy";
import { agentTone, ledgerEntries, threadState } from "@/lib/thread";
import type { AgentDTO, ProjectDTO } from "@/lib/types";

function roleHead(agent: AgentDTO) {
  return agent.role.split(/[.;]/)[0]?.trim() ?? "";
}

function presence(agent: AgentDTO, project: ProjectDTO) {
  const mine = project.tasks.filter((task) => task.agentId === agent.id);
  const states = mine.map((task) => threadState(task, project.tasks));
  const spun = states.filter((state) => state === "spun").length;
  const knots = states.filter((state) => state === "knot").length;
  const spinning = mine.find((task) => task.status === "running");
  const next = states.filter((state) => state === "ready" || state === "unspun" || state === "frayed").length;
  if (agent.provider === "human") {
    const status = knots > 0 ? "wait" : "idle";
    const line = knots > 0 ? `${knots} knot${knots > 1 ? "s" : ""} waiting for you` : spun > 0 ? `${spun} knot${spun > 1 ? "s" : ""} tied off` : "Nothing waiting on you";
    return { status, line };
  }
  if (spinning) return { status: "work", line: `Spinning ${spinning.title}` };
  const parts = [spun > 0 ? `${spun} ${spun === 1 ? "step" : "steps"} spun` : null, next > 0 ? `${next} next` : null].filter(Boolean);
  return { status: "idle", line: parts.join(", ") || "No steps yet" };
}

function Key() {
  return (
    <div className="mb-4 grid gap-[5px] rounded-xl border border-line bg-raised/70 px-3 py-2.5 text-xs text-ink-dim">
      <p className="flex items-center gap-2.5">
        <svg viewBox="0 0 34 10" className="h-2.5 w-[34px] flex-none" aria-hidden>
          <path d="M1 5 C9 1 17 9 33 5" stroke="var(--color-thread)" strokeWidth="2.4" fill="none" />
        </svg>
        Spun — work handed on
      </p>
      <p className="flex items-center gap-2.5">
        <svg viewBox="0 0 34 10" className="h-2.5 w-[34px] flex-none" aria-hidden>
          <path d="M1 5 C9 1 17 9 33 5" stroke="var(--color-thread)" strokeWidth="2.4" fill="none" className="thread-spin" />
        </svg>
        Spinning — agent running
      </p>
      <p className="flex items-center gap-2.5">
        <svg viewBox="0 0 34 10" className="h-2.5 w-[34px] flex-none" aria-hidden>
          <path d="M1 5 H14" stroke="var(--color-thread)" strokeWidth="2.4" />
          <circle cx="19" cy="5" r="4" fill="var(--color-gate)" />
        </svg>
        Knot — waiting on you
      </p>
      <p className="flex items-center gap-2.5">
        <svg viewBox="0 0 34 10" className="h-2.5 w-[34px] flex-none" aria-hidden>
          <path d="M1 5 H33" stroke="var(--color-thread-dim)" strokeWidth="1.6" strokeDasharray="2 4" strokeLinecap="round" />
        </svg>
        Unspun — locked
      </p>
    </div>
  );
}

export function AgentColumn({
  project,
  expandedId,
  onToggle,
  onSelectTask,
}: {
  project: ProjectDTO;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onSelectTask: (taskId: string) => void;
}) {
  const { clockShort } = useClocks();
  const { agents, tasks } = project;
  const panel = useRef<HTMLElement>(null);
  const [fullLog, setFullLog] = useState(false);
  const entries = ledgerEntries(project);
  const shown = fullLog ? entries : entries.slice(0, 4);
  const aiNames = agents.filter((agent) => agent.provider !== "human").map((agent) => agent.name);

  useEffect(() => {
    if (!expandedId) return;
    const openId = expandedId;
    function onPointer(event: MouseEvent) {
      if (!panel.current?.contains(event.target as Node)) onToggle(openId);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onToggle(openId);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expandedId, onToggle]);

  return (
    <aside ref={panel} aria-label="Agents and ledger" className="flex min-h-0 flex-col gap-1 pt-1 xl:overflow-y-auto">
      <h2 className="eyebrow pl-3">Hands on the thread</h2>
      <ul className="grid gap-1">
        {agents.map((agent, index) => {
          const tone = agentTone(agent, agents);
          const open = expandedId === agent.id;
          const { status, line } = presence(agent, project);
          const assigned = tasks.filter((task) => task.agentId === agent.id);
          return (
            <li key={agent.id} className="enter" style={{ animationDelay: `${index * 50}ms` }}>
              <button
                type="button"
                onClick={() => onToggle(agent.id)}
                aria-expanded={open}
                aria-label={`${agent.name}, ${providerLabel(agent.provider)}, ${line}`}
                className={`grid w-full grid-cols-[34px_minmax(0,1fr)] gap-2.5 rounded-xl px-3 py-[7px] text-left transition-colors hover:bg-raised/80 ${open ? "bg-raised" : ""}`}
              >
                <span className="relative block h-[34px] w-[34px]">
                  <Monogram tone={tone} size={34} />
                  <span
                    aria-hidden
                    className={`absolute -right-px -bottom-px h-2.5 w-2.5 rounded-full border-2 border-canvas ${
                      status === "wait" ? "bg-gate" : status === "work" ? "pulse-status bg-thread" : "bg-[#8fa67a]"
                    }`}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block font-serif text-xl leading-[1.05]">{agent.name}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">
                    {agent.provider === "human" ? "human · the judge" : providerLabel(agent.provider)}
                  </span>
                  <span className="mt-[3px] block text-[12.5px] leading-snug text-ink-dim">
                    {agent.provider === "human" ? line : [roleHead(agent), line].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
              {open ? (
                <div className="mx-3 mb-1 rounded-xl border border-line bg-raised px-3 py-2.5" aria-label={`${agent.name} assignments`}>
                  <p className="text-[12.5px] leading-snug text-ink-dim">{agent.role}</p>
                  <p className="eyebrow mt-2">Assigned</p>
                  {assigned.length === 0 ? (
                    <p className="mt-1 text-[12.5px] text-ink-dim">No steps</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5 text-[12.5px] leading-snug">
                      {assigned.map((task) => (
                        <li key={task.id}>
                          <button type="button" onClick={() => onSelectTask(task.id)} className="text-left hover:text-thread">
                            {taskNumber(task.id, tasks)}. {task.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <section aria-label="Ledger" className="mt-2 border-t border-dashed border-line-strong px-3 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Ledger</h2>
          {entries.length > 4 ? (
            <button type="button" onClick={() => setFullLog((value) => !value)} aria-expanded={fullLog} className="text-[11.5px] text-ink-faint hover:text-ink">
              {fullLog ? "Recent" : `All ${entries.length}`}
            </button>
          ) : null}
        </div>
        {entries.length === 0 ? (
          <>
            <p className="mt-2 text-xs leading-snug text-ink-dim">Nothing yet. Starts, handoffs and knots are written here after you press Run.</p>
            <p className="mt-3 font-serif text-[14px] text-ink-faint italic">
              {delphicLine(project.id)} <span className="font-sans text-[10.5px] not-italic">— Delphi</span>
            </p>
          </>
        ) : (
          <ol className={`mt-2.5 grid gap-[9px] ${fullLog ? "max-h-72 overflow-y-auto pr-1" : ""}`} role="log" aria-live="polite">
            {shown.map((entry) => (
              <li
                key={entry.id}
                className={`grid grid-cols-[44px_minmax(0,1fr)] text-xs leading-[1.3] ${
                  entry.tone === "knot" ? "font-semibold text-gate-ink" : entry.tone === "fail" ? "text-danger" : "text-ink-dim"
                }`}
              >
                <time dateTime={entry.at} className="font-mono text-[11px] font-normal text-ink-faint tnum">
                  {clockShort(entry.at)}
                </time>
                <span className={fullLog ? "line-clamp-2" : "truncate"} title={entry.text}>
                  {entry.text}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="flex-1" />
      <Key />
      {aiNames.length > 0 ? (
        <p className="-mt-2 mb-4 px-3 text-[11px] leading-snug text-ink-faint">
          {aiNames.join(" and ")} {aiNames.length > 1 ? "are AI agents" : "is an AI agent"} and can make mistakes.
        </p>
      ) : null}
    </aside>
  );
}
