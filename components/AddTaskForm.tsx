"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentDTO, TaskDTO } from "@/lib/types";

export type NewTaskInput = {
  title: string;
  agentId: string;
  instructions: string;
  dependsOn: string[];
  requiresApproval: boolean;
};

export function AddTaskForm({
  tasks,
  agents,
  onSubmit,
}: {
  tasks: TaskDTO[];
  agents: AgentDTO[];
  onSubmit: (input: NewTaskInput) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [instructions, setInstructions] = useState("");
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) formRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  function reset() {
    setTitle("");
    setAgentId(agents[0]?.id ?? "");
    setInstructions("");
    setDependsOn([]);
    setRequiresApproval(false);
    setError(null);
  }

  function close() {
    reset();
    setOpen(false);
  }

  function toggleDepends(id: string) {
    setDependsOn((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const ready = title.trim().length > 0 && instructions.trim().length > 0 && agentId.length > 0;

  if (!open) {
    return (
      <div className="border-t border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={agents.length === 0}
          className="px-3 py-1.5 text-sm text-thread-bright ring-1 ring-thread/60 hover:bg-thread/10 disabled:cursor-not-allowed disabled:text-ink-dim disabled:ring-white/10"
        >
          + Add task
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="max-h-[min(32rem,55vh)] overflow-y-auto border-t border-white/10 px-4 py-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready || saving) return;
        setSaving(true);
        setError(null);
        try {
          const message = await onSubmit({
            title: title.trim(),
            agentId,
            instructions: instructions.trim(),
            dependsOn,
            requiresApproval,
          });
          if (message) {
            setError(message);
            return;
          }
          close();
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3 className="text-sm font-semibold leading-tight">Add a task</h3>
      <p className="mt-1 text-xs leading-normal text-ink-dim">
        This adds one step to the board. It does not call Claude or GPT.
      </p>
      <label className="mt-3 block text-sm">
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          className="mt-1 w-full bg-base px-3 py-2 text-sm ring-1 ring-white/10"
          aria-label="Task title"
        />
      </label>
      <label className="mt-3 block text-sm">
        Agent
        <select
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          className="mt-1 w-full bg-base px-3 py-2 text-sm ring-1 ring-white/10"
          aria-label="Agent"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm">
        Instructions
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          required
          rows={4}
          className="mt-1 w-full bg-base px-3 py-2 text-sm leading-normal ring-1 ring-white/10"
          aria-label="Task instructions"
        />
      </label>
      <fieldset className="mt-3">
        <legend className="text-sm">Depends on</legend>
        {tasks.length === 0 ? (
          <p className="mt-1 text-xs leading-normal text-ink-dim">No earlier tasks on this project.</p>
        ) : (
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
            {tasks.map((task, index) => (
              <li key={task.id}>
                <label className="flex items-start gap-2 text-sm leading-normal">
                  <input
                    type="checkbox"
                    checked={dependsOn.includes(task.id)}
                    onChange={() => toggleDepends(task.id)}
                    className="mt-1 accent-thread"
                  />
                  <span>
                    <span className="mr-1 font-mono text-xs text-ink-dim">#{index + 1}</span>
                    {task.title}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span id="requires-approval-label" className="text-sm">
          Requires approval
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={requiresApproval}
          aria-labelledby="requires-approval-label"
          onClick={() => setRequiresApproval((current) => !current)}
          className={`relative h-5 w-9 shrink-0 ring-1 ring-white/10 ${requiresApproval ? "bg-thread" : "bg-raised"}`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 h-4 w-4 bg-ink transition-transform ${requiresApproval ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </button>
      </div>
      {error ? <p className="mt-3 text-sm leading-normal text-danger">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={close} className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!ready || saving}
          className="bg-thread px-3 py-2 text-sm font-medium text-(--color-base) disabled:opacity-50"
        >
          {saving ? "Adding" : "Add task"}
        </button>
      </div>
    </form>
  );
}
