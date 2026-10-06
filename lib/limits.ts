export const DAILY_MODEL_RUNS = 10;
// Site-wide ceiling on successful model runs per UTC day, across every account. A cost
// backstop while sign-up is open (email verification off); the per-account cap above is
// unchanged and is checked first.
export const SITE_DAILY_MODEL_RUNS = 200;

// Trial allowance. Sign-up is open to the internet (Turnstile, no email verification on the
// free plan), so for its first 24 hours an account that signed up WITHOUT an invite code
// gets a smaller daily cap: enough for one full pass of the five-step thread (4 model runs)
// plus one round of changes (2 more). After that it gets DAILY_MODEL_RUNS like everyone else.
// Accounts that signed up with a valid invite code skip the trial. Derived from
// User.createdAt and User.inviteCode, so there is no extra state to keep in sync.
export const TRIAL_DAILY_MODEL_RUNS = 6;
export const TRIAL_PERIOD_MS = 24 * 60 * 60 * 1000;

export type RunAllowanceAccount = { createdAt: Date | string; inviteCode?: string | null };

/** True while a non-invited account is inside its first TRIAL_PERIOD_MS. */
export function inTrial(account: RunAllowanceAccount, now = Date.now()): boolean {
  if (account.inviteCode) return false;
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

// Output caps per provider call. Claude has always been capped at 8,192 output tokens.
// GPT gets the same visible budget plus headroom, because max_completion_tokens also
// counts a reasoning model's hidden reasoning tokens. Before this, GPT calls had no cap.
export const MAX_OUTPUT_TOKENS_ANTHROPIC = 8_192;
export const MAX_OUTPUT_TOKENS_OPENAI = 16_384;

// A synchronous run takes at most ~120s (60s SDK timeout x 2 tries). A task
// still "running" after this long lost its request (disconnect, deploy, crash).
export const STUCK_RUN_TIMEOUT_MS = 5 * 60 * 1000;
