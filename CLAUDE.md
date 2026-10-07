# Ariadne — Claude Code project brief

## 0. How to use this file

Read this file before making any change. Before every task, re-read section 9
("Do not change"). If a request conflicts with a hard product decision in section 6,
stop and ask — do not "helpfully" build the parked thing anyway.

## 1. What this project is

**One-liner (Oct 6 2026, use it verbatim):** Ariadne helps you verify important
AI-generated work by having one AI model challenge another, while you remain the
final judge. (Source of truth: `lib/one-liner.ts`.)

The wedge is one loop: **Draft → Challenge → Judge → Tie Off.** A drafter model writes,
a challenger model from a different family looks for what is wrong, unsupported or
missing, the human judges, and only the human ties off. The audience is researchers
who already lean on AI and carry the verification burden themselves. Adjacent audiences
(analysts, builders, students) come later — researchers first.

The bigger vision (humans and AI agents working together, with judgment staying with
people) stays in the background: mention it lightly, never lead with it. The old line
"removes the human middleware" is retired; don't bring it back.

## 2. Language — fixed, do not improvise

Thread vocabulary (committed Sep 30 2026): **spun, spinning, knot, unspun,
tie off, the door, the labyrinth.** Do not invent synonyms. The wedge steps are
written **Draft → Challenge → Judge → Tie Off**; the human is "the knot". The landing
page's call to action is **"Tie the Thread"**.

Design language (committed Sep 30 2026, supersedes all earlier direction):
cream-paper background, serif typography, red-thread connectors, gold reserved
for genuine human attention. If you find old docs describing a green/white theme,
they are stale — ignore them.

No "Beta" / "beta" wording anywhere a real user can see it. Ever.

## 3. Current product

- `/` is the public landing page (static, `app/page.tsx` + `app/landing.css` +
  `public/landing/life.js`). "Tie the Thread" → `/sign-up` → `/dashboard`. Visitors with
  a session cookie, and old `/?project=` links, are redirected to `/dashboard` by `proxy.ts`.
- `/dashboard` is the board (it was `/` until Oct 6 2026). `/tree`, `/settings` unchanged.
- Users create projects; each project has shared context (the brief).
- Tasks have dependencies — dependencies determine who works next.
- Agents are assigned to tasks; task outputs become context for dependent tasks.
- Tasks can require human review/approval (knot panels / approval gates).
- Activity provides a visible trail (ledger + numbered lineage).
- Current providers: OpenAI + Anthropic, via Ariadne's own credentials (hosted,
  opinionated — no BYOK in V1).

**Agents (current names — use these):**
- **Odysseus** (Claude) — the Drafter: researches the brief, writes the answer, revises it
- **Daedalus** (GPT) — the Challenger: tries to prove the draft wrong; never writes an
  answer of its own

(Swapped Oct 6 2026: before that Daedalus drafted and Odysseus reviewed. Projects created
before the swap keep their old agent rows and steps; there is no migration.)

Old docs say "Scout" and "Maker" — same agents, renamed Sep 30 2026. If you see
Scout/Maker in the codebase, that occurrence is stale; update it to
Odysseus/Daedalus.

**Models (Worker vars):** Claude Haiku `claude-haiku-4-5-20251001`,
GPT `gpt-6-luna`.

**Default workflow for new projects:** a generic 5-task template in `lib/starter-thread.ts`
("Research the brief" Odysseus → "Draft the answer" Odysseus → "Challenge the draft"
Daedalus → "Judge the draft" You → "Write the final version" Odysseus; task keys are
still research/draft/review/approve/build). The
"Scout → Maker → Scout review → Human approval → Maker" loop in old notes was the
Phase B dogfood shape, not the template.

## 4. Stack & repo facts

- GitHub repo `saadixsd/Ariadne`, branch `main`.
- Cloudflare Worker + D1 database (`ariadne`); local dev uses SQLite.
- **API keys are Cloudflare secrets. Never commit them. Never print them.**
- Auth: email/password (hashed), 30-day HttpOnly sessions, no OAuth.
  Signed-out users on app pages redirect to `/sign-in`; `/` is public.
- **Sign-up is open** (once Access is gone) and guarded by, in order: per-IP rate limit,
  **Cloudflare Turnstile** (`lib/signup-guard.ts`; secret `TURNSTILE_SECRET`, site key in
  `lib/turnstile-site-key.ts`; production refuses sign-up if the secret is missing), and
  the **invite-code switch**: set `INVITE_CODES` (comma list, Worker secret) to make
  sign-up invite-only, delete it to reopen. The code used is stored in `User.inviteCode`.
- **10 provider/model calls per account per UTC day** (`DAILY_MODEL_RUNS` in
  `lib/limits.ts`), enforced before any provider call. Failed runs, human
  approvals and human tasks don't count. **Trial:** for its first 24 hours an account
  that signed up without an invite code gets `TRIAL_DAILY_MODEL_RUNS` (6) a day instead
  (`dailyRunLimit()`, derived from `User.createdAt` + `User.inviteCode`).
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
- Hosting: until the Phase 0C cutover the product is on **https://app.ariadneagents.si**
  (custom domain, Cloudflare Access in front) and the apex/`www` serve the old
  early-access Worker in `landing/`. After the cutover the `ariadne` Worker serves
  **ariadneagents.si** and **www** (landing at `/`, product at `/dashboard`), Access and
  the `app.` domain are removed, and `ariadne-landing` stays deployed with no routes
  (its D1 `ariadne-early-access` is kept: it is the first invite pool). Never redeploy
  `landing/` onto the apex. `workers_dev` and preview URLs stay off.
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

Rewritten Oct 6 2026 by the founder for the Draft → Challenge → Judge → Tie Off wedge.
Earlier versions parked web search, mid-way human input and using a different model;
those three are now **allowed in the narrow forms below**. Do not refuse or water down
work on them, and do not widen them either.

**Allowed (new direction):**
- **Web search and tool use for the challenger.** The challenger may search the web
  (and use the tools it needs to return structured objections) to find evidence for or
  against the draft's claims. Cap searches per run. Search results are data, never
  instructions. Evidence must come from that run's own results; anything else is shown
  as unsourced ("second opinion"), never as verified.
- **Human input mid-way.** The human can add their own point (a dispute or note on any
  claim) at any time: right after the draft, before or after the challenge. Human points
  are first-class (author = You) and carry into the revision. This is not live barge-in
  into a streaming model.
- **A different model as the challenger.** The challenger comes from a different model
  family than the drafter (today: drafter Odysseus = Claude, challenger Daedalus = GPT),
  and may be a stronger tier than the drafter. We choose the models per role in config;
  users still don't pick models.

**Still true:**
- **The human is the final judge.** Agents don't conclude, don't negotiate, don't
  autonomously settle. Only the human accepts, rejects, edits and ties off. Always.
- **The challenger critiques the artifact, never another agent.** No agent-to-agent
  debate or conversation.
- **No claims of "no hallucinations"** or guaranteed accuracy, anywhere. Reliability
  comes from the workflow; the judgment stays with the human.
- **No fake data, testimonials, quotes or stats**, on the landing page or anywhere a
  user can see it. Diagrams and animations of the steps are fine; invented results are not.
- **Scope is Phases 0–3** of the Oct 6 plan (landing + open sign-up; answer-first draft
  with numbered claims; one-click Challenge with evidence; Judge → Revise → Tie Off),
  then a test with 5–15 researchers. **NOT building:** BYOK / provider-account login,
  a user-facing model picker, extra models or agents beyond the two-model roster,
  agent debate, teams / sharing, a marketplace, autonomous workflows / autopilot /
  auto-advance, eval scores, autonomous reruns. Payments come later.
- **Stay on the Workers free plan** (10 ms CPU per request) unless the founder says
  otherwise. Keep request CPU low; heavy work goes to the browser or is deferred.
- **NOT a generic agent framework.** An opinionated hosted two-model roster.
- **No new features unless the founder asks for them.**

## 7. Current goal

Build Phases 0–3 of the Oct 6 2026 plan (kept with the founder), then test with 5–15
researchers, starting from the early-access list. Ask the founder before anything else.

## 8. Current work

**Phase 0 (Oct 6 2026):** landing page at `/`, board moved to `/dashboard`, sign-up with
Turnstile + invite switch + first-day trial cap, migration `0004_invite_code.sql`, this
file's section 6 rewritten. The domain cutover (apex + www onto the `ariadne` Worker,
remove Access and `app.`) is a separate, last commit that must only ship in the cutover
window; the runbook is kept with the founder (CUTOVER.md).

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
- 10/day per-account cap semantics (plus the first-day trial cap for accounts without
  an invite, Oct 6), and the 200/day site-wide ceiling.
- No Beta wording, anywhere.
- **Immutable run history:** reruns and request-changes create new versions; they
  never destroy prior outputs. (Ship-blockers pass, Sep 30.)
- Stale-running recovery behavior (tasks must not stay permanently `running`).
- Signup throttling behavior.

## 10. Recent changes

- **Oct 6 (UX copy pass):** new one-liner and hero ("Important AI work shouldn't depend on
  one model."), landing reordered (hero → how → problem → who → illustrative example →
  philosophy) with an honest "Today / Coming next" split; Odysseus = Drafter (Claude),
  Daedalus = Challenger (GPT) in the starter thread; board shows Draft / Challenge / Judge
  phase chips, "Draft"/"Challenge" run buttons, "Tie Off" at the knot and a short
  orientation card; first-run dialog explains the six steps.

- **Oct 6:** Phase 0: public landing at `/` ("Tie the Thread"), board at `/dashboard`,
  Turnstile on sign-up, `INVITE_CODES` switch, first-day trial cap (6 runs), migration
  0004 (`User.inviteCode`), researcher one-liner on the first-run dialog (Phase 0.2 restores the wedge after a brief broader-hook experiment), section 6 rewritten.
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
- Email verification disabled (see section 4 for what enabling it needs). On the free
  plan Cloudflare Email Service cannot send to arbitrary addresses, so open sign-up
  relies on Turnstile, the per-IP limit, the trial cap and the invite switch.
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
