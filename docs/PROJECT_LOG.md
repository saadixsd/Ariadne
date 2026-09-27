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
