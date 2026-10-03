# Ariadne — Claude Code project brief

## 0. How to use this file

Read this file before making any change. Before every task, re-read section 9
("Do not change"). If a request conflicts with a hard product decision in section 6,
stop and ask — do not "helpfully" build the parked thing anyway.

## 1. What this project is

Ariadne is a coordination layer for multiple AI models. It removes the human
middleware between AI tools by coordinating context, handoffs, review, and human
approval.

**One-liner:** Ariadne removes the human middleware between AI agents.

**Coordination is the product; the dashboard is only the visibility surface.**

## 2. Language — fixed, do not improvise

Thread vocabulary (committed Sep 30 2026): **spun, spinning, knot, unspun,
tie off, the door, the labyrinth.** Do not invent synonyms.

Design language (committed Sep 30 2026, supersedes all earlier direction):
cream-paper background, serif typography, red-thread connectors, gold reserved
for genuine human attention. If you find old docs describing a green/white theme,
they are stale — ignore them.

No "Beta" / "beta" wording anywhere a real user can see it. Ever.

## 3. Current product

- Users create projects; each project has shared context (the brief).
- Tasks have dependencies — dependencies determine who works next.
- Agents are assigned to tasks; task outputs become context for dependent tasks.
- Tasks can require human review/approval (knot panels / approval gates).
- Activity provides a visible trail (ledger + numbered lineage).
- Current providers: OpenAI + Anthropic, via Ariadne's own credentials (hosted,
  opinionated — no BYOK in V1).

**Agents (current names — use these):**
- **Odysseus** (Claude) — researcher + reviewer
- **Daedalus** (GPT) — builder + writer

Old docs say "Scout" and "Maker" — same agents, renamed Sep 30 2026. If you see
Scout/Maker in the codebase, that occurrence is stale; update it to
Odysseus/Daedalus.

**Models (Worker vars):** Claude Haiku `claude-haiku-4-5-20251001`,
GPT `gpt-6-luna`.

**Default workflow for new projects:** a generic 5-task template in `lib/starter-thread.ts`
(research → draft → review → human approval → produce). The
"Scout → Maker → Scout review → Human approval → Maker" loop in old notes was the
Phase B dogfood shape, not the template.

## 4. Stack & repo facts

- GitHub repo `saadixsd/Ariadne`, branch `main`.
- Cloudflare Worker + D1 database (`ariadne`); local dev uses SQLite.
- **API keys are Cloudflare secrets. Never commit them. Never print them.**
- Auth: email/password (hashed), 30-day HttpOnly sessions, no OAuth.
  Signed-out users redirect to `/sign-in`.
- **10 provider/model calls per account per UTC day** (`DAILY_MODEL_RUNS` in
  `lib/limits.ts`), enforced before any provider call. Failed runs, human
  approvals and human tasks don't count.
- **Site-wide ceiling: 200 model runs per UTC day across all accounts**
  (`SITE_DAILY_MODEL_RUNS`), checked after the account's own run is reserved;
  over it, the run is refused with 503 and nothing reaches a provider. Output caps:
  Claude `max_tokens` 8,192, GPT `max_completion_tokens` 16,384.
- Security headers (`next.config.ts`) on every response, no `X-Powered-By`;
  `proxy.ts` refuses API writes with a foreign `Origin` (403).
- Workers **free plan**: 10 ms CPU per request is the limit that matters (error 1102).
  Keep per-request CPU low; Workers Logs (observability) is on to trace it.
- Email-verification code exists but is **disabled** (no `send_email` binding).
  Enabling it needs company email, `ariadneagents.si` onboarded to Cloudflare
  Email Service, and the Workers Paid plan. Steps: `docs/PROJECT_LOG.md`.
- Live: **https://ariadneagents.si** (apex and `www` are Worker routes in
  `wrangler.jsonc`). https://ariadne.sr-labs.workers.dev still serves the same app.
- Production deploys from `main` via Workers Builds. Main was at `9f841e6` (Oct 2)
  before the `presentation/cleanup` branch.
- **Branch previews do not get production data.** `wrangler.jsonc` has no
  `previews` block on purpose (it used to bind the production D1, and preview
  secrets held real model keys). Don't add one back pointing at `ariadne`; use a
  separate D1 with no paid keys if previews are ever needed.
- Schema changes: next `migrations/000N_*.sql`, applied to production with
  `wrangler d1 migrations apply ariadne --remote` **before** pushing the code
  (`docs/MIGRATIONS.md`).

**Repo map:** `README.md` (layout) and `docs/ARCHITECTURE.md` (pipeline, state
machine, code map) describe it; tests live in `tests/unit` and `tests/integration`.
Still verify against the code before relying on it.

## 5. Strategy

Business strategy (validation plan, pricing tests, goals) is kept outside this
repo with the founder. Ask if a task needs it.

## 6. Hard product decisions — do not relitigate

- **The human is the final judge.** Agents don't conclude, don't negotiate, don't
  autonomously settle. Human approves or requests changes. Always.
- **NOT building (parked until usage evidence demands otherwise):** agent debate,
  barge-in / live steering, dynamic routing, BYOK / provider-account login,
  model picker / model switching, eval scores, autonomous reruns, large agent
  rosters, broad tool use.
- **NOT a generic agent framework.** V1 is an opinionated hosted two-model roster.
- **No new features unless the founder asks for them.**

## 7. Current goal

Ask the founder; it is tracked outside this repo (section 5).

## 8. Current work

**Presentation cleanup (Oct 3 2026), branch `presentation/cleanup`:** repo tidy
(planning docs archived, dead code removed, `lib/demo.ts` → `lib/starter-thread.ts`,
tests regrouped), the site-wide 200 runs/day ceiling and GPT output cap, security
headers, the Origin check on API writes, previews unbound from production D1,
`npm audit fix`, and README / ARCHITECTURE / SECURITY / CHANGELOG with diagrams in
`docs/diagrams/`. No migration. See `docs/PROJECT_LOG.md`.

Earlier: the Oct 1 V1 cleanup (`cleanup/v1-hardening`, `9b0d2a0`, `34cdc97`) and the
Oct 2 differentiation features and free-plan performance work (`5e7bf28` …
`9f841e6`) are on `main` and live. **The mandatory "What are you making?" project
dialog on signup stays**: the founder confirmed it is intentional (direction
before blank canvas).

No task is in progress here beyond that branch. Next work only when the founder asks.

Task detail (historical): `docs/archive/planning/22_CLAUDE_CODE_CLEANUP_BRIEF.md`.

## 9. Do not change

- The "What are you making?" signup dialog.
- The human-judge principle and approval gates.
- Thread vocabulary and design language (section 2).
- 10/day per-account cap semantics, and the 200/day site-wide ceiling.
- No Beta wording, anywhere.
- **Immutable run history:** reruns and request-changes create new versions; they
  never destroy prior outputs. (Ship-blockers pass, Sep 30.)
- Stale-running recovery behavior (tasks must not stay permanently `running`).
- Signup throttling behavior.

## 10. Recent changes

- **Oct 3:** presentation cleanup branch (section 8).
- **Oct 2:** differentiation features shipped: critique flags with "Add to note",
  v1→v2 comparison, model attribution ("Made by / Reviewed by"), run-cost labels
  on Run buttons, and the one-liner on the "What are you making?" dialog
  (`5e7bf28`); faster comparison, new favicon, Workers Logs (`24ae2e4`); lower
  per-request CPU for the free plan (`039511e`) and half the queries on Run
  (`9f841e6`).
- **Oct 1:** V1 cleanup/hardening pass merged to `main` (`9b0d2a0`, `34cdc97`):
  intro card removed, internal copy out of the UI, brief cap 5,000 everywhere,
  readable failure paths, `www.ariadneagents.si` route, Tree detail rail as a
  full-screen sheet on phones. See `docs/PROJECT_LOG.md`.
- **Sep 30:** thread re-theme (cream/serif/red-thread) shipped; agents renamed
  Scout→Odysseus, Maker→Daedalus; ship-blockers reliability pass (immutable run
  history, stale-run recovery, signup throttling); responsive pass, name editing,
  project rename/delete (`d0908ed`).
- **Sep 28:** Phase B dogfood passed — full cross-model loop on a real task;
  critique visibly improved the draft.
- **Sep 27:** mandatory "What are you making?" dialog confirmed intentional.

## 11. Known issues / unverified

- Responsive layout verified: 360–2560px widths and short heights (`d0908ed`,
  Sep 30), plus a 390×844 pass on production (Oct 1–2, see `docs/PROJECT_LOG.md`).
- Rerun/cascade + immutable history not independently verified end-to-end.
- Email verification disabled (see section 4 for what enabling it needs).
- Tree node detail/lineage view may lag the board's.
- Docs under `docs/archive/planning/` (04–13 especially) contain stale names
  (Scout/Maker) and the stale green/white theme. Treat them as history, not
  spec. This file wins on conflicts.

## 12. Key files

- `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `CHANGELOG.md` — overview,
  pipeline and code map, security model, history.
- `docs/archive/planning/01_VISION.md`, `07_V1_PLAN.md` — original thesis and V1 plan.
- `docs/archive/planning/22_CLAUDE_CODE_CLEANUP_BRIEF.md` — the (finished) Oct 1 cleanup task.
- `docs/PROJECT_LOG.md` — what shipped, when, and how it was verified.
- `docs/MIGRATIONS.md` — how production D1 schema changes ship.

## 13. Development rules

- Read this file before making changes; re-check section 9 per task.
- Map the repo layout first (section 4). Verify, don't assume.
- Inspect existing implementation before rewriting anything.
- Preserve product decisions (section 6) unless explicitly asked to change them.
- Do not introduce new architecture unnecessarily.
- Explain potentially destructive changes **before** making them.
- Verify: build passes with zero new warnings; fresh-signup flow works end to end;
  grep for regressions on any copy you removed or renamed.

---

Next.js agent rules (kept from the previous CLAUDE.md):

@AGENTS.md
