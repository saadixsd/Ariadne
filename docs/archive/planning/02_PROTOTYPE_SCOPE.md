# Ariadne Prototype — Phase 1 Scope

## The one workflow: "Launch a landing page"

A single project. Two agents. Five tasks. This workflow demonstrates every core mechanic: shared context, sequential handoffs, an approval gate, and live visibility.

### The agents

| Agent | Provider | Role |
|---|---|---|
| **Scout** | Claude (Anthropic API) | Researcher + reviewer. Reads context, investigates, critiques. |
| **Maker** | GPT (OpenAI API) | Builder + writer. Drafts, generates, produces artifacts. |

Different providers on purpose: the whole point is cross-agent coordination.

### The tasks

1. **Scout: Research positioning** — "Research how 3 competitors position themselves. Output 5 distinct positioning angles for our product, each one sentence." *(no dependencies)*
2. **Maker: Draft landing page copy** — "Write landing page copy (hero, 3 features, CTA) based on the positioning angles." *(depends on: task 1 — Scout's output is injected as input)*
3. **Scout: Review the copy** — "Critique this copy against the positioning angles. Flag anything off-message; suggest fixes." *(depends on: task 2)*
4. **YOU: Approve the copy** — approval gate. Human reads the reviewed copy, approves or requests changes. *(depends on: task 3, requiresApproval: true)*
5. **Maker: Build the landing page** — "Generate a single-file HTML landing page using the approved copy." *(depends on: task 4)*

### Mechanics demonstrated

- **Shared context:** every agent receives the project brief automatically.
- **Handoff:** task 2 can't run well without task 1's output — the dependency is the demo.
- **Review loop:** agents checking each other's work (task 3).
- **Approval gate:** nothing ships without the human (task 4).
- **Live visibility:** every start, handoff, and completion appears in the activity feed in real time.

## In scope

- Project creation with a shared-context brief
- Two API-connected agents (OpenAI + Anthropic)
- Task list with dependencies, per-agent assignment
- "Run" execution with live status
- Agent-to-agent handoff (output injection)
- Human approval gate (approve / request changes)
- Live activity feed
- Viewing agent outputs

## Out of scope (phase 2+)

- Real IDE agents (Claude Code / Codex CLI integration)
- Multi-user / teams / auth
- Permissions system ("this agent can't touch production")
- Billing, usage metering
- Multiple projects, templates, workflow-builder UI
- Note: the task graph is data-driven, so the workflow above is seeded as demo data and swappable without code changes

## Success criteria

1. The full 5-task workflow runs end-to-end in the demo.
2. A handoff visibly carries one agent's output into the next agent's input.
3. The approval gate blocks task 5 until the human approves.
4. A first-time viewer understands what's happening within 60 seconds.
