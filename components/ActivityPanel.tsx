"use client";

import { LocalTime } from "@/components/LocalTime";
import MarkdownBody from "@/components/MarkdownBody";
import type { ProjectDTO, TaskDTO } from "@/lib/types";
import { stepStatus, type StepStatus, type ThreadSteps } from "@/lib/workspace";

const LABEL: Record<StepStatus, string> = {
  pending: "Pending",
  running: "In progress",
  done: "Completed",
  failed: "Failed",
  waiting: "Waiting on you",
};

export function StatusIcon({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, [string, string]> = {
    done: ["✓", "bg-ok text-raised"],
    running: ["◐", "bg-thread-soft text-thread"],
    waiting: ["●", "bg-gate-bg text-gate-ink"],
    failed: ["✕", "bg-danger text-raised"],
    pending: ["○", "bg-panel text-ink-faint ring-1 ring-line"],
  };
  const [glyph, cls] = map[status];
  return (
    <span aria-label={LABEL[status]} className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${cls}`}>
      {glyph}
    </span>
  );
}


type Row = { n: number; who: string; step: string; what: string; status: StepStatus; at: string | null };

export function activityRows(steps: ThreadSteps, approvedAt: string | null): Row[] {
  const row = (n: number, who: string, step: string, what: string, task?: TaskDTO): Row => ({
    n, who, step, what, status: stepStatus(task), at: task?.completedAt ?? null,
  });
  return [
    row(1, "Odysseus", "Draft", "Drafts from your brief and sources.", steps.draft),
    row(2, "Daedalus", "Challenge", "Fact-checks each claim: supported, unsupported or wrong, with evidence.", steps.challenge),
    row(3, "You", "Judge", "Accept, reject or edit each flagged claim, then tie off or revise.", steps.judge),
    row(4, "Odysseus", "Revise", "Writes the tied-off answer from the draft you judged.", steps.tieOff),
    { n: 5, who: "You", step: "Approve", what: "Approve the deliverable.", status: approvedAt ? "done" : "pending", at: approvedAt },
  ];
}

/** Centre "Activity" tab: each step's output on demand, and the event log. */
export function ActivityTab({ project, steps }: { project: ProjectDTO; steps: ThreadSteps }) {
  const rows: { label: string; who: string; task?: TaskDTO }[] = [
    { label: "Draft", who: "Odysseus", task: steps.draft },
    { label: "Challenge", who: "Daedalus", task: steps.challenge },
    { label: "Judge", who: "You", task: steps.judge },
    { label: "Tie Off", who: "Odysseus", task: steps.tieOff },
  ];
  const provider = new Map(project.agents.map((a) => [a.id, a.provider]));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} className="rounded-2xl bg-raised p-4 ring-1 ring-line">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <StatusIcon status={stepStatus(r.task)} /> {r.label}
            </span>
            <span className="text-xs text-ink-dim">
              {r.who}
              
              {r.task?.completedAt ? <> · <LocalTime iso={r.task.completedAt} /></> : null}
            </span>
          </div>
          {r.task?.output && provider.get(r.task.agentId) !== "human" ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-thread">Show output</summary>
              <div className="markdown mt-2 max-h-96 overflow-y-auto text-sm">
                <MarkdownBody text={r.task.output} />
              </div>
            </details>
          ) : null}
        </div>
      ))}
      <div className="rounded-2xl bg-raised p-4 ring-1 ring-line">
        <h3 className="text-[13px] font-semibold">Handoffs and notes</h3>
        {project.events.length === 0 ? <p className="mt-2 text-sm text-ink-dim">Nothing yet.</p> : null}
        <ul className="mt-2 space-y-1.5 text-xs text-ink-dim">
          {project.events.slice(0, 30).map((e) => (
            <li key={e.id}>
              <LocalTime className="font-mono text-ink-faint" iso={e.createdAt} format="time" /> {e.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
