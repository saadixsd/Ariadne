# Architecture

Ariadne is one Next.js 16 app compiled for Cloudflare Workers by OpenNext. The browser
talks to a single Worker (`ariadne`) on ariadneagents.si. The Worker serves the landing
page, sign-up and the dashboard, the JSON API, stores everything in one D1 database and
calls Anthropic and OpenAI with server-side keys.

The product's wedge is **Draft → Challenge → Judge → Tie Off**: Odysseus (Claude) drafts,
Daedalus (GPT, a different model family) challenges, you judge, and the approved
answer is tied off with its history.

## 1. System

```mermaid
flowchart TB
  subgraph Browser["Browser (React client components)"]
    Landing["Landing /<br/>app/page.tsx (static) + public/landing/life.js"]
    SignUp["Sign-up<br/>components/AuthForm.tsx + Turnstile widget"]
    Board["Board /dashboard<br/>components/Dashboard.tsx"]
    Tree["Tree<br/>components/LiveTree.tsx"]
    Poll["Adaptive poll + ETag<br/>components/project-poll.ts<br/>lib/poll-schedule.ts"]
  end

  subgraph CF["Cloudflare"]
    Edge["ariadneagents.si and www<br/>(zone routes to this Worker)<br/>security headers on every response"]
    subgraph Worker["Worker 'ariadne' (Next.js 16 via OpenNext)"]
      Proxy["proxy.ts<br/>/ public, cookie gate, door rewrite,<br/>cross-site API writes refused"]
      Pages["App Router pages<br/>app/page.tsx (static landing),<br/>app/dashboard, app/tree, app/settings"]
      API["Route handlers app/api/**<br/>auth, projects, tasks/:id/run|approve|rerun|runs"]
      subgraph Lib["lib/ (server)"]
        Auth["auth.ts, password.ts<br/>rate-limit.ts, signup-guard.ts"]
        Engine["agents.ts: runTask / decideTask / rerunTask"]
        Guards["usage.ts (10 runs per account,<br/>6 in the first 24 h, 200 site-wide,<br/>per UTC day)<br/>reclaim.ts (stuck runs &gt; 5 min)<br/>input-caps.ts, limits.ts"]
        Hist["run-history.ts<br/>TaskRun + ActivityEvent"]
        DB["prisma.ts<br/>per-request PrismaClient + D1 adapter"]
      end
    end
    D1[("D1 database 'ariadne'<br/>User, Session, Project, Agent, Task,<br/>TaskRun, ActivityEvent, UsageDay,<br/>RateLimit, Feedback")]
    Secrets["Worker secrets<br/>ANTHROPIC_API_KEY, OPENAI_API_KEY,<br/>TURNSTILE_SECRET, INVITE_CODES (optional)"]
    TS["Turnstile siteverify<br/>challenges.cloudflare.com"]
    Logs["Workers Logs (observability)"]
  end

  Anthropic["Anthropic API<br/>Odysseus = Claude<br/>(research + draft + final)"]
  OpenAI["OpenAI API<br/>Daedalus = GPT<br/>(challenge)"]
  GH["GitHub saadixsd/Ariadne<br/>branch main"]
  Builds["Workers Builds<br/>push to main = production deploy"]

  Landing --> Edge
  SignUp --> Edge
  Board --> Edge
  Tree --> Edge
  Poll --> Edge
  Edge --> Proxy --> Pages
  Proxy --> API
  Pages --> Lib
  API --> Auth
  API --> Engine
  Engine --> Guards
  Engine --> Hist
  Auth --> DB
  Guards --> DB
  Hist --> DB
  Engine --> DB
  DB --> D1
  Engine -- "Messages API, 60 s timeout, 1 retry" --> Anthropic
  Engine -- "Chat Completions, 60 s timeout, 1 retry" --> OpenAI
  Secrets -.-> Engine
  Secrets -.-> Auth
  Auth -- "sign-up only" --> TS
  Worker -.-> Logs
  GH --> Builds --> Worker
```

Rendered: [`docs/diagrams/01-system-architecture.png`](diagrams/01-system-architecture.png)

- **Edge of the Worker.** Every response carries security headers (HSTS, `nosniff`,
  `Referrer-Policy`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`,
  `Permissions-Policy`) from `next.config.ts` (static files under `/_next/static` get
  the same core headers from `public/_headers`, since Workers Assets serves them without
  running the Worker), and no `X-Powered-By`. `proxy.ts` serves `/`
  to everyone, sends signed-out visitors on other pages to `/sign-in`, and refuses API
  writes whose `Origin` is another site.
- **One request, one Prisma client.** On Workers, `lib/prisma.ts` creates a Prisma
  client per request (keyed on OpenNext's request context). A shared client batched
  two requests' queries into one, so when one request ended the other could hang.
- **No background workers.** Runs happen inside the HTTP request (at most about 2 min:
  60 s timeout, 1 retry). Recovery is lazy, with no cron (see section 7).
- **Polling, not sockets.** The board polls `GET /api/projects/:id` with an ETag:
  every 2 s while something is running, backing off to once a minute when idle,
  and not at all in a hidden tab (`lib/poll-schedule.ts`, `lib/project-version.ts`).

## 2. Requests and routing

```mermaid
flowchart TD
  Req(["Request"]) --> Static{"/_next/static, /landing/*,<br/>fonts, favicon?"}
  Static -- yes --> Assets["Workers Assets<br/>(no Worker CPU)"]
  Static -- no --> P["proxy.ts"]
  P --> W{"API write from<br/>another site?"}
  W -- yes --> F403["403"]
  W -- no --> Root{"path is / ?"}
  Root -- yes --> Leg{"session cookie, or a legacy<br/>?project= / ?new= link?"}
  Leg -- yes --> Dash307["307 → /dashboard<br/>(query kept)"]
  Leg -- no --> LP["Landing<br/>(prerendered, static)"]
  Root -- no --> DoorQ{"/sign-in or /sign-up<br/>with a session cookie?"}
  DoorQ -- yes --> Door["rewrite to the /session variant<br/>(signed-in account → /dashboard)"]
  DoorQ -- no --> Pub{"/sign-in, /sign-up, /verify<br/>or /api/*?"}
  Pub -- yes --> Pass["served as is<br/>(door pages are static;<br/>API routes check the session themselves, 401)"]
  Pub -- no --> Cookie{"session cookie?"}
  Cookie -- no --> SignIn["307 → /sign-in"]
  Cookie -- yes --> App["/dashboard, /tree, /settings, /feedback<br/>(page validates the session in D1)"]
```

Rendered: [`docs/diagrams/04-request-routing.png`](diagrams/04-request-routing.png)

- **The landing costs no database or render work.** `/` is prerendered at build time, so
  a signed-out visit runs `proxy.ts` (a cookie check) and OpenNext returns the prerendered
  HTML. That matters on the Workers Free plan's 10 ms CPU limit.
- **Old links keep working.** `/?project=…&new=1` from before the move goes to
  `/dashboard?project=…&new=1`.
- `proxy.ts` only checks that the cookie exists; the page validates the session against
  D1 and sends a stale cookie to `/sign-in`. A stale cookie on `/` therefore costs one extra
  redirect (`/` → `/dashboard` → `/sign-in`), never a wrong page.

## 3. Sign-up

```mermaid
sequenceDiagram
  autonumber
  actor U as Visitor
  participant F as /sign-up (AuthForm + Turnstile widget)
  participant R as POST /api/auth/sign-up
  participant G as lib/signup-guard.ts
  participant C as Turnstile siteverify
  participant A as lib/auth.ts
  participant D as D1

  U->>F: email + password (invite code if shown)
  F->>F: widget token (invisible unless Cloudflare wants a check)
  F->>R: {email, password, turnstileToken, inviteCode}
  R->>D: per-IP rate limit (5 sign-ups an hour)
  R->>A: checkSignUpInput (400 on a bad email or short password)
  R->>G: requireHuman(token, ip)
  G->>C: secret + token + remoteip
  C-->>G: success, hostname, error codes
  G-->>R: ok, or 403 {code: turnstile}, or 503 if Turnstile can't be checked
  R->>G: checkInvite(inviteCode)
  G-->>R: open: code or null · invite-only: code, or 403 {code: invite}
  R->>A: signUp(email, password, {inviteCode})
  A->>D: INSERT User (inviteCode), INSERT Session
  A-->>U: 201 + HttpOnly session cookie → /dashboard
  Note over U,D: First 24 hours without an invite code: 6 model runs (trial).<br/>After that, or with an invite code: 10 a day. Site-wide cap 200 a day either way.
```

Rendered: [`docs/diagrams/05-sign-up-sequence.png`](diagrams/05-sign-up-sequence.png)

- **Turnstile fails closed in production.** With no `TURNSTILE_SECRET` the server refuses
  sign-ups (503) rather than letting bots through. Outside production, no secret means
  Turnstile is off, so local dev and tests work without keys.
- **Invite switch.** `INVITE_CODES` is a comma list (case-insensitive, multi-use). When
  it's set, sign-up needs one of the codes; `?invite=CODE` on the sign-up URL fills it in.
  OpenNext copies Worker secrets into `process.env` on each request, so adding or deleting
  the secret takes effect without a deploy.
- **Trial.** `lib/limits.ts` `dailyRunLimit(user)`: 6 while `now − createdAt < 24 h` and
  the account has no invite code, else 10. `lib/usage.ts` reserves against that limit with
  the same atomic `UPDATE … WHERE runs < limit`. Settings shows when the trial ends.

## 4. Hosting

```mermaid
flowchart LR
  subgraph Before["Before the cutover"]
    A1["ariadneagents.si, www"] --> LW["Worker ariadne-landing<br/>(early-access form)"]
    LW --> EA[("D1 ariadne-early-access")]
    A2["app.ariadneagents.si<br/>(Cloudflare Access)"] --> AW1["Worker ariadne"]
  end
  subgraph After["After the cutover (docs/CUTOVER.md)"]
    B1["ariadneagents.si, www"] --> AW2["Worker ariadne<br/>landing, sign-up, /dashboard"]
    AW2 --> AD[("D1 ariadne")]
    EA2[("D1 ariadne-early-access<br/>kept, exported:<br/>the first invite pool")]
  end
  Before ==> After
```

Rendered: [`docs/diagrams/06-hosting-cutover.png`](diagrams/06-hosting-cutover.png)

A route pattern can belong to only one Worker, so the order is: take the routes off
`ariadne-landing`, then attach them to `ariadne`, then remove `app.` and its Access app.
The steps, checks and rollback are in [CUTOVER.md](CUTOVER.md).

## 5. A run, step by step

```mermaid
sequenceDiagram
  autonumber
  actor U as You (browser)
  participant P as proxy.ts
  participant R as POST /api/tasks/:id/run
  participant A as lib/auth.ts
  participant E as lib/agents.ts runTask()
  participant Q as lib/usage.ts
  participant D as D1 (Prisma)
  participant M as Claude or GPT

  U->>P: Run (session cookie)
  P->>R: cookie ok, same-site, pass
  R->>A: requireUser()
  A->>D: Session by sha256(token), with User
  A-->>R: user (401 if no session)
  R->>E: runTask(taskId, userId, dailyRunLimit(user))
  E->>D: load owned project + all tasks with agents
  opt a task is running for more than 5 min
    E->>D: reclaimStuckTasks: set pending, release quota, TaskRun reclaimed, event failed
  end
  E->>E: 409 if running or awaiting_approval, or dependencies not done
  alt model step (Odysseus or Daedalus)
    E->>Q: reserveModelRun(user, UTC day)
    Q->>D: UPDATE UsageDay SET runs+1 WHERE runs < limit (this account: 6 on day one, else 10)
    Q->>D: SUM(runs) for the day across all accounts
    Q-->>E: ok, 429 (own limit) or 503 (site 200)
  end
  E->>D: claim: Task status=running, startedAt (guarded updateMany)
  E->>D: Agent status=working
  E->>D: events started + one handoff per dependency (one INSERT)
  alt human step (You at the knot)
    E->>D: output = packaged chain (plus your last change note), status=awaiting_approval
    E->>D: TaskRun succeeded (model human), event approval_requested
    E-->>U: task (no daily run used)
  else model step
    E->>E: prompt = role + Shared context (brief) + Input from each direct dependency + instructions
    E->>M: call (60 s timeout, retried once)
    alt provider error
      E->>Q: releaseModelRun (failed runs do not count)
      E->>D: TaskRun failed, Task failed, event failed
      E-->>U: 502 with a readable error
    else output returned
      E->>D: commitIfOwned: status done (or awaiting_approval if requiresApproval)
      E->>D: TaskRun succeeded (prompt, output, latency, tries)
      E->>D: Agent model + status, event completed
      opt a human step's dependencies are now all done
        E->>E: openReadyHumanGates: runTask(human step), so the knot opens itself
      end
      E-->>U: task
    end
  end
  loop every 2 s while spinning, backing off to 60 s when idle
    U->>R: GET /api/projects/:id with If-None-Match
    R-->>U: 304, or the new project state
  end
  Note over U,E: At the knot: POST /api/tasks/:id/approve {approved:true} sets done (event approved).<br/>{approved:false, note} resets the drafting step and everything after it to pending,<br/>appends the note to its instructions (event note). Nothing calls a model until you press Run again.
```

Rendered: [`docs/diagrams/02-run-pipeline-sequence.png`](diagrams/02-run-pipeline-sequence.png)

The prompt a model step receives (`lib/prompt.ts`):

```
system: <agent role>\n\nYou are <Odysseus|Daedalus>, an agent in the Ariadne coordination layer.
user:   ## Shared context\n<project brief>
        ## Input from <hand> (<step title>): <that step's output>     (one per direct dependency)
        <step instructions, including any "Human requested changes: …" notes>
```

A human step (the knot) never calls a model. It packages every finished step upstream
of it, plus your last change note, and waits in `awaiting_approval`.

## 6. Task states

```mermaid
stateDiagram-v2
  [*] --> pending: project created (5-step starter thread)
  pending --> running: Run, all dependencies done,<br/>model steps reserve 1 of 10 daily runs<br/>(and 1 of the site-wide 200)
  failed --> running: Respin (same checks)
  running --> done: model output, no approval needed
  running --> awaiting_approval: human step packages the chain<br/>(or a model step with requiresApproval)
  running --> failed: provider error after 1 retry<br/>(daily run released)
  running --> pending: reclaimed after 5 min with no result<br/>(daily run released)
  awaiting_approval --> done: Tie off (approve)
  awaiting_approval --> pending: Ask for changes (note required)<br/>drafting step + all later steps reset, note appended
  done --> pending: Re-run of this step or an earlier one<br/>(downstream steps cleared, history kept)
  done --> [*]
  note right of running
    Every attempt writes one immutable TaskRun row:
    succeeded, failed, reclaimed, discarded or legacy.
  end note
  note left of awaiting_approval
    The knot. Opens by itself when the step before it
    finishes. Approving uses no daily run.
  end note
```

Rendered: [`docs/diagrams/03-task-state-machine.png`](diagrams/03-task-state-machine.png)

| Event type (`ActivityEvent.type`) | Written when |
|---|---|
| `started` | a step is claimed for a run |
| `handoff` | once per dependency whose output feeds the step (`fromTaskId` → `toTaskId`) |
| `completed` | a model step finishes and needs no approval |
| `approval_requested` | a knot opens (`payload.gate = true` for a human step) |
| `approved` | you tie off a knot |
| `note` | you ask for changes (`payload.decision = "changes_requested"`) or a re-run clears steps (`payload.kind = "rerun_cleared"`) |
| `failed` | a provider error, or a stuck run recovered (`payload.reason = "stuck_run_reclaimed"`) |

`TaskRun` is append-only: one row per attempt with outcome `succeeded`, `failed`,
`reclaimed`, `discarded` (it finished after being recovered, so its output is kept but not
applied) or `legacy` (output saved from before run history existed).

## 7. Guards

| Guard | Where | Rule |
|---|---|---|
| Daily quota | `lib/usage.ts` | `UPDATE UsageDay SET runs = runs + 1 WHERE runs < limit` before the provider call. It's released on failure, discard or recovery, so only successful runs count. Per user, per UTC day (429 when used up) |
| First-day trial | `lib/limits.ts` | the limit is 6 for an account's first 24 hours unless it signed up with an invite code, then 10 |
| Sign-up | `lib/signup-guard.ts` | Turnstile siteverify (403 on failure, 503 if it can't be checked; fails closed in production), then the `INVITE_CODES` switch (403 when invite-only and the code is missing or wrong) |
| Site-wide cap | `lib/usage.ts`, `lib/limits.ts` | after the user's run is reserved, the day's `SUM(runs)` across all accounts must be ≤ 200, or the reservation is given back and the run is refused with 503 before any provider call. Resets at midnight UTC. Bounds the worst-case daily spend no matter how many accounts exist |
| Output size | `lib/agents.ts`, `lib/limits.ts` | `max_tokens` 8,192 on Claude (unchanged) and `max_completion_tokens` 16,384 on GPT (the same visible budget plus headroom, since a reasoning model's hidden tokens count too). GPT calls had no cap before |
| Cross-site writes | `proxy.ts` | POST/PATCH/DELETE to `/api/*` with a foreign `Origin` (or `Sec-Fetch-Site: cross-site`) gets 403 |
| Ownership | every query | `userId` is in the `WHERE` of every project/task read and write. Someone else's id returns 404 |
| Run claim | `lib/agents.ts` | the claim is a guarded `updateMany` (not running, not awaiting approval). Results are written only if this attempt still owns the step (`commitIfOwned`) |
| Stuck runs | `lib/reclaim.ts` | `running` for more than 5 min → `pending`. Checked when the board loads, on polls, and on run, approve and re-run |
| Auth rate limits | `lib/rate-limit.ts` | per IP (`cf-connecting-ip`), fixed 1 h windows: sign-up 5, sign-in 10, verify 20 |
| Input caps | `lib/limits.ts` | brief 5,000 · project name 120 · title 200 · instructions 5,000 · note 2,000 · feedback 4,000 characters |

## 8. Data model (`prisma/schema.prisma`)

`User` (with `inviteCode`, null for open sign-ups) 1─* `Session`, `UsageDay`, `Project`, `Feedback` · `Project` 1─* `Agent`, `Task`,
`ActivityEvent` · `Task` 1─* `TaskRun` · `RateLimit` (standalone counters). Deleting
a project cascades to its agents, tasks, runs and events. `Task.dependsOn` is a JSON
array of task ids.

## 9. Code map

| Path | What it is |
|---|---|
| `app/page.tsx`, `app/landing.css`, `public/landing/life.js` | the static landing page and its thread and demo script |
| `app/dashboard/page.tsx`, `app/tree/page.tsx` | Board and Tree pages (server-rendered, then client components take over) |
| `app/api/tasks/[id]/run\|approve\|rerun\|runs` | the pipeline endpoints |
| `app/api/projects/**` | project CRUD, add step, ETag poll, events |
| `app/api/auth/**`, `app/api/account` | sign-up/in/out, email verification (dormant), name |
| `lib/signup-guard.ts`, `lib/turnstile-site-key.ts` | Turnstile check and invite switch (server); the public site key (browser) |
| `lib/one-liner.ts` | the one-liner and the four wedge steps, shared by the landing and the first-run dialog |
| `lib/agents.ts` | `runTask`, `decideTask`, `rerunTask`, provider calls |
| `lib/starter-thread.ts` | the five-step starter thread and the three hands |
| `lib/usage.ts`, `lib/limits.ts`, `lib/reclaim.ts`, `lib/run-history.ts` | per-user (with the first-day trial) and site-wide quota, recovery, history and events |
| `lib/thread.ts`, `lib/lineage.ts`, `lib/live-tree.ts`, `lib/dag-layout.ts` | browser-safe view models for the Board and Tree |
| `components/Dashboard.tsx`, `components/LiveTree.tsx` | Board and Tree client roots |
| `components/KnotPanel.tsx`, `components/Critique.tsx` | knot sheet, review flags, v1 → v2 |
| `proxy.ts` | `/` is public (signed-in visitors and legacy links go to `/dashboard`), other pages redirect signed-out visitors to `/sign-in`, refuses cross-site API writes |
| `next.config.ts` | security headers, `poweredByHeader: false` |
| `tests/unit`, `tests/integration` | unit tests; pipeline, migration, HTTP and Workers smoke tests (mock LLM, local SQLite or local D1) |
| `migrations/` | D1 migrations 0001 to 0004 |
