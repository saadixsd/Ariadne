# Ariadne Prototype — UI Spec

## Layout

Three columns. This is the whole product thesis on one screen.

```
+--------------------------------------------------------------+
| ARIADNE · Project: Launch landing page      [Shared context] |
+---------------+-----------------------------+----------------+
| AGENTS        | TASKS                       | ACTIVITY       |
|               |                             |                |
| * Scout       | 1 [done] Research positioning| 14:02 Scout    |
|   Claude      |    -> Scout                 |   started...   |
|   idle        |                             | 14:05 Scout    |
|               | 2 [running] Draft landing   |   completed    |
| * Maker       |    copy                     | 14:05 Handoff  |
|   GPT         |    -> Maker · needs #1      |   -> Maker     |
|   working     |                             | 14:09 Maker    |
|               | 3 [pending] Review the copy |   completed    |
|               |    -> Scout · needs #2      | 14:09 Waiting  |
|               |                             |   on YOU       |
|               | 4 [gate] Approve the copy   |                |
|               |    -> YOU · approval gate   |                |
|               |                             |                |
|               | 5 [pending] Build landing   |                |
|               |    page                     |                |
|               |    -> Maker · needs #4      |                |
+---------------+-----------------------------+----------------+
```

- **Agents** (who's here), **Tasks** (the work graph), **Activity** (what's happening now).

## Components

### AgentCard
- Name (Scout / Maker), provider badge (Claude / GPT), role line
- Status dot: green idle, pulsing amber working, gray done
- Click → shows the agent's role + which tasks it's assigned

### TaskCard
- Number, title, status icon (pending / running / awaiting approval / done / failed)
- Agent badge showing who's assigned
- Dependency line: "needs #1, #2" — blocked tasks are visually dimmed
- "Run" button (enabled only when dependencies are done)
- Click → expands to show instructions + output (rendered markdown)

### ActivityFeed
- Reverse-chronological, auto-polling every 2s, auto-scrolls
- Event types with icons: started, handoff, completed, approval_requested, approved, failed
- The **handoff event gets distinct styling** — "Scout's research handed to Maker" is the thesis, make it unmissable
- approval_requested is highlighted — "Waiting on YOU"

### ApprovalModal
- Triggered when a task enters `awaiting_approval` (also a banner in the feed)
- Shows: the agent's full output, which task comes next
- Buttons: **Approve** (green) / **Request changes** (with a note field → task goes back to pending with the note appended)

### ContextPanel (modal/drawer)
- "Shared context" button in header opens the project brief
- Editable textarea + save → updates the brief for all future runs
- Helper text: "Every agent receives this automatically. This is the thread."

## The 60-second demo script

1. Open the project. Point at the two agent cards: "Scout is Claude, Maker is GPT. Different companies, one workspace."
2. Hit Run on task 1. Watch the feed: Scout working → completed.
3. Hit Run on task 2. Point at the handoff event: "Maker just received Scout's research as input. That's the coordination."
4. Run task 3, then task 4 hits the approval gate. "Nothing ships without the human."
5. Approve. Task 5 unlocks. Run it. Landing page HTML appears.
6. Close: "I was the middleware. Now I'm the approver."
