# Ariadne Prototype — Start Here

This folder is your build pack for the Ariadne phase-1 prototype. Drop these files into the root of your Cursor project. They are written to be @-mentioned in Cursor so the agent has full context without burning your credits discovering requirements.

## The files

| File | What it is |
|---|---|
| `00_START_HERE.md` | This file — setup + token strategy |
| `01_VISION.md` | What Ariadne is and why it exists (the thesis) |
| `02_PROTOTYPE_SCOPE.md` | Phase 1 scope: the one workflow, in/out of scope |
| `03_ARCHITECTURE.md` | Stack, data model, API routes, agent runner |
| `04_UI_SPEC.md` | The interface: layout, components, demo script |
| `05_BUILD_PLAN.md` | Ordered build steps + copy-paste Cursor prompts |

## Setup checklist

- [ ] Cursor Pro ($20/mo) active
- [ ] Node.js 20+ installed
- [ ] OpenAI API key (platform.openai.com) — pay-per-use, pennies per demo run
- [ ] Anthropic API key (console.anthropic.com) — same
- [ ] These 6 files in your project root

## Your $20 plan, maximized

Your Pro plan has two pools:

1. **Auto mode — UNLIMITED.** Cursor picks the cheapest capable model automatically. Use this as your default for everything.
2. **$20 credit pool — roughly ~225 Claude Sonnet-class requests.** This is your precious reserve. Spend it only on: architecture decisions, getting unstuck on hard bugs, complex refactors.

Tab completions are unlimited and never touch credits — accept aggressively.

### Rules that save credits

1. **Specs before code.** These files exist so Cursor doesn't burn 10 requests discovering what you want. @-mention the relevant spec in every prompt.
2. **One feature per Composer session.** Long sessions bloat context and every follow-up costs more. Finish a step, verify it works, start a fresh session for the next.
3. **Small prompts beat big ones.** "Build the TaskCard component per 04_UI_SPEC.md" beats "build the UI."
4. **Verify each step before moving on.** A bug carried into step 5 costs 5x the credits to fix.
5. **Set a spend limit** in Cursor settings so overages can't surprise you.
6. **Commit working states** (git) after each step — reverting is free, rebuilding is not.

### Suggested model routing

- Steps 1, 2, 4, 5, 7 (scaffold, CRUD, UI, feed, polish): **Auto mode**
- Steps 3, 6 (agent runner, handoff/approval logic): **manual frontier model** (worth the credits — this is the novel logic)

Full step-by-step with copy-paste prompts: `05_BUILD_PLAN.md`.
