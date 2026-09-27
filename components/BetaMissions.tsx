"use client";

import { useChecks, useFlag, writeChecks, writeFlag } from "@/components/client-storage";

const STORAGE_KEY = "ariadne.missions.checks";
const DISMISS_KEY = "ariadne.missions.dismissed";

const MISSIONS = [
  "Run the full workflow without any help — where did you get stuck?",
  "Edit the shared context brief, re-run task 1 — did the agents notice?",
  "Tell us the one thing you'd use this for in your real work.",
];

export function BetaMissions() {
  const dismissed = useFlag(DISMISS_KEY);
  const checks = useChecks(STORAGE_KEY);
  if (dismissed) return null;

  const done = checks.filter(Boolean).length;

  function toggle(index: number) {
    const next = checks.map((value, item) => (item === index ? !value : value));
    writeChecks(STORAGE_KEY, next);
  }

  return (
    <section className="enter mx-3 mt-3 bg-raised p-3 ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold tracking-[0.16em] text-thread">Beta missions</h3>
          <p className="mt-1 font-mono text-xs text-ink-dim">
            {done} of {MISSIONS.length}
          </p>
        </div>
        <button
          type="button"
          onClick={() => writeFlag(DISMISS_KEY, true)}
          className="text-xs text-ink-dim hover:text-ink"
        >
          Dismiss
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {MISSIONS.map((mission, index) => (
          <li key={mission}>
            <label className="flex items-start gap-2 text-sm leading-normal">
              <input
                type="checkbox"
                checked={checks[index]}
                onChange={() => toggle(index)}
                className="mt-1 accent-thread"
              />
              <span>{mission}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-normal text-ink-dim">
        Checking a mission does not start a run. Press Run on a task when you want an agent to work.
        Re-run clears that task and the steps after it. Reset clears the whole example. Neither starts work until you confirm.
      </p>
    </section>
  );
}
