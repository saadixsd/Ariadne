"use client";

import { useEffect, useRef } from "react";
import type { AgentDTO, TaskDTO } from "@/lib/types";
import { displayModel } from "@/lib/model-label";
import { providerLabel, taskNumber } from "@/lib/task-rules";

function statusClass(status: string) {
  if (status === "working") return "bg-working pulse-status";
  if (status === "done") return "bg-ink-dim";
  return "bg-ok";
}

function statusLabel(status: string) {
  if (status === "working") return "working";
  if (status === "done") return "done";
  return "idle";
}

export function AgentColumn({
  agents,
  tasks,
  expandedId,
  onToggle,
}: {
  agents: AgentDTO[];
  tasks: TaskDTO[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const openCard = useRef<HTMLLIElement>(null);

  useEffect(() => {
    openCard.current?.scrollIntoView({ block: "nearest" });
  }, [expandedId]);

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
    <section ref={panel} className="flex flex-col bg-panel ring-1 ring-line xl:h-full xl:min-h-0 xl:overflow-hidden xl:ring-y-0 xl:ring-l-0">
      <h2 className="px-4 pt-4 text-xs font-semibold tracking-[0.18em] text-ink-dim">AGENTS</h2>
      <ul className="space-y-2 px-3 py-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
        {agents.map((agent, index) => {
          const assigned = tasks.filter((task) => task.agentId === agent.id);
          const open = expandedId === agent.id;
          const modelLabel = displayModel(agent.model, agent.provider);
          return (
            <li
              key={agent.id}
              ref={open ? openCard : undefined}
              className="enter"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className={`bg-raised ring-1 ${open ? "ring-thread/70" : "ring-line"}`}>
                <button
                  type="button"
                  onClick={() => onToggle(agent.id)}
                  className="w-full px-3 py-3 text-left hover:bg-base"
                  aria-expanded={open}
                  aria-label={`${agent.name}, ${providerLabel(agent.provider)}, ${statusLabel(agent.status)}`}
                >
                  <span className="flex items-start gap-3">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusClass(agent.status)}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold leading-tight">{agent.name}</span>
                        <span className="bg-base px-1.5 py-0.5 font-mono text-[11px] text-thread-bright ring-1 ring-line">
                          {providerLabel(agent.provider)}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm leading-normal text-ink-dim">
                        {agent.provider === "human" ? "Nothing ships without your approval." : agent.role}
                      </span>
                    </span>
                  </span>
                </button>
                {open ? (
                  <div className="border-t border-line px-3 pt-3 pb-3" aria-label={`${agent.name} assignments`}>
                    {modelLabel ? (
                      <p className="font-mono text-xs text-ink-dim">{modelLabel}</p>
                    ) : null}
                    <p className={`${modelLabel ? "mt-3" : ""} text-xs font-semibold tracking-[0.14em] text-ink-dim`}>
                      ASSIGNED
                    </p>
                    {assigned.length === 0 ? (
                      <p className="mt-1 text-sm text-ink-dim">No tasks</p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-sm leading-normal">
                        {assigned.map((task) => (
                          <li key={task.id}>
                            {taskNumber(task.id, tasks)}. {task.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
