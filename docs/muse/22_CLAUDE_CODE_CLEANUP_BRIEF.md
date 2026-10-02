# Claude Code brief — Ariadne cleanup pass

## 0. Read this first

Before touching anything, read `workspace/ariadne-prototype/16_ARIADNE_EXPLAINER_GROK.md`.
It is the standing orientation doc: the one-liner, the three problems, the thread
vocabulary (spun / spinning / knot / unspun / tie off / the door / the labyrinth —
do NOT invent synonyms), the committed cream/serif/red-thread design language,
what Ariadne is NOT, the V1→V3 roadmap with parked items, and working agreements.
Everything below assumes you've read it.

## 1. Repo & stack facts

- Private GitHub repo `saadixsd/Ariadne`, branch `main`.
- Cloudflare Worker + D1 database (`ariadne`); local dev uses SQLite.
- API keys are Cloudflare secrets — NEVER commit them, never print them.
- Models are Worker vars: Claude Haiku `claude-haiku-4-5-20251001`, GPT `gpt-6-luna`.
- Auth: email/password, hashed passwords, 30-day HttpOnly sessions. Signed-out users
  redirect to `/sign-in`.
- 10 provider/model calls per account per UTC day. Human approvals/tasks don't count.
- Live: https://ariadne.sr-labs.workers.dev

## 2. What you're doing (and NOT doing)

Two surgical removals. Nothing else. Do not redesign, do not add features, do not
touch the execution pipeline, the tree, the board, the knot panel, or the budget
counter. Visual/copy removal only.

### Task A — Verify zero user-visible "Beta" wording (QA found none)

A full QA sweep of the live site on Oct 1 2026 (signed-out pages, signup,
"What are you making?" dialog, board, tree, Brief dialog, settings, account menu,
feedback dialog, tooltips, and the shipped JS bundles) found **zero occurrences**
of "beta" (case-insensitive). Your job:

1. Confirm with a case-insensitive repo-wide grep that no user-visible string
   contains "beta" (historical docs under `workspace/ariadne-prototype/` are
   exempt — they're not shipped).
2. If you find any the QA missed, delete or rewrite with neutral copy.
3. Report the grep command and result. Expected: zero hits in shipped code.

### Task B — Remove the 3-step intro onboarding card

**QA findings (verbatim from the production bundle, Oct 1 2026):**

- Location: board view, top of the scrollable content area, directly above the
  "Project · started …" header. A full-width rounded card with a thread-colored
  border (`<aside>`, eyebrow "Onboarding").
- Eyebrow: "Onboarding"
- Headline: "You hold the thread."
- Dismiss button: "Dismiss" (top-right of the card)
- Body: "Odysseus (Claude) researches and reviews. Daedalus (GPT) drafts and
  builds. You hold the thread: they hand off, you tie off."
- Progress counter: "0 of 3" (mono, updates as steps complete)
- Steps (checkbox list): "1. Meet your agents", "2. Run your first task",
  "3. Approve a handoff"
- CTA button: "Show me the first step" (caption: "This scrolls to task 1 and
  highlights Run. It does not call Claude or GPT. Press Run on the task when you
  want that.") — or "Review the workflow" once step 1 has a result/failure
  (caption: "Step 1 already has a result or a failure. Read it on its card, or
  press Rerun when you want another attempt.")
- State: `localStorage` keys `ariadne.welcome.dismissed` (=1 when dismissed)
  and `ariadne.welcome.checks` (step checkboxes). Steps also auto-complete:
  expanding any agent checks "Meet your agents"; a non-pending task 1 checks
  "Run your first task"; an approval event checks "Approve a handoff". The card
  never auto-dismisses — only via Dismiss.
- Known quirk (mooted by removal): dismissal is per-browser, not per-account —
  a new account on a previously used browser never sees the intro.

**What to do:**

1. Delete the card component entirely (find it by the "You hold the thread."
   headline / "Onboarding" eyebrow / the `ariadne.welcome.*` key reads).
2. Remove the `localStorage` reads and the step auto-complete wiring. Dead keys
   left in existing users' browsers are harmless — do not write a migration.
3. If the auto-complete hooks are entangled with anything load-bearing, remove
   the *rendering* and leave the data model alone, then say so in your summary.
4. Verify: fresh signup → "What are you making?" dialog → board renders with NO
   intro card, regardless of localStorage state.

**Do NOT remove** the mandatory "What are you making?" project dialog on signup.
That one is intentional — the founder confirmed direction-before-blank-canvas is
the desired first run. (QA Oct 1: still present; note both name AND description
are currently required to proceed.)

### Task C — Bonus copy fixes (same pass, low risk — strike any you disagree with)

Two more internal-facing strings QA found that real users shouldn't see:

1. Feedback success dialog says: "It is stored for the inbox at /feedback."
   → Rewrite without exposing the raw route (e.g. "Thanks — your feedback is saved.").
2. Missing-provider-keys alert says: "Add … to .env, then restart npm run dev."
   → That's developer instructions in user UI. Rewrite for a real user
   (e.g. "Model access isn't configured — contact support.") or hide the alert
   behind an admin flag. Do not leave `.env`/`npm run dev` in user-facing copy.

Also noted (UX quirk, fix if trivial): in the "What are you making?" dialog,
clicking Continue with only the name filled flips the button to a disabled
"Starting" state while it's actually still waiting on the required description —
reads as a stuck loader. Either validate inline or don't relabel the button
until creation actually starts.

## 3. Verification before you call it done

1. `npm run build` (or repo's build command) passes with zero new warnings.
2. Fresh-signup flow still works end to end: sign-up → "What are you making?"
   dialog → board renders → no 3-step intro appears → no "beta" anywhere.
3. Board ⇄ Tree toggle still works both ways.
4. Confirm with a case-insensitive repo-wide grep for "beta" that zero
   user-visible occurrences remain (historical docs under
   `workspace/ariadne-prototype/` are fine to leave — they're not shipped).

## 4. If something is ambiguous

The orientation doc (16) is the tiebreaker. If the 3-step intro turns out to be
entangled with something load-bearing, remove the *rendering* and leave the data
model alone, then say so in your summary. Don't improvise new onboarding.
