export const DAILY_MODEL_RUNS = 10;

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

// A synchronous run takes at most ~120s (60s SDK timeout x 2 tries). A task
// still "running" after this long lost its request (disconnect, deploy, crash).
export const STUCK_RUN_TIMEOUT_MS = 5 * 60 * 1000;
