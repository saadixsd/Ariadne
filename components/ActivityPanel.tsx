"use client";

import { useState } from "react";
import MarkdownBody from "@/components/MarkdownBody";
import type { ProjectDTO, TaskDTO } from "@/lib/types";
import type { ThreadSteps } from "@/lib/workspace";

const STATUS: Record<string, string> = {
  pending: "not run",
  running: "running…",
  done: "done",
  failed: "failed",
  awaiting_approval: "waiting on you",
};

export function ActivityPanel({ project, steps }: { project: ProjectDTO; steps: ThreadSteps }) {
  const [open, setOpen] = useState(false);
  const agent = new Map(project.agents.map((a) => [a.id, a]));
  const rows: { label: string; who: string; task?: TaskDTO }[] = [
    { label: "Draft", who: "Odysseus (Claude)", task: steps.draft },
    { label: "Challenge", who: "Daedalus (GPT)", task: steps.challenge },
    { label: "Judge", who: "You", task: steps.judge },
    { label: "Tie Off", who: "Odysseus (Claude)", task: steps.tieOff },
  ];
  return (
    <section className="border-t border-line bg-panel">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 overflow-x-auto px-4 py-2 text-left text-xs whitespace-nowrap"
      >
        <span className="font-semibold tracking-[0.14em] text-ink-dim uppercase">{open ? "▾" : "▸"} Agent activity</span>
        {rows.map((r) => (
          <span key={r.label} className={r.task?.status === "done" ? "text-ok" : r.task?.status === "failed" ? "text-danger" : "text-ink-dim"}>
            {r.label}: {r.task ? STATUS[r.task.status] ?? r.task.status : "—"}
          </span>
        ))}
      </button>
      {open ? (
        <div className="grid max-h-[50vh] gap-3 overflow-y-auto px-4 pb-4 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="bg-raised p-3 text-sm ring-1 ring-line">
              <div className="flex justify-between gap-2">
                <b className="font-medium">{r.label}</b>
                <span className="text-xs text-ink-dim">
                  {r.who}
                  {r.task?.model && r.task.model !== "human" ? ` · ${r.task.model}` : ""}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-dim">
                {r.task ? STATUS[r.task.status] ?? r.task.status : "not in this thread"}
                {r.task?.completedAt ? ` · ${new Date(r.task.completedAt).toLocaleString()}` : ""}
              </p>
              {r.task?.output && r.task.agentId && agent.get(r.task.agentId)?.provider !== "human" ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-thread">Show output</summary>
                  <div className="mt-2 max-h-80 overflow-y-auto text-sm">
                    <MarkdownBody text={r.task.output} />
                  </div>
                </details>
              ) : null}
            </div>
          ))}
          <div className="md:col-span-2">
            <h3 className="text-xs font-semibold tracking-[0.14em] text-ink-dim uppercase">Handoffs and notes</h3>
            <ul className="mt-1 space-y-1 text-xs text-ink-dim">
              {project.events.slice(0, 20).map((e) => (
                <li key={e.id}>
                  <time className="font-mono">{new Date(e.createdAt).toLocaleTimeString()}</time> {e.message}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-faint">
              To steer one step with a note and re-run it, use Intervene in the{" "}
              <a className="text-thread" href={`/dashboard?project=${project.id}`}>
                Board
              </a>
              .
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
