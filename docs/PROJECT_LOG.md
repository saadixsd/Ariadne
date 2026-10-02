# Ariadne project log

## 2026-09-27 — Phase 1 coordination loop

### Start state

The repo had one commit (`debe71b`, Initial commit) and only `README.md` and `LICENSE`. No app, database, or agent code. Muse’s build pack was the implementation spec. Coordination is the product; this session only builds the first loop.

### What changed

- Copied the Muse pack into `docs/muse/` (`00` through `05`).
- Scaffolded Next.js 16 App Router, TypeScript, and Tailwind. No shadcn.
- Added Prisma + SQLite (`Project`, `Agent`, `Task`, `ActivityEvent`), plus task `startedAt`, `completedAt`, and `model` for instrumentation.
- Seeded **Launch landing page**: Scout (`anthropic`), Maker (`openai`), You (`human`), and the five prototype tasks. Task 4 requires approval and blocks task 5.
- Server routes for projects, tasks, run, approve, events, shared-context save, and demo reset. Provider keys stay in `.env`.
- `lib/agents.ts` `runTask()` composes role, project brief, and `## Input from {agent} ({task}): {output}` for each finished dependency, calls Anthropic or OpenAI with `ANTHROPIC_MODEL` / `OPENAI_MODEL`, and retries a provider error once.
- A human agent does not call a provider. Run packages the dependency chain (research, draft, and review), sets `awaiting_approval`, and emits `approval_requested`. Approve marks the task done. Request changes returns it to `pending` and appends the note to its instructions.
- Dashboard: agents, dependency-gated tasks, activity polled every 2 seconds, approval modal, shared-context drawer, and reset.

### What was verified

- Seed: 1 project, 3 agents, 5 tasks. `npm run dev` serves http://localhost:3000.
- `POST /api/tasks/:id/run` returns 409 when a dependency is not done (tasks 2 and 5 on a fresh seed).
- Human gate with fixture dependency output: task 4 reached `awaiting_approval` in about 0.16s, model `human`, package included the draft and the review. Task 5 stayed 409. Request changes appended `Human requested changes: …` and set the task back to `pending`. Approve set task 4 to `done` and task 5 became runnable.
- Live providers, using the models in `.env`: Scout via Claude and Maker via GPT. Server-side prompt checks reported each dependency output included in the next prompt. Task 5 rendered a single-file HTML preview.
- Browser, desktop width: seeded board; Run enabled only for task 1 until earlier tasks were done; shared context saved and closed; activity showed started, a distinct handoff, completed, and Waiting on YOU while a run was in flight; the approval modal blocked task 5; Approve unlocked task 5; the landing-page iframe appeared. All five tasks ended `done`.

Task 1’s Claude reply asked for more competitor context instead of five positioning angles. The handoff still carried that text into Maker’s draft, and the rest of the loop completed.

### Decisions

- v0.1 database is SQLite, as in the Muse architecture. Postgres or Cloudflare D1 is a later connection change.
- No login. One human. Agents are rows, including provider `human`.
- Handoffs and approvals are task state plus activity events, not separate tables.
- AI prompts receive direct dependencies. The human approval packet walks the finished chain so the draft and the review are both on screen.
- Run is enabled for `pending` and `failed` tasks whose dependencies are `done`. A finished task is not run again from the board.
- `POST /api/projects` seeds Scout, Maker, and You. The five-task demo comes from the seed and from Reset demo.

### What is left

- Cloudflare deploy, and any move off the local SQLite file.
- Phase 2 from the Muse scope: auth, teams, more projects, workflow builder, IDE agents, billing.
- Optional: tighten task 1’s instructions if Scout should name competitors without asking.

The dev server from this session is http://localhost:3000. Reset demo clears outputs and activity on the seeded project.

## 2026-09-27 — Mission-control workspace UI

### What changed

The board is now the dark mission-control layout from `docs/muse/04_UI_SPEC_V2.md` (copied with `docs/muse/06_CURSOR_UI_PROMPT.md`). The landing-page workflow is still the starting example, and it stays a workspace the user drives.

- Header: wordmark, project name, Beta limitations, Give feedback, Shared context, and Settings. Reset demo lives in Settings and states that it does not call Claude or GPT.
- Status line counts the two model agents and how many tasks are done. On a fresh board it says nothing runs until you press Run. If every task is already done, it tells you to read the outputs or reset, and that reset does not call the models.
- Agents column with provider badges and a popover of role plus assigned tasks. Workflow rail with the gold/dim thread, dependency labels, and Run only when dependencies are done. Finished tasks stay Done and are not run again. Activity polls events every 2 seconds, with gold handoffs and a Waiting on YOU review banner.
- Shared context edits the project name and brief. Saving does not start a run. Home loads the earliest project, so a renamed project still opens.
- First-visit welcome, dependency hint, beta missions, and the AI disclosure. "Run the demo" only scrolls to task 1 and highlights Run.
- Feedback: `Feedback` model, `POST /api/feedback`, and `/feedback`. Missing provider env vars show a setup banner. Route error page plus error boundaries around the rail and the feed.

The coordination loop is unchanged. Seed, page load, and reset only write SQLite. `POST /api/tasks/:id/run` and approve/request-changes are still the only paths that call a provider or record a human decision.

### What was verified

- `npx tsc --noEmit` and eslint on the UI and feedback route passed.
- Browser, 1280px: three columns (agents, workflow, activity). Task 1 instructions expand without a run. Task 1 Run is enabled; tasks 2–5 are disabled. Scout’s popover lists assigned tasks. Shared context shows the name and brief; Save stays disabled until something changes. Give feedback opens Bug / Idea / Confusing and does not send unless you submit.
- "Run the demo" did not call `/api/tasks/:id/run`. After that click the board was still 0 of 5 complete.
- Recorded fetches during the session were event polls, one Next.js dev-tools request, and `POST /api/projects/:id/reset`. No `/run`. Server logs show no new `[ariadne]` provider prompts during this pass. The earlier prompt lines are from the previous coordination test.
- Reset returned 5 pending tasks, empty outputs, and 0 activity events. Project name stayed Launch landing page.
- 390px: header wraps, welcome and agents stack, workflow follows. Page load and `/feedback` both returned 200.
- A Next.js hydration warning appeared in the browser tools. The diff was an injected `data-cursor-ref` attribute, not an app mismatch.

### What is left

- A paid five-task run was not repeated. Approve, handoff styling, failure retry, and the landing-page preview are wired but were not exercised on a live model call in this pass.
- A finished task cannot be run again from the board. Mission 2 (edit the brief, re-run task 1) needs Reset demo, then an explicit Run.
- Cloudflare, auth, extra providers, and an autonomous planner are still out of scope.
- Opening an agent card used to write the welcome flag inside a state update and warned in the console. That write now happens after the click.
- Agent details used to float over the next card, so the assigned tasks sat behind the role text. They now open inside the card and push the next agent down.

## 2026-09-27 — Phase A harden

### What changed

- Handoff events are gold cards: who sent the document, who received it, up to three chips taken from the saved output, and the full document one click away. No extra model call. The thread segment into that task lights gold.
- Re-run asks first, names every step that will lose its output, then clears those steps and runs only the chosen task.
- When a review finishes, the human approval task opens by itself with the finished chain packed in. It does not call Claude or GPT.
- A running task shows a live timer, such as “Scout working · 0s”.
- A second seeded project, Ariadne market research, and a project dropdown in the header. Reset restores the template you are on.

### What was verified

- Browser: both projects are in the dropdown. Handoff cards and Full document are on the finished landing run. Re-run on task 1 lists tasks 1–5 and Cancel does not call a model. Pressing Run on the review shows “Scout working · 0s”.
- API, twice on each project: reset, run tasks 1–3, approval is already `awaiting_approval` with model `human` and an assembled packet, approve, run task 5. All five tasks ended done. Each pass recorded 6 handoff events.
- Cascade: re-running “Draft landing page copy” left research done, redrafted the copy, and returned review, approval, and build to pending with empty outputs.

### What is left

- Phase B is yours: use Ariadne market research for real and write down the pains.
- Phase C is the five builders. Agent chat, new providers, a planner, accounts, billing, and deploy stay parked.

## 2026-09-27 to 2026-09-30 — Catch-up (reconstructed from git history)

These sessions were not logged at the time. This entry is rebuilt from the commits; see `git log` for the detail.

- **Accounts and Cloudflare (Sep 27).** Email/password auth with hashed sessions, the D1-backed Worker on `ariadne.sr-labs.workers.dev` via OpenNext and Workers Builds, preview-branch bindings, the mandatory "What are you making?" project dialog for new accounts, and the first-page CPU fix for error 1102.
- **Tree view (Sep 29).** A live Board ⇄ Tree switch, a node detail rail, hover previews and a next-step line. The green-and-white theme shipped here was replaced the same night (below). The "Beta" badge was removed.
- **Ship-blockers (Sep 29).** `migrations/0001`–`0002` (baseline, `TaskRun`, structured event columns, `RateLimit`); per-IP rate limits on sign-up, sign-in and verify; no more claiming of unowned projects; server-side input caps (brief 5,000, title 200, instructions 5,000, note 2,000); immutable run history; a success-only atomic daily quota of 10 model runs; lazy stuck-run recovery after 5 minutes; UI parsers that read structured event columns instead of message text; the `tests/ship-blockers` suite.
- **Red Thread redesign (Sep 29–30).** Linen paper, serif type, a red thread and gold knots. The Board is one thread with handoff beads, and a single knot panel replaced the duplicate Activity cards. The Tree is drawn as a labyrinth from the door to the deliverable. Times print only after hydration.
- **Phase 2 (Sep 30).** Scout/Maker renamed Odysseus/Daedalus (`migrations/0003`); the Tree laid out from real dependencies; adaptive polling with ETag/304; typeset output with a Reader; a Socratic question at each knot; a real Settings page in place of Reset demo. Then the knot as a wide reading sheet, the Door sign-in, one Prisma client per Worker request, real server errors in toasts, a responsive pass, name editing, and project rename/delete.

## 2026-10-01 — V1 hardening for real users (branch `cleanup/v1-hardening`)

Spec: `docs/muse/22_CLAUDE_CODE_CLEANUP_BRIEF.md` and `CLAUDE.md` (the standing project brief, now at the repo root).

### Start state

Baseline before any change: lib 13/13, Phase 2 17/17, migrations 4/4, dev-server HTTP 10/10. `next build` passed with zero warnings once a corrupt Turbopack cache (`.next/cache/turbopack`) was cleared. `npm run lint` ran out of memory because eslint walked the generated `.open-next/` and `.wrangler/` bundles; linting the source folders gave 0 errors and 9 warnings (all `no-location-assign-relative-destination`).

### What changed

- **Launch-bar copy.** A repo grep of shipped code (`app components lib proxy.ts public` and config) for beta, alpha, preview, experimental, coming soon, under construction, lorem ipsum and TODO found no user-visible hits. "preview" survives only in internal identifiers (`previewChips`, `artifactPreview`, `lib/html-preview.ts`); the one visible use, the generated-page iframe title "Page preview", is now "Generated page".
- **Intro card removed.** `components/WelcomeOverlay.tsx` ("You hold the thread.", the 3-step checklist) is deleted, along with every `ariadne.welcome.*` localStorage read and write, the step auto-complete wiring (the agents-met flag, ran-task and approved checks), the "Show me the first step" Run pulse (`pulseRunId`, `.pulse-run`), and the checkbox helpers in `client-storage.ts` that only it used. None of it was load-bearing. The "What are you making?" dialog is unchanged.
- **Internal copy out of user UI.** The feedback success dialog no longer names the `/feedback` route. The missing-keys banner no longer tells users to edit `.env` and restart `npm run dev`. The "Project unavailable" and "No project yet" screens no longer say "run the seed again"; both now have working buttons.
- **Brief cap is 5,000 everywhere.** Onboarding used 4,000; it now uses `MAX_BRIEF_CHARS` and `assertMaxLength` like every other route, and the project dialogs cap their inputs at the same limits.
- **Domain.** `ariadneagents.si` was already routed to the Worker (`ariadneagents.si/*`); `www.ariadneagents.si` showed the registrar's parking page and now has its own route. Both routes are recorded in `wrangler.jsonc`.
- **Email verification stays off.** The founder decided not to set up company email or a paid plan yet. The code is ready: add a `send_email` binding named `EMAIL` and an `EMAIL_FROM` var once the domain is onboarded to Cloudflare Email Service (Workers Paid is required to email arbitrary sign-ups). A rejected send now rolls the sign-up back with a readable 503 instead of leaving a half-created account behind a 500.
- **Failure paths.** An expired session sends the board or Tree to `/sign-in`; a deleted project sends it to the user's next project; coming back online polls at once. A provider failure (502) shows "Claude or GPT returned an error instead of an answer" in the toast while the raw error stays on the frayed step beside Copy error. A used-up quota no longer says "press Retry", names midnight UTC, and drops the runs meter to 0. Error bodies that are not JSON no longer masquerade as "could not reach the server". A root `app/global-error.tsx` covers a crash in the root layout.
- **No decorative controls.** The active Board/Tree segment is a label, not a link that reloads the page. The failed step's button is announced as "Respin", matching what it shows.
- **Docs.** `MIGRATIONS.md` now exists (the production D1 pre-step that `migrations/0001` cites). The `ORCHESTRATION_DESIGN.md` citation in `lib/reclaim.ts` is gone: that design was never written and the async engine is parked.
- **Lint.** eslint ignores `.open-next/` and `.wrangler/`, so `npm run lint` finishes.

Untouched: the run pipeline (`lib/agents.ts`), board and tree logic, quota semantics (10 model runs per user per UTC day), run history, stuck-run recovery, and sign-up throttling.

### What was verified

- After the changes: lib 13/13, Phase 2 17/17, migrations 4/4, HTTP 10/10; `tsc` clean; lint 0 errors and the same 9 warnings as the baseline; the build has zero warnings.
- A headless-Chromium audit (Playwright, local mock LLM) passed 35/35 checks:
  - **Sign-up and board:** fresh sign-up → "What are you making?" → board with no intro card, even with stale `ariadne.welcome.*` keys planted. Name-only Continue shows an inline error; the button never sticks on "Starting".
  - **Launch-bar copy:** no banned words on any screen.
  - **Dead ends:** every button, link, menu item and tab on the board, Tree and Settings (fresh and finished projects) does something visible.
  - **Full workflow:** research → draft → review → knot → produce, with produce locked until you tie off.
  - **Failure paths:** model failure, quota at 10/10, offline and reconnect, expired session and deleted project all end on a readable message or the right page, never a blank screen. No console errors throughout.
- Deployed preview (`https://cleanup-v1-hardening-ariadne.sr-labs.workers.dev`, Workers Builds, production D1), real models, 22/22:
  - **Sign-up and board:** fresh sign-up → "What are you making?" → board with no intro card and no missing-keys banner.
  - **Full workflow:** research, draft and review each spun with a real Claude or GPT call (about 8s each). The knot opened by itself and produce stayed locked until tie-off. Tying off used no daily run; produce spun; the meter read 6/10 (4 model runs).
  - **Navigation and errors:** Board ⇄ Tree works both ways. No banned words; no page or console errors.
- Previews do not inherit production secrets. `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are now set in the Previews base config (`wrangler preview base-config secret put`), so every branch preview can call the models.
- One lib test (`3. stuck running recovery`) fails during the first 10 minutes after midnight UTC. It simulates a run that started 10 minutes earlier, so the code correctly releases that run's quota on yesterday's UTC day while the test reads today's. It passed again at 00:11 UTC. The fault is in the test, not the code.

### What is left

- Email verification: when there is company email, onboard `ariadneagents.si` to Cloudflare Email Service (Workers Paid is required for arbitrary recipients), then add `"send_email": [{ "name": "EMAIL" }]` and `EMAIL_FROM` to `wrangler.jsonc` (production and previews).
- The repo lives under iCloud-synced `~/Documents`, which leaves " 2" conflict copies in `.next/cache/turbopack` and breaks `next build` until that folder is deleted. Moving the repo out of iCloud (or excluding `.next`) fixes it for good.
- Not fixed in this pass: the midnight-UTC edge case in the stuck-run test.

## 2026-10-02 — 390px layout pass

### What changed

- **The Tree's detail rail is a full-screen sheet below `lg` (1024px).** At 390px it was stacked under the canvas and squeezed into the bottom of the screen, which cut its pinned footer in half: "Tie off (Approve)" and "Ask for changes" sat partly off-screen, so a knot could not be decided from the Tree on a phone. It now covers the screen like the board's knot sheet, follows the visual viewport so the footer stays above the phone keyboard (the knot sheet's `useVisualViewportBox`, now exported), and closes with Esc ✕. From `lg` up it is the same side rail as before.

### What was verified

- A headless-Chromium check at 390×844 (iPhone 13 emulation) covers sign-up, "What are you making?", the board (fresh, with a spun step expanded, and with the knot tucked into the column card), the knot sheet (top, scrolled to the end, note focused), the Tree, the Tree rail on a knot, and Settings. On each screen it checks for sideways page scroll, for anything cut off at the screen edge outside an intentional scroller, and for visible controls drawn over each other. It also checks that the Tree rail's Tie off button is fully on screen and that Esc closes the sheet.
- Before the fix, on the deployed preview with real models: everything passed except the Tree rail. Its footer was cut off (confirmed by screenshot); the other overlaps the first check reported were controls hidden under a sheet or scrolled under the header, and the check now ignores those.
- After the fix (local, mock models): 38/38 at 390px, and 38/38 at 1440px, where the rail is unchanged.
- lib 13/13, Phase 2 17/17, migrations 4/4; lint 0 errors with the same 9 baseline warnings; build with zero warnings.
- Each push to an existing branch preview creates a deployment without that preview's secrets (Workers Previews, open beta); only new previews start from the base config. Re-run `wrangler preview secret put <KEY> --name <branch>` after a push when a preview needs to call the models.

### Shipped

- `cleanup/v1-hardening` fast-forwarded to `main` (`9b0d2a0`). Workers Builds deployed it to production at 2026-10-02 00:32 UTC.
- The same 390px check against `https://ariadneagents.si`, with real models: 38/38. The check covers sign-up, the board with no intro card, the knot, and the Tree rail as a full-screen sheet with its footer on screen. `www.ariadneagents.si` and `ariadne.sr-labs.workers.dev` also serve the app.
- All six `smoke-test-v1-…@ariadneagents.si` accounts created during this pass were deleted from production D1 by exact id. The cascade left no orphaned tasks, runs, agents or events, and the real accounts are untouched.
- Today's checks also tripped the sign-up throttle (5 sign-ups per IP per hour); it answered 429 with Retry-After, as designed.
