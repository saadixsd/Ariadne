"use client";

import { useState } from "react";

/**
 * Structured feedback: usefulness 1–5 and three short answers, all optional except
 * "something". Used by the opt-in invite after the first approved deliverable and the /feedback page.
 * Sending it never starts a run.
 */
export function FeedbackForm({
  projectId,
  source,
  onDone,
  onCancel,
  cancelLabel = "Not now",
}: {
  projectId: string | null;
  source: "popup" | "page";
  onDone?: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [worked, setWorked] = useState("");
  const [wrong, setWrong] = useState("");
  const [changeFirst, setChangeFirst] = useState("");
  const [allowView, setAllowView] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = rating === null && !worked.trim() && !wrong.trim() && !changeFirst.trim();

  async function submit() {
    if (empty) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "rating", rating, worked, wrong, changeFirst, projectId, allowProjectView: allowView, source }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not save feedback");
        return;
      }
      setDone(true);
      onDone?.();
    } catch {
      setError("Could not reach the server. Check your connection, then try again.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div>
        <p className="font-serif text-[24px] leading-tight">Thank you. Saad reads every answer.</p>
        <p className="mt-2 text-sm text-ink-dim">You can add more any time at Feedback.</p>
      </div>
    );
  }

  const field = "mt-1 w-full bg-canvas px-3 py-2 text-sm leading-normal text-ink ring-1 ring-line";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset>
        <legend className="text-sm">How useful was this for your work?</legend>
        <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Usefulness from 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              onClick={() => setRating(n)}
              className={
                rating === n
                  ? "h-10 w-10 bg-thread text-sm font-medium text-raised"
                  : "h-10 w-10 bg-panel text-sm ring-1 ring-line hover:ring-thread"
              }
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-dim">1 = not useful · 5 = I&apos;d use it again</p>
      </fieldset>
      <label className="mt-4 block text-sm">
        What worked?
        <textarea rows={2} value={worked} onChange={(e) => setWorked(e.target.value)} className={field} maxLength={2000} />
      </label>
      <label className="mt-3 block text-sm">
        What was wrong, missing, or confusing?
        <textarea rows={2} value={wrong} onChange={(e) => setWrong(e.target.value)} className={field} maxLength={2000} />
      </label>
      <label className="mt-3 block text-sm">
        What should we change first?
        <textarea rows={2} value={changeFirst} onChange={(e) => setChangeFirst(e.target.value)} className={field} maxLength={2000} />
      </label>
      {projectId ? (
        <label className="mt-3 flex items-start gap-2 text-sm text-ink-dim">
          <input type="checkbox" checked={allowView} onChange={(e) => setAllowView(e.target.checked)} className="mt-1" />
          <span>Saad may open this project to understand my feedback. Off by default; without it he sees only the steps and issue counts, not your text.</span>
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
            {cancelLabel}
          </button>
        ) : null}
        <button
          type="submit"
          disabled={sending || empty}
          className="bg-thread px-3 py-2 text-sm font-medium text-raised hover:bg-thread-bright disabled:opacity-50"
        >
          {sending ? "Sending" : "Send feedback"}
        </button>
      </div>
      <p className="mt-3 text-xs text-ink-dim">Kept 12 months, then the link to you and your project is removed. Sending this does not run an agent.</p>
    </form>
  );
}

/**
 * Opt-in, never automatic: after your first approved deliverable a small prompt asks
 * whether you want to share feedback. "Share feedback" opens the form; "Not now" or × hides
 * the prompt for good. /feedback stays open either way.
 */
export function FeedbackInvite({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  async function dismiss() {
    await fetch("/api/feedback/prompt", { method: "POST" }).catch(() => undefined);
    onClose();
  }
  if (!open) {
    // A small popup, shown once after the first approved deliverable. One click (×, "Not now"
    // or Escape) dismisses it for good; nothing opens unless the person chooses to.
    return (
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="fi-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") void dismiss();
        }}
        className="fixed right-4 bottom-4 z-40 w-[min(360px,calc(100vw-2rem))] rounded-2xl bg-raised p-4 shadow-[0_8px_30px_rgba(31,26,20,0.18)] ring-1 ring-line"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="fi-title" className="font-serif text-[20px] leading-tight">Want to share feedback?</h2>
          <button type="button" onClick={() => void dismiss()} aria-label="Dismiss" className="-mt-1 px-1 text-lg leading-none text-ink-dim hover:text-ink">
            ×
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-dim">Four short questions about this deliverable, all optional. We won&apos;t ask again.</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" autoFocus onClick={() => setOpen(true)} className="rounded-lg bg-thread px-3 py-1.5 text-sm font-medium text-raised hover:bg-thread-bright">
            Share feedback
          </button>
          <button type="button" onClick={() => void dismiss()} className="px-2 py-1.5 text-sm text-ink-dim hover:text-ink">
            Not now
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="modal-safe modal-flush fixed inset-0 z-40 flex items-end justify-center bg-ink/30 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="frf-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-raised p-5 ring-1 ring-line">
        <h2 id="frf-title" className="font-serif text-[26px] font-normal leading-tight">
          How did this go?
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-dim">All optional. It shapes what we fix next.</p>
        <FeedbackForm projectId={projectId} source="popup" onCancel={() => setOpen(false)} cancelLabel="Cancel" onDone={() => setTimeout(onClose, 1800)} />
      </div>
    </div>
  );
}
