/*
  When to ask the server for news. Pure, so it can be tested without a browser.

  - Something spinning (a task is running, or this tab is waiting on a Run): every 2s.
  - Otherwise back off: 4s, 8s, 16s, 32s, then once a minute, for as long as
    nothing changes. Any change, or anything you do, starts the ladder again.
  - Tab hidden: no polling at all. Coming back polls once, right away.
*/

export const POLL_ACTIVE_MS = 2_000;
export const POLL_IDLE_START_MS = 4_000;
export const POLL_IDLE_MAX_MS = 60_000;

export type PollState = {
  /** A task is running on the server, or this tab has a request in flight. */
  spinning: boolean;
  /** document.visibilityState === "hidden" */
  hidden: boolean;
  /** Consecutive idle polls that came back unchanged (304). */
  quietPolls: number;
};

/** Milliseconds until the next poll, or null for "don't schedule one". */
export function nextPollDelay(state: PollState): number | null {
  if (state.hidden) return null;
  if (state.spinning) return POLL_ACTIVE_MS;
  const steps = Math.max(0, Math.min(state.quietPolls, 10));
  return Math.min(POLL_IDLE_MAX_MS, POLL_IDLE_START_MS * 2 ** steps);
}

export function isSpinning(tasks: readonly { status: string }[], pendingId: string | null): boolean {
  return pendingId !== null || tasks.some((task) => task.status === "running");
}
