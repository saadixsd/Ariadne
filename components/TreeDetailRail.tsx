"use client";

import { useEffect, useRef, useState } from "react";
import { LineageRail } from "@/components/LineageRail";
import { OutputView } from "@/components/OutputView";
import { buildLineage, handoffConnector } from "@/lib/lineage";
import type { TreeNode } from "@/lib/live-tree";
import { hideModelIds } from "@/lib/model-label";
import { parseHandoffMessage } from "@/lib/handoff-preview";
import { nextTask, taskNumber } from "@/lib/task-rules";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

function when(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status: string | undefined) {
  if (status === "running") return "Running";
  if (status === "done") return "Done";
  if (status === "failed") return "Failed";
  if (status === "awaiting_approval") return "Waiting on you";
  if (status === "cancelled" || status === "canceled" || status === "pruned" || status === "removed") return "Pruned";
  if (status === "pending") return "Pending";
  return status ?? "Pending";
}

function HandoffLists({ task, project }: { task: TaskDTO; project: ProjectDTO }) {
  const agents = new Map(project.agents.map((agent) => [agent.id, agent.name]));
  const name = (item: TaskDTO) => agents.get(item.agentId) ?? "Unassigned";
  const incomingTasks = task.dependsOn.flatMap((id) => {
    const source = project.tasks.find((item) => item.id === id);
    return source ? [source] : [];
  });
  const outgoingTasks = project.tasks.filter((item) => item.dependsOn.includes(task.id));
  const recordedIn = project.events.filter((event) => event.type === "handoff" && event.taskId === task.id);
  const recordedOut = project.events.filter((event) => {
    if (event.type !== "handoff") return false;
    return parseHandoffMessage(event.message)?.title === task.title;
  });

  return (
    <div className="mt-4 grid gap-3">
      <div>
        <h3 className="text-xs font-semibold tracking-[0.14em] text-[#0e5c36]">HANDOFFS IN</h3>
        <ul className="mt-1 space-y-1 text-sm leading-normal text-[#5c6f61]">
          {recordedIn.length > 0
            ? recordedIn.map((event) => <li key={event.id}>{hideModelIds(event.message)}</li>)
            : incomingTasks.length > 0
              ? incomingTasks.map((source) => <li key={source.id}>{handoffConnector(name(source), name(task))}</li>)
              : <li>No handoff in yet.</li>}
        </ul>
      </div>
      <div>
        <h3 className="text-xs font-semibold tracking-[0.14em] text-[#0e5c36]">HANDOFFS OUT</h3>
        <ul className="mt-1 space-y-1 text-sm leading-normal text-[#5c6f61]">
          {recordedOut.length > 0
            ? recordedOut.map((event) => <li key={event.id}>{hideModelIds(event.message)}</li>)
            : outgoingTasks.length > 0
              ? outgoingTasks.map((target) => <li key={target.id}>{handoffConnector(name(task), name(target))}</li>)
              : <li>No handoff out yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function GateDecision({
  task,
  tasks,
  onDecide,
}: {
  task: TaskDTO;
  tasks: TaskDTO[];
  onDecide: (approved: boolean, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "changes" | null>(null);
  const upcoming = nextTask(task.id, tasks);
  const number = taskNumber(upcoming?.id ?? "", tasks);

  async function submit(approved: boolean) {
    setBusy(approved ? "approve" : "changes");
    try {
      await onDecide(approved, note);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 border-t border-[#f59e0b]/40 pt-4">
      <p className="text-xs font-semibold tracking-[0.16em] text-[#b45309]">APPROVAL GATE</p>
      <p className="mt-2 text-sm leading-normal text-[#b45309]">
        {upcoming ? `Approving unlocks task ${number}: ${upcoming.title}` : "Approving marks this task done."}
      </p>
      <p className="mt-1 text-sm leading-normal text-[#5c6f61]">
        Nothing continues until you choose. Approve and Request changes are the only actions here.
      </p>
      <div className="mt-3">
        {task.output ? (
          <OutputView output={task.output} />
        ) : (
          <p className="text-sm text-[#5c6f61]">No output packaged. Check the lineage before deciding.</p>
        )}
      </div>
      <label className="mt-3 block text-sm">
        Request changes
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="What should change?"
          className="mt-1 w-full rounded-md bg-[#f6faf6] px-3 py-2 text-sm leading-normal ring-1 ring-[#dfe9e1]"
        />
      </label>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy !== null || note.trim().length === 0}
          onClick={() => void submit(false)}
          className="rounded-md px-3 py-2 text-sm font-medium ring-1 ring-[#dfe9e1] disabled:opacity-50"
        >
          {busy === "changes" ? "Sending" : "Request changes"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void submit(true)}
          className="rounded-md bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-[#101812] hover:bg-[#fbbf24] disabled:opacity-50"
        >
          {busy === "approve" ? "Approving" : "Approve"}
        </button>
      </div>
    </div>
  );
}

export function TreeDetailRail({
  project,
  node,
  authorName,
  pendingId,
  onClose,
  onRun,
  onRerun,
  onDecide,
}: {
  project: ProjectDTO;
  node: TreeNode;
  authorName: string;
  pendingId: string | null;
  onClose: () => void;
  onRun: (taskId: string) => void;
  onRerun: (taskId: string) => void;
  onDecide: (approved: boolean, note: string) => Promise<void>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const taskId = node.kind === "output" ? node.sourceTaskId : node.taskId;
  const task = project.tasks.find((item) => item.id === taskId) ?? null;
  const lineage = task ? buildLineage(project, task.id) : null;
  const gate = node.kind === "gate" && task?.status === "awaiting_approval";
  const pruned = node.kind === "pruned" || node.status === "pruned";
  const busy = task !== null && pendingId === task.id;

  useEffect(() => {
    closeRef.current?.focus();
  }, [node.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const eyebrow =
    node.kind === "root"
      ? "BRIEF"
      : node.kind === "output"
        ? "ARTIFACT"
        : gate
          ? "WAITING ON YOU"
          : pruned
            ? "PRUNED"
            : "STEP";

  return (
    <aside
      role="dialog"
      aria-labelledby="tree-detail-title"
      data-tree-rail
      className="fixed top-0 right-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-[#dfe9e1] bg-white shadow-[-12px_0_40px_rgba(16,24,18,0.08)]"
    >
      <div className={`border-b px-5 py-4 ${gate ? "border-[#f59e0b]/40 bg-[#fffbeb]" : "border-[#dfe9e1]"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-xs font-semibold tracking-[0.16em] ${gate ? "text-[#b45309]" : pruned ? "text-[#8a988e]" : "text-[#0e5c36]"}`}>
              {eyebrow}
            </p>
            <h2 id="tree-detail-title" className="mt-1 text-lg font-semibold leading-tight text-[#101812]">
              {node.kind === "root" ? project.name : node.label}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="px-2 py-1 text-sm text-[#5c6f61] hover:text-[#101812]"
          >
            Close
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {node.kind === "root" ? (
          <div>
            <p className="text-sm leading-normal text-[#5c6f61]">
              {authorName ? `Written by ${authorName}` : "Written by you"}
              {when(project.createdAt) ? ` · ${when(project.createdAt)}` : ""}
            </p>
            {project.brief.trim() ? (
              <div className="mt-3">
                <OutputView output={project.brief} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#5c6f61]">No brief yet.</p>
            )}
          </div>
        ) : null}

        {node.kind === "output" ? (
          <div>
            {task?.output ? (
              <>
                <p className="text-sm leading-normal text-[#5c6f61]">From {task.title}.</p>
                <div className="mt-3">
                  <OutputView output={task.output} />
                </div>
              </>
            ) : (
              <p className="text-sm leading-normal text-[#5c6f61]">No output yet.</p>
            )}
          </div>
        ) : null}

        {task && node.kind !== "root" && node.kind !== "output" ? (
          <div>
            <p className="text-sm leading-normal text-[#5c6f61]">
              {[statusLabel(task.status), [node.role, node.model].filter(Boolean).join(" · ")].filter(Boolean).join(" · ")}
            </p>
            {when(task.startedAt) ? (
              <p className="mt-1 font-mono text-xs text-[#5c6f61]">Started {when(task.startedAt)}</p>
            ) : null}
            {when(task.completedAt) ? (
              <p className="mt-1 font-mono text-xs text-[#5c6f61]">Finished {when(task.completedAt)}</p>
            ) : null}
            {pruned ? (
              <p className="mt-3 text-sm leading-normal text-[#5c6f61]">{node.note ?? "Pruned."}</p>
            ) : null}
            {gate ? (
              <GateDecision key={task.id} task={task} tasks={project.tasks} onDecide={onDecide} />
            ) : (
              <div className="mt-3">
                {task.output ? <OutputView output={task.output} /> : <p className="text-sm text-[#5c6f61]">No output yet.</p>}
              </div>
            )}
            <HandoffLists task={task} project={project} />
            {lineage ? (
              <div className="mt-5 border-t border-[#dfe9e1] pt-4">
                <h3 className="text-xs font-semibold tracking-[0.14em] text-[#0e5c36]">LINEAGE</h3>
                <div className="mt-3">
                  <LineageRail steps={lineage} onClose={onClose} embedded />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {task && node.kind !== "output" && node.kind !== "root" && !gate && !pruned ? (
        <div className="flex justify-end gap-2 border-t border-[#dfe9e1] px-5 py-3">
          {task.status === "done" ? (
            <button
              type="button"
              onClick={() => onRerun(task.id)}
              className="rounded-md px-3 py-2 text-sm font-medium text-[#0e5c36] ring-1 ring-[#0e5c36]/35 hover:bg-[#eef6f0]"
            >
              Re-run
            </button>
          ) : task.status !== "running" && task.status !== "awaiting_approval" ? (
            <button
              type="button"
              disabled={!node.runnable || busy}
              onClick={() => onRun(task.id)}
              className="rounded-md bg-[#0e5c36] px-3 py-2 text-sm font-medium text-white hover:bg-[#0b4a2b] disabled:cursor-not-allowed disabled:bg-[#e6ebe7] disabled:text-[#9aa89e]"
            >
              {busy ? "Running" : task.status === "failed" ? "Retry" : "Run"}
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
