# Ariadne Prototype — Build Plan

Work in order. Verify each step in the browser before moving on. Suggested model per step: **Auto** = unlimited, free; **Credits** = spend your $20 pool deliberately.

## Step 1 — Scaffold (Auto)
**Goal:** Next.js + Tailwind + Prisma/SQLite running, env wired, seed one demo project.

**Prompt:**
> @00_START_HERE.md @03_ARCHITECTURE.md Scaffold a Next.js 14 App Router + TypeScript + Tailwind project. Set up Prisma with SQLite using the schema in 03_ARCHITECTURE.md and run `prisma db push`. Create `.env.example` with the vars listed there. Add a seed script that creates one project ("Launch landing page") with the brief from 02_PROTOTYPE_SCOPE.md, two agents (Scout/anthropic, Maker/openai), and the five tasks with dependencies and the approval gate on task 4.

**Done when:** `npm run dev` loads, seed runs, DB has 1 project / 2 agents / 5 tasks.

## Step 2 — Data API (Auto)
**Goal:** All API routes from 03_ARCHITECTURE.md working.

**Prompt:**
> @03_ARCHITECTURE.md Implement the API routes table as Next.js Route Handlers. `POST /api/tasks/[id]/run` should validate dependencies (409 if unmet) but stub the AI call for now — return canned output and mark done. I'll wire real providers in step 3.

**Done when:** You can create/run/approve tasks via curl or the browser and statuses transition correctly.

## Step 3 — Agent runner (Credits)
**Goal:** Real OpenAI + Anthropic calls with prompt composition (role + shared context + handoff inputs).

**Prompt:**
> @03_ARCHITECTURE.md Implement `lib/agents.ts` `runTask()` exactly per the spec: load task/agent/project, check dependencies, compose the prompt with system role + shared context block + handoff block from dependency outputs, call the provider SDK server-side (model from env), save output, emit activity events, set status to done or awaiting_approval. Wire it into `POST /api/tasks/[id]/run`, replacing the stub. One naive retry on provider error.

**Done when:** Running task 1 produces real Claude output saved to the DB; task 2's prompt visibly contains task 1's output.

## Step 4 — Task board + agent roster (Auto)
**Goal:** The left two columns per 04_UI_SPEC.md.

**Prompt:**
> @04_UI_SPEC.md Build the dashboard layout: header with project name + Shared context button, Agents column (AgentCard per spec), Tasks column (TaskCard per spec with status icons, dependency labels, Run buttons enabled only when dependencies are done). Data from `GET /api/projects/[id]`. Clicking a task expands instructions + rendered output.

**Done when:** The board renders seeded data; Run buttons enable/disable correctly.

## Step 5 — Activity feed (Auto)
**Goal:** Live right column, polling every 2s.

**Prompt:**
> @04_UI_SPEC.md Build the ActivityFeed component per spec: reverse-chronological events from `GET /api/projects/[id]/events`, polling every 2 seconds, auto-scroll, distinct styling for handoff events and approval_requested. It must update live while a task runs — no page refresh.

**Done when:** Running a task shows started → completed events appearing live.

## Step 6 — Approval flow (Credits or Auto)
**Goal:** The human gate works end-to-end.

**Prompt:**
> @03_ARCHITECTURE.md @04_UI_SPEC.md Implement the approval flow: when a task with requiresApproval completes, status becomes awaiting_approval and an approval_requested event fires. Build the ApprovalModal showing the output with Approve / Request changes (+ note field). `POST /api/tasks/[id]/approve` handles both: approve emits approved and unlocks dependents; request-changes returns the task to pending with the note appended to instructions.

**Done when:** Task 4 blocks task 5 until you click Approve in the modal.

## Step 7 — Context panel + polish + demo (Auto)
**Goal:** Editable shared context, visual polish, demo-ready.

**Prompt:**
> @04_UI_SPEC.md Build the ContextPanel drawer (view/edit project brief, saved via API). Then polish: empty states, loading skeletons on Run, error toasts on failed runs, and a "Reset demo" button that re-seeds the project. Walk the 60-second demo script from 04_UI_SPEC.md and fix anything that breaks the narrative.

**Done when:** The demo script runs clean end-to-end.

## After the build

Run the demo for yourself, then put it in front of one builder friend. Watch what they ask for — that list is your phase-2 roadmap.
