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

**Default workflow for new projects:** a generic 5-task template
(research → draft → review → human approval → build). The
"Scout → Maker → Scout review → Human approval → Maker" loop in old notes was the
Phase B dogfood shape, not the template.

## 4. Stack & repo facts

- Private GitHub repo `saadixsd/Ariadne`, branch `main`.
- Cloudflare Worker + D1 database (`ariadne`); local dev uses SQLite.
- **API keys are Cloudflare secrets. Never commit them. Never print them.**
- Auth: email/password (hashed), 30-day HttpOnly sessions, no OAuth.
  Signed-out users redirect to `/sign-in`.
- **10 provider/model calls per account per UTC day**, enforced before any
  provider call. Human approvals/tasks don't count.
- Email-verification code exists but is **disabled** until a custom domain exists.
- Live: https://ariadne.sr-labs.workers.dev

**Repo map:** map the actual layout yourself on first run (entry point, Worker
code, routes, D1 schema/migrations, frontend). Do not assume a structure — verify.

## 5. Validation hypothesis

People who regularly use multiple AI models to complete one piece of work will
value having those models coordinated through a shared workflow.

**Current gate (the only thing that matters right now):** 5 real builders on real
recurring workflows + a willingness-to-pay test at **$29/mo** (the old ~$15 figure
is dead — founder rejected it as too low).
- Pass: 3+ of 5 finish a real workflow unaided; 1+ credible yes at $29/mo.
- Kill signals: builders skip the critique step; single-model self-review satisfies
  them; "I could wire this in n8n" (wrapper verdict).

Full version: `workspace/ariadne-prototype/21_ARIADNE_VALIDATION_DRAFT.md`.

## 6. Hard product decisions — do not relitigate

- **The human is the final judge.** Agents don't conclude, don't negotiate, don't
  autonomously settle. Human approves or requests changes. Always.
- **NOT building (parked until usage evidence demands otherwise):** agent debate,
  barge-in / live steering, dynamic routing, BYOK / provider-account login,
  model picker / model switching, eval scores, autonomous reruns, large agent
  rosters, broad tool use.
- **NOT a generic agent framework.** V1 is an opinionated hosted two-model roster.
- **No new features without a validation need.** If it doesn't serve the 5-builder
  gate, it doesn't get built.

## 7. Current goal

Get 5 real builders using Ariadne on real recurring workflows and determine
whether the coordination problem is valuable enough to solve.

## 8. Current work

Cleanup pass: remove the 3-step intro onboarding ("You hold the thread." card);
verify zero user-visible "Beta" wording (QA sweep Oct 1 2026 found zero —
confirm via repo grep and keep it that way); remove the 3-step intro's
`ariadne.welcome.*` localStorage wiring. **KEEP the mandatory
"What are you making?" project dialog on signup** — the founder confirmed it is
intentional (direction before blank canvas).

Task detail: `workspace/ariadne-prototype/22_CLAUDE_CODE_CLEANUP_BRIEF.md`.

## 9. Do not change

- The "What are you making?" signup dialog.
- The human-judge principle and approval gates.
- Thread vocabulary and design language (section 2).
- 10/day cap semantics.
- No Beta wording, anywhere.
- **Immutable run history:** reruns and request-changes create new versions; they
  never destroy prior outputs. (Ship-blockers pass, Sep 30.)
- Stale-running recovery behavior (tasks must not stay permanently `running`).
- Signup throttling behavior.

## 10. Recent changes

- **Sep 30:** thread re-theme (cream/serif/red-thread) shipped; agents renamed
  Scout→Odysseus, Maker→Daedalus; ship-blockers reliability pass (immutable run
  history, stale-run recovery, signup throttling); differentiation build
  (critique callouts with add-to-note, v1→v2 comparison, model attribution
  everywhere, budget honesty, one-liner in empty state).
- **Sep 28:** Phase B dogfood passed — full cross-model loop on a real
  investor-mapping task; critique visibly improved the draft.
- **Sep 27:** mandatory "What are you making?" dialog confirmed intentional.

## 11. Known issues / unverified

- Mobile ~390px layout unverified.
- Rerun/cascade + immutable history not independently verified end-to-end.
- Email verification disabled until custom domain exists.
- Tree node detail/lineage view may lag the board's.
- Docs under `workspace/ariadne-prototype/` numbered 04–15 contain stale names
  (Scout/Maker), stale pricing (~$15), and the stale green/white theme. Treat them
  as history, not spec. This file + section 12 win on conflicts.

## 12. Key files

- `workspace/ariadne-prototype/16_ARIADNE_EXPLAINER_GROK.md` — full orientation:
  thesis, the three problems, what Ariadne is NOT, V1→V3 roadmap. Read before
  product-adjacent work.
- `workspace/ariadne-prototype/21_ARIADNE_VALIDATION_DRAFT.md` — problem,
  differentiation, validation plan, kill criteria.
- `workspace/ariadne-prototype/22_CLAUDE_CODE_CLEANUP_BRIEF.md` — current task detail.

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
