# Ariadne Prototype — Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14+ (App Router), TypeScript | Cursor's home turf; API routes included |
| Styling | Tailwind CSS | Fast, no design-system burn |
| Database | SQLite via Prisma (`prisma db push`) | Zero-config, file-based, fine for prototype |
| AI | OpenAI API + Anthropic API (server-side only) | Phase-1 "agents" — API keys in `.env` |
| Live updates | Polling (`setInterval`, 2s) on the activity feed | SSE is nicer; polling ships faster |

## Data model (Prisma)

```prisma
model Project {
  id        String   @id @default(cuid())
  name      String
  brief     String   // shared context — injected into every agent prompt
  createdAt DateTime @default(now())
  agents    Agent[]
  tasks     Task[]
  events    ActivityEvent[]
}

model Agent {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String   // "Scout" | "Maker"
  provider  String   // "anthropic" | "openai"
  model     String   // env-configurable
  role      String   // "Researcher + reviewer" etc.
  status    String   @default("idle") // idle | working | done
}

model Task {
  id               String   @id @default(cuid())
  projectId        String
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  agentId          String
  title            String
  instructions     String
  status           String   @default("pending") // pending | running | awaiting_approval | done | failed
  dependsOn        String   @default("[]") // JSON array of task ids
  requiresApproval Boolean  @default(false)
  output           String?
  createdAt        DateTime @default(now())
}

model ActivityEvent {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type      String   // started | handoff | completed | approval_requested | approved | failed | note
  message   String
  taskId    String?
  createdAt DateTime @default(now())
}
```

## API routes

| Method & path | Purpose |
|---|---|
| `POST /api/projects` | Create project `{ name, brief }`; seeds Scout + Maker agents |
| `GET /api/projects/[id]` | Project + agents + tasks (ordered) + recent events |
| `POST /api/projects/[id]/tasks` | Add task `{ title, agentId, instructions, dependsOn[], requiresApproval }` |
| `POST /api/tasks/[id]/run` | Execute the task (see Agent runner) |
| `POST /api/tasks/[id]/approve` | `{ approved: boolean, note? }` — releases or re-queues dependents |
| `GET /api/projects/[id]/events` | Activity feed (polled) |

## Agent runner (`lib/agents.ts`)

`runTask(taskId)`:

1. Load task → agent → project brief.
2. Check dependencies: all `dependsOn` tasks must be `done`. If not, return 409.
3. **Compose the prompt:**
   - System: agent role + "You are {name}, an agent in the Ariadne coordination layer."
   - Shared context block: the project brief (always included — this is the Ariadne thesis in code).
   - Handoff block: for each dependency, `## Input from {agent name} ({task title}): {output}`.
   - Task instructions.
4. Call the provider SDK server-side (OpenAI or Anthropic based on `agent.provider`). Model from env (`OPENAI_MODEL`, `ANTHROPIC_MODEL`).
5. Await the result; save to `task.output`.
6. Emit activity events: `started` → `completed` (or `approval_requested` if `requiresApproval`).
7. Set status: `done`, or `awaiting_approval` when approval required.
8. On approve: emit `approved`, dependents become runnable.

Approval rejection sets the task back to `pending` with the human's note appended to instructions (simple rework loop).

## Env vars

```
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_MODEL="gpt-4o-mini"          # cheap default; swap to flagship for demos
ANTHROPIC_MODEL="claude-sonnet-4-6" # check current model name at console.anthropic.com
```

API keys are server-side only — never expose to the client. Prototype API spend is pennies per full workflow run.

## What NOT to build

No auth. No multi-tenancy. No streaming partial UI (await full result, then render). No workflow-builder UI — tasks are created via API/seed. No retries/backoff beyond one naive retry.
