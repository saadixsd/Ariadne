# Ariadne V1 Plan — the build users test

## 1. Product model (locked for V1)

**Ariadne removes the human middleware between AI agents.** Not: agents chat with each other.

Three separate problems, three answers already in the build:

| Problem | Question | Ariadne's answer (V1) |
|---|---|---|
| Routing | Who works next? | Tasks + dependencies |
| Context transfer | What does the next agent need? | Handoffs (output → next prompt) |
| Judgment | Is the work good enough? | Human approval gate |

The human remains the judge/director. V1's thesis test, in one question:

> **"Would I rather do this through Ariadne again, or just open Claude and GPT myself?"**

If the answer is Ariadne — specifically "holy shit, I don't want to go back to copy-pasting manually" — we have something. If it's "meh," the problem isn't painful enough or we're automating the wrong part. Both answers are useful; only the first one justifies V2.

## 2. V1 scope — definition of done

V1 is done when a user who has never seen Ariadne can, unaided:

1. Open it and understand what's happening within 60 seconds
2. Run a full 5-task workflow end-to-end (either seeded project)
3. Feel the handoff moment ("oh shit, it moved the work")
4. Approve work or request changes with a note
5. Re-run a task to iterate (dependents cascade back to pending)
6. Submit feedback without leaving the app
7. Switch between the two seeded projects

## 3. Phase A — Harden (Cursor)

No new features. Paste into Composer after the current build is verified:

```
V1 HARDENING — no new features.

1. Verify the full Scout → Maker → Scout → You → Maker loop end-to-end
   with real Anthropic/OpenAI calls. Fix what's broken. This is the job.

2. THE HANDOFF IS THE STAR. When a task completes and its output feeds
   the next agent, this must be unmistakable, not a feed line-item:
   - A gold handoff card in the activity feed: "HANDOFF — Scout's
     research → Maker", showing a structured preview of what's being
     passed (key points as chips), full document one click away.
   - Animate the thread line between the two task nodes lighting up gold.
   - The user must feel: "oh shit, it moved the work."

3. PER-TASK RE-RUN WITH CASCADE INVALIDATION. Re-running a task sets it
   and all its dependents back to pending. The board must show what will
   be invalidated before confirming. (Without this, iteration is
   impossible and the beta missions are lies.)

4. AUTO-ASSEMBLE THE APPROVAL PACKET. When the review task completes,
   the approval task enters awaiting_approval automatically — no manual
   Run press on the human's own task. The human's first click is Approve.
   No model is called, so this doesn't violate "Run means run."

5. LIVE ELAPSED TICKER on running tasks ("Scout working · 34s").
   Dead air kills demos.

6. SEED A SECOND PROJECT: "Ariadne market research" — Scout researches
   competitors/market → Maker synthesizes into opportunities → Scout
   critiques weak assumptions → You approve/redirect → Maker produces
   the product plan. Add a minimal project switcher in the header
   (dropdown is fine).

DO NOT BUILD: new providers, agent chat, autonomous planning, workflow
builder UI, accounts, billing, deploy, judgment automation.
```

Acceptance: the 60-second demo script (04_UI_SPEC.md) runs clean twice in a row on both projects.

## 4. Phase B — Dogfood (you, ~1 week)

Run the "Ariadne market research" project for real — actual competitive research you'd use, not a demo.

**Daily log (one line each):**
- What worked without thinking
- What annoyed me
- "Why am I still manually doing X?" moments → this list is the V2 backlog

**Success criteria:**
- The workflow completes unaided
- The outputs are genuinely useful (would you have paid a researcher for this?)
- You can name 3 specific manual pains it removed

**Kill criteria (equally valuable):**
- "Meh, I could've copy-pasted this myself" → the workflow isn't painful enough, or we're automating the wrong part. Change the workflow, not the product. Do not add features to fix a workflow problem.

## 5. Phase C — Five builders (~2–3 weeks)

**Who:** builders already running 2+ AI agents in real work. Not AI-curious tourists — people with the middleware pain today.

**Protocol per builder:**
1. Mission 1: run a full workflow unaided — where did you get stuck?
2. Mission 2: edit the shared brief, re-run an early task — did the agents notice?
3. Mission 3: tell us the one thing you'd use this for in your real work.
4. Comparison walkthrough: "show me how you do this today without Ariadne."
5. The money question: "if this existed for your workflow, what would it be worth?"

**Measure:** time-to-first-value (<5 min target), unaided completion rate, the comparison answer, willingness-to-pay signals. Not feature requests, not compliments.

**Go / no-go (from the fundraising strategy):**
- GO: repeated use in one workflow + at least one credible willingness-to-pay signal → plan V2, start investor coffee chats with evidence.
- NO-GO: no repetition or no pay signal → the thesis needs rework before any fundraising conversation.

## 6. Explicitly out of V1

Agent-to-agent chat · autonomous planning · new providers (Gemini, Codex, Perplexity…) · workflow builder UI · accounts/teams · billing · judgment automation · deploy. Anything on this list proposed during V1 gets written down and parked.

## 7. Roadmap after V1 (evidence-gated, not demo-gated)

- **V2 — Iteration loops.** Trigger: dogfood/beta repeatedly shows "I want Maker to revise after Scout's critique without resetting." Auto re-run on critical review; review triage ("major issue found → revise automatically, minor → surface to human").
- **V3 — Orchestration.** Trigger: V2 proves iteration valuable and users ask "what should happen next?" System proposes next steps; human still approves.
- **Never on the roadmap because it demos well:** agent debate chat. Only if evidence demands it.

Each stage is gated on the previous stage's evidence. No stage gets built because it sounds like "real" multi-agent collaboration.
