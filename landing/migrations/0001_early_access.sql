-- Ariadne early access (D1 database "ariadne-early-access"; separate from the app's "ariadne").
-- One row per person who asked for access. The row is created at step 1 (email only) and
-- filled in by each answer after it, so partial answers are kept.
-- No raw IP address and no raw user agent.

CREATE TABLE requests (
  id           INTEGER PRIMARY KEY,
  email        TEXT    NOT NULL UNIQUE,      -- trimmed and lowercased by the Worker
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  uses_ai_for  TEXT,                         -- "What do you use AI for?" (<= 280 chars)
  tools        TEXT,                         -- comma list from: claude,gpt,cursor,codex,gemini,copilot,other
  tools_other  TEXT,                         -- free text when "other" is ticked (<= 80 chars)
  switching    TEXT CHECK (switching IN ('several_daily', 'daily', 'weekly', 'rarely')),
  status       TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'invited')),
  completed_at TEXT,                         -- set when they reach the last step
  invited_at   TEXT,
  referrer     TEXT,                         -- host of document.referrer only
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  ua_hash      TEXT                          -- salted SHA-256 of the user agent, 16 hex chars
);

CREATE INDEX requests_status_created ON requests (status, created_at);

-- Fixed one-hour windows per salted hash of the client IP. Rows expire with their
-- window and are swept opportunistically, so the table stays tiny.
CREATE TABLE rate_limits (
  key        TEXT    PRIMARY KEY,            -- "<window start ms>:<ip hash>"
  count      INTEGER NOT NULL,
  expires_at INTEGER NOT NULL                -- epoch ms
);

CREATE INDEX rate_limits_expires_at ON rate_limits (expires_at);
