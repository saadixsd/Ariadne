export const DAILY_MODEL_RUNS = 10;

// Workflow quota (Oct 14 2026, confirmed by Saad): the per-account limit counts WORKFLOWS,
// not model runs. A workflow is one Draft → Challenge → Judge → Tie Off pass on a project
// (lib/usage.ts reserveModelRun). Each account may start WORKFLOWS_PER_DAY per UTC day.
// Model runs inside an open workflow (reruns, Intervene, revisions) do not count, up to
// MAX_RUNS_PER_WORKFLOW in total (a full pass is 3 runs + MAX_RERUNS_PER_WORKFLOW reruns). That cap is
// not advertised in the UI; hitting it says to approve the deliverable or start a new project.
// SITE_DAILY_MODEL_RUNS below still counts every model run across all accounts.
// Oct 14 2026 (Saad, cost): one workflow per account per UTC day, and at most
// MAX_RERUNS_PER_WORKFLOW reruns (redrafts, revisions, re-checks) inside it.
export const WORKFLOWS_PER_DAY = 1;
// A full pass is 4 model calls since Oct 21 2026: draft, fact-check, final answer, and the
// fact-check of the final answer (fix plan B2). Inside one run they are all included.
export const RUNS_PER_FULL_PASS = 4;
// Invited testers (fix plan O2): TESTER_RUNS_PER_DAY runs a day for TESTER_PERIOD_DAYS days
// after sign-up with a code listed in TESTER_INVITE_CODES (User.testerUntil, migration 0013).
// In the UI a "run" is one workflow: question → draft → fact-check → your review → final answer.
export const TESTER_RUNS_PER_DAY = 3;
export const TESTER_PERIOD_DAYS = 14;

export type QuotaAccount = { testerUntil?: Date | string | null };

export function isActiveTester(account: QuotaAccount | null | undefined, now = Date.now()): boolean {
  if (!account?.testerUntil) return false;
  const until = new Date(account.testerUntil).getTime();
  return Number.isFinite(until) && until > now;
}

/** Runs (workflows) this account may start per day. */
export function workflowsPerDay(account: QuotaAccount | null | undefined, now = Date.now()): number {
  return isActiveTester(account, now) ? TESTER_RUNS_PER_DAY : WORKFLOWS_PER_DAY;
}
export const MAX_RERUNS_PER_WORKFLOW = 3;
/** One free rewrite of the final answer (plus its re-check) from the final screen, on top of the redrafts (Oct 22). */
export const FINAL_FIX_RUNS = 2;
export const MAX_RUNS_PER_WORKFLOW = RUNS_PER_FULL_PASS + MAX_RERUNS_PER_WORKFLOW + FINAL_FIX_RUNS;
// Site-wide ceiling on successful model runs per UTC day, across every account. A cost
// backstop while sign-up is open (email verification off); the per-account cap above is
// unchanged and is checked first.
export const SITE_DAILY_MODEL_RUNS = 200;

// Trial allowance. Sign-up is open to the internet (Turnstile, no email verification on the
// free plan), so for its first 24 hours an account that signed up WITHOUT an invite code
// gets a smaller daily cap: enough for one full pass of the four-step thread (3 model runs:
// Draft, Challenge, Tie Off writeup) plus one round of changes. After that it gets
// DAILY_MODEL_RUNS like everyone else. Intentional trial — not a regression from 10/day.
// Accounts that signed up with a valid invite code skip the trial. Derived from
// User.createdAt and User.inviteCode, so there is no extra state to keep in sync.
export const TRIAL_DAILY_MODEL_RUNS = 6;
export const TRIAL_PERIOD_MS = 24 * 60 * 60 * 1000;

export type RunAllowanceAccount = { createdAt: Date | string; inviteCode?: string | null; refCode?: string | null };

/** True while a non-invited account is inside its first TRIAL_PERIOD_MS. */
export function inTrial(account: RunAllowanceAccount, now = Date.now()): boolean {
  // Outreach accounts (signed ref code, lib/campaign.ts) get the invite-level allowance.
  if (account.inviteCode || account.refCode) return false;
  const created = new Date(account.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created < TRIAL_PERIOD_MS;
}

/** The account's own model-run cap for today (the site-wide ceiling still applies on top). */
export function dailyRunLimit(account: RunAllowanceAccount, now = Date.now()): number {
  return inTrial(account, now) ? TRIAL_DAILY_MODEL_RUNS : DAILY_MODEL_RUNS;
}

// Invite codes (INVITE_CODES env var) are short shared words, not secrets.
export const MAX_INVITE_CODE_CHARS = 64;

// Input caps, enforced server-side on every POST/PATCH that accepts them.
export const MAX_PROJECT_NAME_CHARS = 120;
export const MAX_BRIEF_CHARS = 5_000;
export const MAX_TASK_TITLE_CHARS = 200;
export const MAX_INSTRUCTIONS_CHARS = 5_000;
export const MAX_NOTE_CHARS = 2_000;
// Request-changes appends "Human requested changes: <note>" to instructions.
// The accumulated text is capped: the oldest notes are dropped first, the newest
// always fits (MAX_INSTRUCTIONS_CHARS + MAX_NOTE_CHARS + marker < this cap).
export const MAX_ACCUMULATED_INSTRUCTIONS_CHARS = 8_000;

// IP rate limits for auth endpoints (fixed one-hour windows).
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const MAX_SIGNUPS_PER_HOUR_PER_IP = 5;
export const MAX_SIGNINS_PER_HOUR_PER_IP = 10;
export const MAX_VERIFY_ATTEMPTS_PER_HOUR_PER_IP = 20;
/** Forgot-password requests and reset attempts per IP per hour. */
export const MAX_RESETS_PER_HOUR_PER_IP = 5;
/** Reset emails per account per hour (on top of the IP cap). */
export const MAX_RESET_EMAILS_PER_HOUR = 3;
export const RESET_LINK_MS = 30 * 60 * 1000;

// Output caps per provider call. Claude: 16,384 (thinking counts toward it on current models).
// GPT gets the same visible budget plus headroom, because max_completion_tokens also
// counts a reasoning model's hidden reasoning tokens. Before this, GPT calls had no cap.
// Lowered Oct 14 2026 for cost: drafts and checks measured in production stay well under it.
export const MAX_OUTPUT_TOKENS_ANTHROPIC = 8_192;
export const MAX_OUTPUT_TOKENS_OPENAI = 8_192;

// A synchronous run takes at most ~120s (60s SDK timeout x 2 tries). A task
// still "running" after this long lost its request (disconnect, deploy, crash).
export const STUCK_RUN_TIMEOUT_MS = 5 * 60 * 1000;
