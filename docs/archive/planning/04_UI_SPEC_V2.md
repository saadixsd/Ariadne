# Ariadne Prototype — UI Spec v2

Supersedes the v1 layout. Informed by current research on agent-dashboard UX (Wavespace "Beyond the Chatbox" framework, Sep 2026; mission-control interface patterns) and SaaS beta onboarding best practices. Grounded principles:

- **One control plane.** Live status + task flow + activity in one screen, not split across pages.
- **Design for state, not messages.** Show what each agent is doing and what needs the human — not chat logs.
- **Explicit trust cues.** Human approval/handoff points are visually unmissable; honest "agents can make mistakes" disclosure.
- **Aha in under 5 minutes.** Seeded demo + guided checklist, never an empty void or a blocking tour.
- **Borrow clarity, not panel count.** Dense and calm, not a wall of widgets.

## Design language

Dark-first "mission control," but warm — never the generic purple-AI-dashboard look.

**The thread motif.** Ariadne's thread is the visual identity: a continuous line connecting task nodes in the workflow, gold where work has flowed through, dim where it hasn't. This one motif makes the product instantly recognizable.

**Tokens** (no hardcoded colors anywhere):

| Token | Value | Use |
|---|---|---|
| `bg-base` | `#09090B` | App background |
| `bg-panel` | `#101014` | Column panels, `ring-1 ring-white/10` |
| `bg-raised` | `#18181D` | Cards, modals |
| `thread` | `#F59E0B` (amber-500) | The thread line, handoff events, primary actions |
| `thread-bright` | `#FBBF24` | Highlights, pulses |
| `ink` | `#F4F4F5` | Primary text |
| `ink-dim` | `#A1A1AA` | Secondary text |
| `ok` | `#4ADE80` | Done / idle |
| `working` | `#FBBF24` pulsing | Agent running |
| `danger` | `#F87171` | Failed |
| `gate` | `#F59E0B` solid | Approval gates — always gold, always obvious |

**Typography:** Inter for UI labels; JetBrains Mono for timestamps, agent outputs, and all data. Tight headings (`leading-1.25`), relaxed body (`leading-1.5`).

**Motion:** transform/opacity only; entrances fade-up with 50ms stagger; status changes get a soft pulse. All wrapped in `prefers-reduced-motion`. No bounce, no cards-in-cards.

## App shell & layout

```
+------------------------------------------------------------------+
| ARIADNE  ·  Launch landing page        [Beta] [Shared context] [⚙] |
| You're coordinating 2 agents · 3 of 5 tasks complete             |
+----------------+-------------------------------+-------------------+
| AGENTS         | WORKFLOW RAIL (hero, widest)  | ACTIVITY          |
| (narrow)       |                               | (narrow)          |
|                |  ●━━━●━━━○━━━◉━━━○  thread   | Beta missions     |
| Scout card     |  1  2   3   4   5             | ─────────────     |
| Maker card     |                               | live feed         |
|                |  [expanded task detail]       | (poll 2s)         |
+----------------+-------------------------------+-------------------+
```

- **Header:** wordmark, project name, Beta badge (click → "What's beta" popover with honest limitations), Shared context button, settings menu (Reset demo lives here).
- **Sub-header strip:** one-line status — "You're coordinating 2 agents · 3 of 5 tasks complete." The user should never wonder what's happening.
- **Agents column (narrow):** AgentCards with glanceable status dots. Click → role + assigned tasks.
- **Workflow rail (hero):** vertical thread timeline. Nodes connected by the thread line — gold where handoffs completed, dim where pending. Each node: status icon, title, agent badge, dependency label ("needs #1"), Run button (disabled until dependencies done), expands inline for instructions + rendered output.
- **Activity column (narrow, collapsible):** Beta missions card on top (dismissible), then the live feed.

## First-run / welcome experience

The empty state is never a void: the demo project is pre-seeded, so first value lands in under 2 minutes.

- **Welcome overlay** (first visit only, `localStorage`; dismissible, never blocking):
  - Headline: "You're the conductor now."
  - Sub: "Scout (Claude) and Maker (GPT) share one workspace. You assign, they hand off, you approve."
  - 3-step checklist with progress: ① Meet your agents → ② Run your first task → ③ Approve a handoff. Checking off is the onboarding — no tour.
  - CTA: "Run the demo" — scrolls to task 1 and pulses its Run button.
- **AI disclosure** (persistent, subtle, in footer or context panel): "Scout and Maker are AI agents and can make mistakes. Nothing ships without your approval."
- **Contextual hints**, not tutorials: first time a task is blocked, a one-line hint explains dependencies. Dismissible.

## Beta kit (testing handled perfectly)

- **Feedback widget:** persistent header button "Give feedback" → modal with kind selector (Bug / Idea / Confusing) + message field → `POST /api/feedback` → stored in DB (`Feedback` model: id, kind, message, createdAt). Confirmation: "Thanks — you're shaping Ariadne." Founder reads via minimal `/feedback` inbox page.
- **Beta missions** (dismissible card, progress in `localStorage`):
  1. Run the full workflow without any help — where did you get stuck?
  2. Edit the shared context brief, re-run task 1 — did the agents notice?
  3. Tell us the one thing you'd use this for in your real work.
- **Error states never dead-end:** task failure → card shows the error + Retry button + "Copy error" (for pasting into feedback). Missing API keys → top banner with exact setup steps. Every error says what happened and what to do next.
- **Empty states with actions:** no outputs yet → "Run task 1 to see Scout think."
- **Reset demo** in the settings menu: re-seeds the project in one click — essential for repeated beta sessions.

## Components

### AgentCard
Name, provider badge (Claude/GPT), role line, status dot (green idle / pulsing amber working / gray done). Click → popover with role + assigned tasks.

### WorkflowNode (the rail)
Status icon (○ pending · ◉ running (pulsing) · ◆ awaiting approval (gold, pulsing) · ● done (green) · ✕ failed), title, agent badge, "needs #n" dependency labels, Run button. The thread line connects nodes vertically. Expand → instructions + markdown-rendered output + (if failed) error + Retry.

### ActivityFeed
Reverse-chronological, polls `/api/projects/[id]/events` every 2s, auto-scrolls. Event styling: `handoff` events get the gold thread treatment (unmissable — it's the thesis); `approval_requested` gets a gold banner ("Waiting on YOU" + "Review" button opening the modal); failures get red with retry.

### ApprovalModal
Opens from the banner or the gated node. Shows: full agent output, what happens next ("Approving unlocks task 5: Build landing page"). Buttons: **Approve** (gold) / **Request changes** (+ note field → task returns to pending with note appended). This is the trust cue — make it feel weighty, not like a cookie banner.

### ContextPanel (drawer)
View/edit the project brief. Helper text: "Every agent receives this automatically. This is the thread." Save → updates brief for all future runs.

### BetaMissions + FeedbackModal + WelcomeOverlay
As specified above. All dismissible, all progress in `localStorage` except feedback (server-side).

## The 60-second demo script

1. "Scout is Claude, Maker is GPT. Different companies, one workspace." (agent cards)
2. Run task 1. Feed: working → completed.
3. Run task 2. Point at the gold handoff event: "Maker just received Scout's research. That's the coordination — I used to do that by hand."
4. Run 3 → task 4 hits the gold approval gate. "Nothing ships without the human."
5. Approve → task 5 unlocks → run → landing page HTML renders.
6. Close: "I was the middleware. Now I'm the approver."

## Polish checklist (before any beta session)

- [ ] Skeleton loaders on all async regions (no flashing empty panels)
- [ ] `focus-visible` rings on every interactive element
- [ ] Error boundary around feed + rail (one failing component never blanks the page)
- [ ] Works at 1280px and 390px widths
- [ ] `prefers-reduced-motion` respected
- [ ] Every button does something — no placeholders, no "coming soon"
- [ ] Full demo script runs clean twice in a row
