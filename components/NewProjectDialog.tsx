"use client";

import { useEffect, useId, useRef, useState } from "react";

export function NewProjectDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, brief: string) => Promise<string | null>;
}) {
  const titleId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const root = panelRef.current;
    root?.querySelector<HTMLElement>("input")?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>("button, input, textarea")].filter(
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
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="account-scrim absolute inset-0 bg-canvas/60 opacity-100 backdrop-blur-md" onMouseDown={onClose} />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <form
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={error ? errorId : undefined}
          className="enter w-full max-w-lg bg-raised rounded-2xl p-5 ring-1 ring-line"
          onMouseDown={(event) => event.stopPropagation()}
          onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            const nextName = name.trim();
            const nextBrief = brief.trim();
            if (!nextName || !nextBrief) {
              setError("Name and a brief are required.");
              return;
            }
            setSaving(true);
            setError(null);
            try {
              const message = await onCreate(nextName, nextBrief);
              if (message) setError(message);
              else onClose();
            } finally {
              setSaving(false);
            }
          }}
        >
          <h2 id={titleId} className="font-serif text-[26px] font-normal leading-tight">
            New project
          </h2>
          <p className="mt-2 text-sm leading-normal text-ink-dim">
            This project is yours. Scout and Maker use the brief when you press Run. Creating it does not call Claude
            or GPT.
          </p>
          <label className="mt-4 block text-sm">
            Project name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              className="mt-1 w-full bg-canvas px-3 py-2 text-sm ring-1 ring-line"
              aria-label="Project name"
            />
          </label>
          <label className="mt-3 block text-sm">
            Brief
            <textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              className="mt-1 min-h-28 w-full bg-canvas px-3 py-2 text-sm leading-normal ring-1 ring-line"
              aria-label="Project brief"
            />
          </label>
          {error ? (
            <p id={errorId} role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-thread px-3 py-2 text-sm font-medium text-raised disabled:opacity-50"
            >
              {saving ? "Creating" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
