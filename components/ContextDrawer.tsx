"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ContextDrawer({
  name,
  brief,
  blocking = false,
  onClose,
  onSave,
}: {
  name: string;
  brief: string;
  blocking?: boolean;
  onClose: () => void;
  onSave: (name: string, brief: string) => Promise<void>;
}) {
  const titleId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [draftName, setDraftName] = useState(name);
  const [draft, setDraft] = useState(brief);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged = draftName.trim() === name.trim() && draft.trim() === brief.trim();
  const blankMessage = "Write what this project is before continuing.";

  function rejectDismiss() {
    setError(blankMessage);
  }

  async function save() {
    if (draftName.trim().length === 0 || draft.trim().length === 0) {
      setError(blocking ? blankMessage : "Name and brief are required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(draftName.trim(), draft.trim());
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!blocking) return;
    const root = panelRef.current;
    root?.querySelector<HTMLElement>("textarea")?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setError(blankMessage);
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")].filter(
        (node) => !node.hasAttribute("disabled"),
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [blocking]);

  const body = (
    <>
      <div className="border-b border-white/10 px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold leading-tight">
          Shared context
        </h2>
        <p className="mt-1 text-sm leading-normal text-ink-dim">
          {blocking
            ? "Describe this project. Scout and Maker use it when you press Run. Saving does not call Claude or GPT, and nothing runs until you do."
            : "Every agent receives this automatically. This is the thread."}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <label className="block text-sm">
          Project name
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            maxLength={120}
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
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <p className="text-xs leading-normal text-ink-dim">
          Saving updates the name and brief for later runs. It does not call Claude or GPT.
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
        {blocking ? null : (
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
            Close
          </button>
        )}
        <button
          type="button"
          disabled={saving || (!blocking && (unchanged || draft.trim().length === 0 || draftName.trim().length === 0))}
          onClick={() => void save()}
          className="bg-thread px-3 py-2 text-sm font-medium text-(--color-base) disabled:opacity-50"
        >
          {saving ? "Saving" : "Save"}
        </button>
      </div>
    </>
  );

  if (blocking) {
    return (
      <div className="fixed inset-0 z-50">
        <div
          className="account-scrim absolute inset-0 bg-base/60 opacity-100 backdrop-blur-md"
          onMouseDown={rejectDismiss}
        />
        <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
          <aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={error ? errorId : undefined}
            className="enter flex max-h-[min(40rem,calc(100%-2rem))] w-full max-w-lg flex-col bg-raised ring-1 ring-white/10"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {body}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-base/70" role="presentation" onMouseDown={onClose}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        className="flex h-full w-full max-w-md flex-col bg-raised ring-1 ring-white/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {body}
      </aside>
    </div>
  );
}
