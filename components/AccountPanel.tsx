"use client";

import { useEffect, useId, useRef, useState } from "react";

const EXIT_MS = 180;

export function AccountPanel({
  open,
  onClose,
  initial,
  name,
  email,
  firstName,
  lastName,
  projectId,
  projectName,
  brief,
  onSaveBrief,
}: {
  open: boolean;
  onClose: () => void;
  initial: string;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  projectId: string;
  projectName: string;
  brief: string;
  onSaveBrief: (name: string, brief: string) => Promise<string | null>;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const [draftBrief, setDraftBrief] = useState(brief);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefSaved, setBriefSaved] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);

  useEffect(() => {
    setBriefSaved(false);
    setBriefError(null);
  }, [projectId]);

  useEffect(() => {
    setDraftName(projectName);
    setDraftBrief(brief);
  }, [projectName, brief]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        setVisible(true);
        return;
      }
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }

    setVisible(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setMounted(false), reduce ? 0 : EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    const root = panelRef.current;
    const previously = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previously?.isConnected) previously.focus();
    };
  }, [visible, onClose]);

  async function submitBrief() {
    const nextName = draftName.trim();
    const nextBrief = draftBrief.trim();
    if (!nextName || !nextBrief) {
      setBriefError("Write what this project is before saving.");
      setBriefSaved(false);
      return;
    }
    setSavingBrief(true);
    setBriefError(null);
    try {
      const message = await onSaveBrief(nextName, nextBrief);
      if (message) {
        setBriefError(message);
        setBriefSaved(false);
        return;
      }
      setBriefSaved(true);
    } finally {
      setSavingBrief(false);
    }
  }

  if (!mounted) return null;

  const shown = visible ? "opacity-100" : "opacity-0";

  return (
    <div className={`fixed inset-0 z-40 ${visible ? "" : "pointer-events-none"}`}>
      <div
        className={`account-scrim absolute inset-0 bg-canvas/60 backdrop-blur-md ${shown}`}
        onMouseDown={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`account-panel absolute bottom-14 left-4 flex max-h-[min(40rem,calc(100%-5rem))] w-[min(26rem,calc(100vw-2rem))] origin-bottom-left flex-col overflow-y-auto bg-raised ring-1 ring-line ${
          visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-serif text-[26px] font-normal leading-tight">
              Settings
            </h2>
            <p className="mt-1 text-sm leading-normal text-ink-dim">
              Account details and this project&apos;s shared context.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-sm text-ink-dim hover:text-ink"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center bg-canvas text-sm font-semibold text-thread ring-1 ring-thread/40"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-sm text-ink-dim">{email}</p>
            </div>
          </div>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-dim">First name</dt>
              <dd className="truncate">{firstName || "Not set"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-dim">Last name</dt>
              <dd className="truncate">{lastName || "Not set"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-dim">Email</dt>
              <dd className="truncate">{email}</dd>
            </div>
          </dl>
          <form
            className="mt-4 space-y-3 border-t border-line pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitBrief();
            }}
          >
            <h3 className="text-sm font-semibold">Shared context</h3>
            <p className="text-sm leading-normal text-ink-dim">
              Scout and Maker read this when you press Run. Saving does not call Claude or GPT.
            </p>
            <label className="block text-sm">
              Project name
              <input
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setBriefSaved(false);
                }}
                maxLength={120}
                className="mt-1 w-full bg-canvas px-3 py-2 text-sm ring-1 ring-line"
                aria-label="Project name"
              />
            </label>
            <label className="block text-sm">
              Brief
              <textarea
                value={draftBrief}
                onChange={(event) => {
                  setDraftBrief(event.target.value);
                  setBriefSaved(false);
                }}
                className="mt-1 min-h-28 w-full bg-canvas px-3 py-2 text-sm leading-normal ring-1 ring-line"
                aria-label="Project brief"
              />
            </label>
            {briefError ? (
              <p role="alert" className="text-sm text-danger">
                {briefError}
              </p>
            ) : null}
            {briefSaved ? (
              <p role="status" className="text-sm text-ok">
                Saved. Tasks stay pending until you press Run.
              </p>
            ) : null}
            <button
              type="submit"
              disabled={savingBrief}
              className="bg-thread px-3 py-2 text-sm font-medium text-raised disabled:opacity-50"
            >
              {savingBrief ? "Saving" : "Save shared context"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
