# Cursor Prompt — Ariadne UI Build

Paste this into Cursor Composer **after** completing build-plan steps 1–3 and 6 (backend: scaffold, API routes, agent runner, approval logic). This prompt replaces build-plan steps 4, 5, and 7 with a single research-grounded UI pass.

Use **Auto mode** (unlimited) — only switch to a frontier model manually if the agent gets stuck on a genuinely hard problem.

---

```
@00_START_HERE.md @01_VISION.md @02_PROTOTYPE_SCOPE.md @03_ARCHITECTURE.md @04_UI_SPEC.md

Build the complete Ariadne frontend for the existing Next.js + Prisma backend.
The API routes from 03_ARCHITECTURE.md already work. Do not touch the backend
except to add the small feedback endpoints specified below.

## DESIGN LANGUAGE (from 04_UI_SPEC.md — follow exactly)

Dark-first mission control, warm not cold. NO generic purple-AI-dashboard look:
no left nav sidebar, no rounded card grids, no purple accents.

Design tokens (Tailwind theme extension — no hardcoded colors anywhere):
- bg-base #09090B, bg-panel #101014 (ring-1 ring-white/10), bg-raised #18181D
- thread #F59E0B, thread-bright #FBBF24  ← the Ariadne "thread" accent
- ink #F4F4F5, ink-dim #A1A1AA
- ok #4ADE80, working #FBBF24 (pulsing), danger #F87171, gate #F59E0B

Typography: Inter for UI, JetBrains Mono for timestamps, agent outputs, data.
Motion: transform/opacity only, fade-up entrances with 50ms stagger,
prefers-reduced-motion respected. No bounce animations.

THE THREAD MOTIF (the product's visual identity): the workflow is a vertical
timeline where task nodes are connected by a continuous 2px line — gold where
work has flowed through, dim zinc-800 where pending. This line IS Ariadne's
thesis made visible. Make it beautiful.

## LAYOUT (desktop-first, responsive down to 390px)

Header: ARIADNE wordmark · project name · Beta badge (click → popover listing
honest beta limitations) · "Give feedback" button · Shared context button ·
settings menu (contains "Reset demo" → re-seeds the project).
Sub-header strip: one-line live status, e.g. "You're coordinating 2 agents ·
3 of 5 tasks complete."

Three columns:
1. AGENTS (narrow): AgentCard per agent — name, provider badge (Claude/GPT),
   role line, status dot (green idle / pulsing amber working / gray done).
   Click → popover with role + assigned tasks.
2. WORKFLOW RAIL (hero, widest): vertical thread timeline of task nodes.
   Each node: status icon (○ pending · pulsing ◉ running · pulsing gold ◆
   awaiting approval · green ● done · ✕ failed), title, agent badge,
   dependency labels ("needs #1, #2"), Run button (disabled until
   dependencies are done). Click node → expands inline: instructions +
   markdown-rendered output. Failed nodes show the error + Retry + Copy error.
3. ACTIVITY (narrow, collapsible): BetaMissions card on top (dismissible),
   then ActivityFeed — reverse-chronological, polls
   GET /api/projects/[id]/events every 2s, auto-scrolls. Handoff events get
   the gold thread styling (unmissable). approval_requested renders as a gold
   banner: "Waiting on YOU" + Review button opening the ApprovalModal.

## WELCOME (first-run — the empty state is never a void)

The demo project is pre-seeded, so first value lands in under 2 minutes.
- WelcomeOverlay on first visit (localStorage flag, dismissible, NEVER
  blocking): headline "You're the conductor now.", one-line explainer,
  3-step checklist (1. Meet your agents  2. Run your first task
  3. Approve a handoff) with progress, CTA "Run the demo" that scrolls to
  task 1 and pulses its Run button.
- Footer/context-panel disclosure (persistent, subtle): "Scout and Maker are
  AI agents and can make mistakes. Nothing ships without your approval."
- Contextual one-line hints at moment of need (e.g. first blocked task),
  dismissible.

## BETA KIT

- Feedback: Prisma model Feedback { id, kind (bug|idea|confusing), message,
  createdAt }, POST /api/feedback, minimal GET /feedback inbox page.
  FeedbackModal: kind selector + textarea → success state "Thanks — you're
  shaping Ariadne."
- BetaMissions card: 3 missions with localStorage checkboxes —
  (1) "Run the full workflow unaided — where did you get stuck?"
  (2) "Edit the shared context, re-run task 1 — did the agents notice?"
  (3) "Tell us the one thing you'd use this for in real work."
- Error states never dead-end: missing API keys → top banner with exact
  setup steps; every failure shows what happened + what to do next.
- Empty states carry actions ("Run task 1 to see Scout think.").

## MODALS

- ApprovalModal: full agent output, "Approving unlocks task 5: Build landing
  page", Approve (gold) / Request changes (+ note field → back to pending
  with note appended). Must feel weighty — this is the trust cue.
- ContextPanel drawer: view/edit project brief, helper text "Every agent
  receives this automatically. This is the thread."

## BUILD ORDER (verify in browser after each)

1. Theme tokens + app shell (header, sub-header, 3-column grid)
2. Agents column
3. Workflow rail with thread line + task nodes + expand + Run wiring
4. Activity feed with polling + event styling
5. ApprovalModal wired to the existing approve API
6. ContextPanel drawer
7. WelcomeOverlay + BetaMissions + FeedbackModal + feedback API/inbox
8. Polish checklist from 04_UI_SPEC.md

## ACCEPTANCE CRITERIA

- The 60-second demo script in 04_UI_SPEC.md runs clean twice in a row.
- A first-time viewer understands what's happening within 60 seconds.
- Every button works. Zero placeholder text, zero "coming soon".
- Skeleton loaders on async regions; focus-visible rings everywhere;
  error boundary around feed + rail; 1280px and 390px both clean.

## DO NOT BUILD

No left nav sidebar. No chat interface. No purple accents. No auth,
no multi-user, no billing. Do not redesign the backend.
```

---

**After it builds:** run the 60-second demo script from `04_UI_SPEC.md` yourself, then hand it to one builder friend with the three beta missions. Their confusion list is your phase-2 roadmap.
