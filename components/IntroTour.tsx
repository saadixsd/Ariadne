"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    title: "Ask your question, add your sources",
    body: "Write what you need to know and who it is for. Add the papers, reports or notes it should draw on (PDF, DOCX, Markdown).",
  },
  {
    title: "The writer drafts the answer",
    body: "Read the draft. If it is what you asked for, move on to the check. If not, use “Change something” and it rewrites.",
  },
  {
    title: "The fact-checker checks the key claims",
    body: "The claims that matter most are checked against your sources and the web, with the evidence and a link; any others are listed as not checked in full. You decide only the few claims a source contradicts: keep it, use the source's version, remove it, or write your own.",
  },
  {
    title: "Tie off, approve, keep the record",
    body: "The writer works your decisions into the final answer. You approve the final answer, and the full thread and claim table are yours to export.",
  },
];

const LOCAL_KEY = "ariadne_intro_done";

/** First-run intro: a small, non-blocking card shown once per user. */
export function IntroTour({ show }: { show: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The server flag decides; localStorage covers the moment between dismissing and the server write.
    if (!show || window.localStorage.getItem(LOCAL_KEY) === "1") return;
    const t = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(t);
  }, [show]);

  useEffect(() => {
    if (open) nextRef.current?.focus();
  }, [open, step]);

  function close() {
    setOpen(false);
    window.localStorage.setItem(LOCAL_KEY, "1");
    void fetch("/api/account/intro", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seen: true }) }).catch(() => undefined);
  }

  if (!open) return null;
  const last = step === STEPS.length - 1;
  const s = STEPS[step];
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="intro-title"
      data-testid="intro-tour"
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        if (e.key === "ArrowRight" && !last) setStep(step + 1);
        if (e.key === "ArrowLeft" && step > 0) setStep(step - 1);
      }}
      className="fixed right-4 bottom-4 z-40 w-[min(360px,calc(100vw-2rem))] rounded-2xl bg-raised p-4 shadow-[0_12px_40px_rgba(31,26,20,0.18)] ring-1 ring-line"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] tracking-wide text-ink-dim uppercase">
          Getting started · {step + 1} of {STEPS.length}
        </p>
        <button type="button" onClick={close} className="text-xs text-ink-dim hover:text-ink">
          Skip
        </button>
      </div>
      <h2 id="intro-title" className="mt-2 font-serif text-xl leading-tight">
        {s.title}
      </h2>
      <p className="mt-1.5 text-sm leading-normal text-ink-dim">{s.body}</p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-thread" : "bg-line-strong"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)} className="rounded-lg px-3 py-1.5 text-xs ring-1 ring-line hover:ring-thread">
              Back
            </button>
          ) : null}
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? close() : setStep(step + 1))}
            className="rounded-lg bg-thread px-3 py-1.5 text-xs font-medium text-raised hover:bg-thread-bright"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Settings: show the intro again on the next app page. */
export function ShowIntroAgain() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        window.localStorage.removeItem(LOCAL_KEY);
        await fetch("/api/account/intro", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seen: false }) }).catch(() => undefined);
        window.location.href = "/dashboard";
      }}
      className="text-sm text-thread underline underline-offset-2 hover:text-thread-bright disabled:opacity-50"
    >
      Show intro again
    </button>
  );
}
