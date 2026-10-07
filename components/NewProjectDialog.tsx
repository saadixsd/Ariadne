"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MAX_BRIEF_CHARS, MAX_PROJECT_NAME_CHARS } from "@/lib/limits";

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
      <div className="modal-safe modal-flush absolute inset-0 flex items-end justify-center sm:items-center">
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
          <span className="block h-0.5 w-8 bg-thread" aria-hidden />
          <p className="eyebrow mt-4">New project</p>
          <h2 id={titleId} className="mt-1 font-serif text-[30px] font-normal leading-tight tracking-[-0.01em]">
            What are you making next?
          </h2>
          <p className="mt-2 text-sm leading-normal text-ink-dim">
            It gets its own brief and its own thread, with Odysseus and Daedalus ready. Your other projects stay as they
            are. Creating it doesn&apos;t call Claude or GPT and doesn&apos;t use a run.
          </p>
          <label className="mt-5 block">
            <span className="text-[13px] text-ink-dim">Project name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_PROJECT_NAME_CHARS}
              placeholder="Name"
              className="mt-1.5 w-full rounded-xl bg-canvas px-3.5 py-2.5 text-[15px] ring-1 ring-line placeholder:text-ink-dim/50"
              aria-label="Project name"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-[13px] text-ink-dim">What are you trying to figure out?</span>
            <textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              maxLength={MAX_BRIEF_CHARS}
              placeholder="e.g. Research the 10 strongest pre-seed AI investors in Montreal and explain why each is a fit."
              className="mt-1.5 min-h-28 w-full resize-none rounded-xl bg-canvas px-3.5 py-2.5 text-[15px] leading-normal ring-1 ring-line placeholder:text-ink-dim/50"
              aria-label="Project brief"
            />
            <span className="mt-1.5 block text-[12.5px] leading-normal text-ink-faint">
              Say what you need to know or produce, who it&apos;s for, and what a good answer looks like. Odysseus
              drafts from it, Daedalus challenges the draft, you judge.
            </span>
          </label>
          {error ? (
            <p id={errorId} role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rt-btn rt-btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rt-btn rt-btn-thread">
              {saving ? "Starting…" : "Start the project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
