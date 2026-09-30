"use client";

import { useChecks, useFlag, writeChecks, writeFlag } from "@/components/client-storage";

const DISMISS_KEY = "ariadne.welcome.dismissed";
const CHECKS_KEY = "ariadne.welcome.checks";

const STEPS = ["Meet your agents", "Run your first task", "Approve a handoff"];

export function WelcomeOverlay({
  metAgents,
  ranTask,
  approved,
  canHighlightRun,
  onRunDemo,
}: {
  metAgents: boolean;
  ranTask: boolean;
  approved: boolean;
  canHighlightRun: boolean;
  onRunDemo: () => void;
}) {
  const dismissed = useFlag(DISMISS_KEY);
  const stored = useChecks(CHECKS_KEY);
  if (dismissed) return null;

  const derived = [metAgents, ranTask, approved];
  const checked = derived.map((done, index) => done || stored[index]);
  const progress = checked.filter(Boolean).length;

  function mark(index: number) {
    if (checked[index]) return;
    const next = stored.map((value, item) => (item === index ? true : value));
    writeChecks(CHECKS_KEY, next);
  }

  return (
    <aside className="enter mx-7 mt-3 shrink-0 rounded-2xl border border-thread-soft bg-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-thread">Onboarding</p>
          <h2 className="mt-1 font-serif text-[26px] font-normal leading-tight">You&apos;re the conductor now.</h2>
        </div>
        <button type="button" onClick={() => writeFlag(DISMISS_KEY, true)} className="shrink-0 text-sm text-ink-dim hover:text-ink">
          Dismiss
        </button>
      </div>
      <p className="mt-2 text-sm leading-normal text-ink-dim">
        Scout (Claude) and Maker (GPT) share one workspace. You assign, they hand off, you approve.
      </p>
      <p className="mt-3 font-mono text-xs text-thread-bright">
        {progress} of {STEPS.length}
      </p>
      <ol className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5">
        {STEPS.map((step, index) => (
          <li key={step}>
            <label className="flex items-start gap-2 text-sm leading-normal">
              <input
                type="checkbox"
                checked={checked[index]}
                onChange={() => mark(index)}
                className="mt-1 accent-thread"
              />
              <span>
                {index + 1}. {step}
              </span>
            </label>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onRunDemo}
        className="mt-4 bg-thread px-3 py-2 text-sm font-medium text-raised hover:bg-thread-bright"
      >
        {canHighlightRun ? "Run the demo" : "Review the workflow"}
      </button>
      <p className="mt-2 text-xs leading-normal text-ink-dim">
        {canHighlightRun
          ? "This scrolls to task 1 and highlights Run. It does not call Claude or GPT. Press Run on the task when you want that."
          : "Task 1 already has a result or a failure. Read it here. Reset demo clears the board without calling a model."}
      </p>
    </aside>
  );
}
