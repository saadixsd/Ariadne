"use client";

import { useState } from "react";

const KINDS = [
  { id: "bug", label: "Bug" },
  { id: "idea", label: "Idea" },
  { id: "confusing", label: "Confusing" },
] as const;

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"] | null>(null);
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<"form" | "done" | "error">("form");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!kind || message.trim().length === 0) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message: message.trim() }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setPhase("error");
        setError(body.error ?? "Could not save feedback");
        return;
      }
      setPhase("done");
    } catch {
      setPhase("error");
      setError("Could not reach the server. Check that the dev server is running, then try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="w-full max-w-lg bg-raised p-5 ring-1 ring-line"
      >
        {phase === "done" ? (
          <>
            <h2 id="feedback-title" className="text-lg font-semibold leading-tight">
              Thanks — you&apos;re shaping Ariadne.
            </h2>
            <p className="mt-2 text-sm leading-normal text-ink-dim">
              It is stored for the inbox at /feedback. Sending feedback does not run an agent.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="bg-thread px-3 py-2 text-sm font-medium text-(--color-base) hover:bg-thread-bright"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="feedback-title" className="text-lg font-semibold leading-tight">
              Give feedback
            </h2>
            <p className="mt-1 text-sm leading-normal text-ink-dim">
              Bug, idea, or something that was confusing. This does not start a run.
            </p>
            <p className="mt-2 text-sm leading-normal text-thread-bright">
              Tell us the one thing you&apos;d use this for in your real work.
            </p>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Feedback kind">
              {KINDS.map((item) => {
                const selected = kind === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setKind(item.id)}
                    className={
                      selected
                        ? "bg-thread px-3 py-1.5 text-sm font-medium text-(--color-base)"
                        : "bg-panel px-3 py-1.5 text-sm text-ink ring-1 ring-line hover:ring-thread"
                    }
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <label className="mt-4 block text-sm">
              Message
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={5}
                className="mt-1 w-full bg-base px-3 py-2 text-sm leading-normal text-ink ring-1 ring-line"
              />
            </label>
            {phase === "error" && error ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {error} Nothing was sent to Claude or GPT.
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-dim hover:text-ink">
                Close
              </button>
              <button
                type="button"
                disabled={sending || !kind || message.trim().length === 0}
                onClick={() => void submit()}
                className="bg-thread px-3 py-2 text-sm font-medium text-(--color-base) hover:bg-thread-bright disabled:opacity-50"
              >
                {sending ? "Sending" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
