# Changelog

What was built, by day, summarized from `git log` on `main` (51 commits, Sep 27 to Oct 2, 2026,
plus the presentation cleanup of Oct 3).
Detailed notes and how each change was verified: [docs/PROJECT_LOG.md](docs/PROJECT_LOG.md).

## 2026-10-06: Phase 0.2 — researcher wedge on the landing
- Restores the researcher one-liner: "Ariadne helps researchers verify AI-generated work by
  having one model challenge another, while keeping the final judgment with the human."
- Keeps the hero eyebrow "Agents draft. Agents challenge. You judge." (philosophy, not audience).
- Problem and Who sections are researchers-first again; adjacent audiences noted as later.
- README, CLAUDE.md, CHANGELOG, first-run dialog and metadata (via `lib/one-liner.ts`) match.

## 2026-10-06: Phase 0.1 — broader hook, not researchers-only
- Brief experiment widening past researchers; superseded the same day by Phase 0.2.
- Introduced the hero eyebrow "Agents draft. Agents challenge. You judge." (kept in 0.2).

## 2026-10-06: Phase 0 — back to ariadneagents.si, no waitlist
- Researcher one-liner and wedge (Draft → Challenge → Judge → Tie Off). `CLAUDE.md` §6 now
  allows challenger web search, human input mid-way, and a different model as challenger.
- A static landing page at `/` (the Door, the red thread, how the four steps work, who it's
  for, what works today and what's next). "Tie the Thread" leads to sign-up.
- The board moved to `/dashboard`; every link and redirect follows. Old `/?project=` links
  and signed-in visits to `/` go to `/dashboard`.
- Open sign-up with Cloudflare Turnstile, an `INVITE_CODES` switch for invite-only mode,
  and a first-day trial of 6 model runs. Migration `0004` adds `User.inviteCode`.
- The first-run dialog uses the new one-liner.
- Docs: request routing, sign-up and hosting diagrams; `docs/CUTOVER.md` for moving the
  domain (not yet executed).

## 2026-10-03: Presentation cleanup and hardening
- A site-wide ceiling of 200 model runs per UTC day on top of each account's 10, with its own
  message, and an output cap on GPT calls to match Claude's.
- Security headers on every response, `X-Powered-By` removed, and API writes from other sites refused.
- Branch previews can no longer bind the production database.
- `npm audit fix` (lockfile only: wrangler, miniflare, undici).
- Repository tidy: planning docs moved to `docs/archive/`, unused files and dead code removed,
  `lib/demo.ts` renamed `lib/starter-thread.ts`, tests grouped into `tests/unit` and `tests/integration`.
- README, architecture, security and changelog docs, with diagrams in `docs/diagrams/`.

## 2026-10-02: Review features and free-plan performance
- Review flags with "Add to note", a v1 → v2 comparison, model attribution ("Made by / Reviewed by"),
  run-cost labels on Run buttons, and a one-liner on the first-project dialog (`5e7bf28`).
- Faster v1 → v2 comparison, critique parsed in the browser, new favicon, Workers Logs enabled (`24ae2e4`).
- Less Worker CPU per request: Markdown rendered in the browser only, fewer queries on board loads,
  static sign-in and sign-up pages (`039511e`).
- About half as many database queries on Run (29 to 16), same behavior (`9f841e6`).
- Docs corrected to match the code (`b2ae992`).

## 2026-10-01: V1 hardening for real users
- Standing project brief (`CLAUDE.md`) and cleanup brief added (`e0e1af9`).
- Intro card removed, internal wording kept out of the UI, `www.ariadneagents.si` routed,
  and every failure path ends on a readable message (`8e780ce`).
- Tree detail rail opens as a full-screen sheet on phones (`9b0d2a0`). Production checks logged (`c7c1d83`, `34cdc97`).

## 2026-09-30: Phase 2
- Agents renamed Scout/Maker → Odysseus/Daedalus (migration `0003`), the Tree drawn from real dependencies,
  adaptive polling with ETag/304, typeset output with a Reader, a Socratic question at each knot,
  and a real Settings page (`91cd8e9`).
- The knot as a wide reading sheet and the "Door" sign-in (`1755c90`).
- One Prisma client per Worker request, so one stalled request can't hang the rest (`0f916be`).
- Responsive pass at every screen size, name editing, project rename and delete (`d0908ed`).

## 2026-09-29: Reliability ("ship-blockers"), Tree view, Red Thread design
- D1 migrations `0001`/`0002`: run history table, structured event columns, rate-limit table (`a557025`).
- Per-IP rate limits on sign-up, sign-in and verify, and orphaned projects can no longer be claimed (`b69a489`).
- Server-side input caps (`2bdc048`).
- Immutable run history, atomic daily quota that counts successful runs only, and stuck-run recovery (`d881cd7`).
- UI reads structured event columns instead of parsing messages (`1818f15`, `f006fbe`).
- Test suite: lib, migrations, HTTP and Workers smoke tests with a mock LLM (`e4c4c51`).
- Live Tree view with node detail rail (`b9f7726`, `394099a`, `42a61b7`). Its green theme was replaced the same
  night by the Red Thread design: linen paper, serif type, the board as one thread, the tree as a labyrinth
  (`198df71`, `5011443`, `cb53da8`, `05530b5`).

## 2026-09-28
- Reset demo hidden on real accounts, board copy tightened (`81f7f0f`).

## 2026-09-27: First coordination loop, accounts, Cloudflare
- Coordination workspace: projects, agents, dependency-gated tasks, handoffs, a human approval gate,
  activity feed (`4a59acd`).
- Deployed to Cloudflare Workers with D1 through OpenNext and Workers Builds, with email/password accounts
  (`076b7ee`, `378332d`).
- Account settings, project brief on first login, Claude and GPT shown by name (`b27b421` … `ac3d6f4`).
- Fixed a Worker crash (`AsyncLocalStorage.enterWith` is not available on Workers) (`142b4e7`).
- Landing page, shared-context invite, board polish and preview bindings (PRs #1 to #4).
- "Request changes" sends the work back to the draft (`b60b154`). First fix for Worker CPU limit errors (1102) (`8ec0143`).
