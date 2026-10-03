# Ariadne · early access page

The public page at **ariadneagents.si**: the Door, the red thread, and a short staged form
that asks builders for early access. It's its own tiny Cloudflare Worker (`ariadne-landing`)
with its own D1 database (`ariadne-early-access`), kept apart from the product (`ariadne`,
Next.js), which moves to **app.ariadneagents.si** behind Cloudflare Access.

Why a separate Worker: the product's Next.js server needs 20–50 ms of CPU per request and
hits Error 1102 on the free plan. Here the page is static files that Cloudflare serves
without running any Worker code, and the one API endpoint uses about 0.2–0.4 ms of CPU.

## How it works

```
visitor ──► Cloudflare static assets (public/: HTML, CSS, JS, fonts)   no Worker CPU
            │
            └─ /api/* only ──► src/worker.ts ──► D1 "ariadne-early-access"
                                   │
                                   └─► Turnstile siteverify (step 1 only)
```

The flow on the page (`site/assets/early-access.js`, vanilla JS):

1. **The closed Door.** Email + "Get early access". `POST /api/early-access` checks the
   Turnstile token and saves the row right away (so even a partial answer is kept). It
   returns an opaque token signed with HMAC-SHA256 (`src/token.ts`, valid 2 hours).
2. **The Door opens** (CSS, about 1 s). The red thread draws in and writes each question,
   then the words settle into serif ink: what you use AI for, which tools, how often you
   switch. Every answer, or Skip, sends `PATCH /api/early-access { token, … }` to the same
   row. The token is the only key, never the email. Answers only go into empty columns,
   so a token can finish a row but never rewrite one.
3. **The knot.** The thread ties a small gold knot, and a thank-you message shows.

The same email again: if that person already finished, they see "You're already in."
If they stopped partway, they carry on from the questions they haven't answered.

- **Reduced motion:** every transition is instant, with the same steps.
- **Keyboard:** Enter moves on from each step, Space ticks the chips, arrow keys pick the
  radio answer, and focus moves to each new question.
- **Without JavaScript:** `assets/nojs.css` (loaded inside `<noscript>`) shows one plain
  form. A URL-encoded post is accepted and redirects to `/thanks/`. Turnstile itself needs
  JavaScript, though, so a visitor with JavaScript fully off gets sent back with a note.

Privacy and abuse: no raw IP address and no raw user agent is stored. The IP is only used
as a salted hash for an hourly rate-limit window (8 step-1 attempts per IP per hour, in
the `rate_limits` table, swept automatically), and the user agent is stored as a salted
16-character hash. The referrer is stored as a host only. Browsers on other origins are
refused, there's a strict CSP plus security headers (`site/_headers`), and the body is
capped at 4 KB. No public counter exists.

## Files

| Path | What it is |
| --- | --- |
| `wrangler.jsonc` | Worker config: static assets, `/api/*` to the Worker, D1 binding, vars. Routes are commented out until switch-over. |
| `migrations/0001_early_access.sql` | `requests` (email, answers, `status` new/invited, `completed_at`, `invited_at`, attribution) and `rate_limits`. |
| `src/worker.ts` | POST (step 1) and PATCH (answers), rate limit, Turnstile, origin check. |
| `src/token.ts` | Signed opaque row token. |
| `src/validate.ts` | Pure input cleaning (email, free text, tool ids, form posts). |
| `site/pages/index.html`, `site/pages/thanks.html` | The page and the no-JS thank-you page. |
| `site/partials/*.html` | Head, brand mark, the Door's thread, the staged form, footer. |
| `site/assets/landing.css` | Product tokens and fonts (from `app/globals.css`), the Door, the staged animation. |
| `site/assets/early-access.js`, `site/assets/nojs.css` | The staged flow, and the plain-form fallback. |
| `site/_headers`, `site/robots.txt`, `site/404.html`, icons | Static extras (favicon from `app/favicon.ico` / `app/icon.png`). |
| `scripts/build.mjs` | `site/` → `public/` (wrangler runs it on dev and deploy). |
| `scripts/export.sh`, `scripts/invite.sh` | CSV export, and marking someone invited. |
| `tests/*.test.ts`, `tests/smoke.mjs`, `tests/bench-cpu.mjs` | Unit tests, end-to-end checks against `wrangler dev`, and the CPU benchmark. |

## Run it locally

```bash
cd landing
npm ci
cp .dev.vars.example .dev.vars          # Turnstile TEST keys, local salts
npm run db:migrate:local
npm run dev                             # http://127.0.0.1:8787
npm test                                # unit tests
node tests/smoke.mjs                    # end-to-end against wrangler dev (local D1)
npm run bench                           # CPU per request
```

## Going live (later, in this order)

Nothing here is deployed yet. Each step below is a change to the live Cloudflare account.

1. **Create the database and apply the schema**
   ```bash
   cd landing
   npx wrangler d1 create ariadne-early-access     # paste the printed database_id into wrangler.jsonc
   npm run db:migrate:remote
   ```
2. **Turnstile:** Cloudflare dashboard → Turnstile → Add widget, hostnames
   `ariadneagents.si` and `www.ariadneagents.si`, mode Managed. Put the **site key** (public)
   in `landing.config.json` → `turnstileSiteKey`, then set the secrets:
   ```bash
   npx wrangler secret put TURNSTILE_SECRET        # the widget's secret key
   npx wrangler secret put HASH_SALT               # any long random string: openssl rand -hex 32
   npx wrangler secret put TOKEN_SECRET            # another one: openssl rand -hex 32
   ```
3. **Deploy the landing Worker** (still without routes) and test it on
   `https://ariadne-landing.<account>.workers.dev`:
   ```bash
   npx wrangler deploy
   ```
   For the test, temporarily add the workers.dev origin to `ALLOWED_ORIGINS` and its host to
   the Turnstile widget, or test only after step 5.
4. **Give the product its private address first** (in the repo root `wrangler.jsonc`):
   replace the two `ariadneagents.si` / `www` routes with
   `{ "pattern": "app.ariadneagents.si", "custom_domain": true }` and push `main`
   (Workers Builds deploys it, and Cloudflare creates the DNS record).
5. **Move the public routes to the landing Worker:** in `landing/wrangler.jsonc`, uncomment
   the `routes` block (`ariadneagents.si/*`, `www.ariadneagents.si/*`) and run
   `npx wrangler deploy`. Do it right after step 4 deploys, since a route can belong to only
   one Worker. Check `https://ariadneagents.si` and `https://www.ariadneagents.si`.
6. **Lock the product behind Cloudflare Access** (Zero Trust, free up to 50 users):
   Zero Trust → Access → Applications → Add → Self-hosted, domain `app.ariadneagents.si`,
   identity provider "One-time PIN". Policy "Testers": Action Allow, Include → Emails →
   your own address. In the `ariadne` Worker → Settings → Domains & Routes, also turn on
   Access for `ariadne.sr-labs.workers.dev` and the preview URLs, or set
   `"workers_dev": false`. Otherwise the product stays publicly reachable there.
7. **Workers Builds for the landing page (optional):** connect the same repo as a second
   Worker with root directory `landing`, build command `npm ci`, and deploy command
   `npx wrangler deploy`. Limit the app's build watch paths to exclude `landing/**`, and
   this one's to `landing/**`.

## Inviting a tester

1. Export and pick: `STATUS=new npm run export` writes `early-access-YYYY-MM-DD.csv`
   (open it in Sheets). `npm run export` exports everyone.
2. Let them in: Zero Trust → Access → Applications → app.ariadneagents.si → Policies →
   "Testers" → Include → Emails → add their address → Save. They can now open
   `https://app.ariadneagents.si`, get a one-time code by email, and sign up in Ariadne.
3. Record it: `scripts/invite.sh their@email.com` sets `status = 'invited'` and
   `invited_at`.
4. Send them the link yourself, from your business email once it's set up. No
   confirmation or invite emails are sent automatically yet.

To remove someone (e.g. after a presentation), delete their email from the policy.
