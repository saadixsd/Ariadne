"use client";

import { useState } from "react";
import { OutputView } from "@/components/OutputView";
import { nextTask, taskNumber } from "@/lib/task-rules";
import type { TaskDTO } from "@/lib/types";

export function ApprovalModal({
  task,
  tasks,
  onClose,
  onDecide,
}: {
  task: TaskDTO;
  tasks: TaskDTO[];
  onClose: () => void;
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col border-t-2 border-gate bg-raised rounded-2xl ring-1 ring-line"
      >
        <div className="px-5 py-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-gate-ink">APPROVAL GATE</p>
          <h2 id="approval-title" className="mt-1 font-serif text-[30px] font-normal leading-tight">
            {task.title}
          </h2>
          <p className="mt-2 text-sm leading-normal text-gate-ink">
            {upcoming
              ? `Approving unlocks task ${number}: ${upcoming.title}`
              : "Approving marks this task done."}
          </p>
          <p className="mt-1 text-sm leading-normal text-ink-dim">
            Nothing continues until you choose. Approve and Request changes are the only actions here.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-y border-line px-5 py-4">
          {task.output ? (
            <OutputView output={task.output} />
          ) : (
            <p className="text-sm text-ink-dim">No output packaged. Close this and check the task before deciding.</p>
          )}
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-sm">
            Request changes
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="What should change?"
              className="mt-1 w-full bg-canvas px-3 py-2 text-sm leading-normal ring-1 ring-line"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
              Close
            </button>
            <button
              type="button"
              disabled={busy !== null || note.trim().length === 0}
              onClick={() => void submit(false)}
              className="px-3 py-2 text-sm font-medium ring-1 ring-line disabled:opacity-50"
            >
              {busy === "changes" ? "Sending" : "Request changes"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void submit(true)}
              className="bg-gate px-4 py-2 text-sm font-semibold text-ink hover:bg-gate-bright disabled:opacity-50"
            >
              {busy === "approve" ? "Approving" : "Approve"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
