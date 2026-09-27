"use client";

import { useState } from "react";

export function ContextDrawer({
  name,
  brief,
  onClose,
  onSave,
}: {
  name: string;
  brief: string;
  onClose: () => void;
  onSave: (name: string, brief: string) => Promise<void>;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draft, setDraft] = useState(brief);
  const [saving, setSaving] = useState(false);
  const unchanged = draftName.trim() === name.trim() && draft.trim() === brief.trim();

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-base/70" role="presentation" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-title"
        className="flex h-full w-full max-w-md flex-col bg-raised ring-1 ring-white/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="context-title" className="text-lg font-semibold leading-tight">
            Shared context
          </h2>
          <p className="mt-1 text-sm leading-normal text-ink-dim">
            Every agent receives this automatically. This is the thread.
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-5 py-4">
          <label className="block text-sm">
            Project name
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="mt-1 w-full bg-base px-3 py-2 text-sm ring-1 ring-white/10"
              aria-label="Project name"
            />
          </label>
          <label className="flex min-h-0 flex-1 flex-col text-sm">
            Brief
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-1 min-h-64 w-full flex-1 bg-base px-3 py-2 text-sm leading-normal ring-1 ring-white/10"
              aria-label="Project brief"
            />
          </label>
          <p className="text-xs leading-normal text-ink-dim">
            Saving updates the name and brief for later runs. It does not call Claude or GPT.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
            Close
          </button>
          <button
            type="button"
            disabled={saving || unchanged || draft.trim().length === 0 || draftName.trim().length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draftName.trim(), draft.trim());
              } finally {
                setSaving(false);
              }
            }}
            className="bg-thread px-3 py-2 text-sm font-medium text-(--color-base) disabled:opacity-50"
          >
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </aside>
    </div>
  );
}
