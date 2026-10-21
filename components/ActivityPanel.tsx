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
    row(1, "Writer", "Draft", "Answers your question, with a source for each claim.", steps.draft),
    row(2, "Fact-checker", "Fact-check", "Checks each key claim against its source: supported, not supported or wrong.", steps.challenge),
    row(3, "You", "Your review", "Keep, fix or remove each flagged claim.", steps.judge),
    row(4, "Writer", "Final answer", "Rewrites the answer from your decisions; it is fact-checked again.", steps.tieOff),
    { n: 5, who: "You", step: "Approve", what: "Approve the final answer.", status: approvedAt ? "done" : "pending", at: approvedAt },
  ];
}

/** Centre "Activity" tab: each step's output on demand, and the event log. */
export function ActivityTab({ project, steps }: { project: ProjectDTO; steps: ThreadSteps }) {
  const rows: { label: string; who: string; task?: TaskDTO }[] = [
    { label: "Draft", who: "Writer", task: steps.draft },
    { label: "Fact-check", who: "Fact-checker", task: steps.challenge },
    { label: "Your review", who: "You", task: steps.judge },
    { label: "Final answer", who: "Writer", task: steps.tieOff },
    ...(steps.finalCheck ? [{ label: "Final check", who: "Fact-checker", task: steps.finalCheck }] : []),
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
        <h3 className="text-[13px] font-semibold">Log</h3>
        {project.events.length === 0 ? <p className="mt-2 text-sm text-ink-dim">Nothing yet.</p> : null}
        <ul className="mt-2 space-y-1.5 text-xs text-ink-dim">
          {project.events.slice(0, 30).map((e) => (
            <li key={e.id}>
              <LocalTime className="font-mono text-ink-faint" iso={e.createdAt} format="time" /> {plainNames(e.message)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Event messages were written with the agent names; show the plain roles instead (U1). */
export function plainNames(message: string): string {
  return message
    .replace(/\bOdysseus\b/g, "The writer")
    .replace(/\bDaedalus\b/g, "The fact-checker")
    .replace(/Waiting on YOU to approve/g, "Waiting for you:")
    .replace(/\bTie Off\b/g, "Final answer")
    .replace(/Write the tied-off answer/g, "Write the final answer")
    .replace(/Judge the flagged claims/g, "Your review of the flagged claims");
}
