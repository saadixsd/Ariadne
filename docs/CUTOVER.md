# Cutover: ariadneagents.si serves the product (Phase 0)

> **Status: a plan, not yet executed.** Nothing in this file has been run against Cloudflare.
> Run it yourself, in order, while you can watch it (about 30–45 minutes, most of it checking).

**Before:** `ariadneagents.si` and `www` → Worker `ariadne-landing` (early-access form, D1
`ariadne-early-access`). The product → Worker `ariadne` on the custom domain
`app.ariadneagents.si`, behind Cloudflare Access.

**After:** `ariadneagents.si` and `www` → Worker `ariadne` (landing at `/`, open sign-up,
`/dashboard`). `app.` and its Access app are removed. `ariadne-landing` stays deployed but
has no routes; its database is kept and exported (it's the first invite pool).

**The rule that sets the order:** a route pattern can belong to only one Worker. Wrangler
refuses to deploy `ariadne` with `ariadneagents.si/*` while `ariadne-landing` still holds it,
so the landing routes come off first. And removing `routes` from a wrangler file does **not**
detach routes that already exist, so detaching is done in the dashboard.

The commits on branch `phase0`, oldest first:

| # | Commit | Ships when |
|---|---|---|
| 1 | `CLAUDE.md: Phase 0 brief …` | step 5 |
| 2 | `Phase 0: landing at /, dashboard at /dashboard, guarded open sign-up` | step 5 |
| 3 | `Docs: Phase 0 flow, routing, sign-up and hosting diagrams; CUTOVER.md` | step 5 |
| 4 | `Cutover: serve ariadneagents.si and www from the ariadne Worker` | step 7, **not before** |

Commits 1–3 keep `wrangler.jsonc` on `app.ariadneagents.si`, so pushing them changes the
product but not the domains. Commit 4 is the only one that moves routes.

All commands run from the repo root on your laptop unless they say `cd landing`.

---

## 0. Pre-checks (nothing changes yet)

```sh
git fetch origin && git status                 # main is clean and matches origin/main
npx wrangler whoami                            # the account that owns ariadne (7a89d9da…)
npx wrangler deployments list --name ariadne   # note the current version id: your rollback target
npx wrangler deployments list --name ariadne-landing
npx wrangler d1 migrations list ariadne --remote   # expect only 0004_invite_code pending
npm ci && npm run lint && npx next typegen && npx tsc --noEmit && npm test && npm run build
```

In the Cloudflare dashboard, write down what exists now (you'll need it for rollback):

- Workers & Pages → **ariadne-landing** → Settings → Domains & Routes: expect
  `ariadneagents.si/*` and `www.ariadneagents.si/*`.
- Workers & Pages → **ariadne** → Settings → Domains & Routes: expect the custom domain
  `app.ariadneagents.si`.
- Workers & Pages → **ariadne-landing** → Settings → Build: is a Git repository connected
  (root directory `landing`)? If yes, you'll disconnect it in step 6.
- DNS → Records for `ariadneagents.si`: the apex and `www` records exist and are **Proxied**
  (orange cloud). Zone routes only run on proxied hostnames. Leave them as they are.

## 1. Export the early-access list (keep it; it's the first invite pool)

```sh
cd landing
npm ci
# How many people, by status
npx wrangler d1 execute ariadne-early-access --remote \
  --command "SELECT status, COUNT(*) AS n FROM requests GROUP BY status"
# CSV of everyone (spreadsheet-safe quoting), written to landing/early-access-YYYY-MM-DD.csv
npm run export
# Full SQL backup of the whole database (schema + rows), for safekeeping
npx wrangler d1 export ariadne-early-access --remote --output "early-access-backup-$(date +%F).sql"
cd ..
```

`landing/.gitignore` already ignores `early-access-*.csv`. Keep the `.sql` backup out of git
too (it holds emails): move it somewhere private. **Don't delete** the `ariadne-early-access`
database or the `ariadne-landing` Worker — they're the fallback for rollback and the source
of the invite list.

## 2. Secrets on the `ariadne` Worker

The Phase 0 code refuses sign-ups in production when `TURNSTILE_SECRET` is missing (it fails
closed), so set it **before** pushing.

```sh
# The secret key of the Turnstile widget whose site key is 0x4AAAAAAFNAmvf4QVghMro0
# (the same widget the early-access page uses: dashboard → Turnstile → that widget → Settings).
npx wrangler secret put TURNSTILE_SECRET --name ariadne

# Optional: make sign-up invite-only. Comma list, case-insensitive, each code reusable.
# Leave it unset for open sign-up. Delete it later to reopen; no deploy needed either way.
npx wrangler secret put INVITE_CODES --name ariadne          # e.g. minotaur,labyrinth
# npx wrangler secret delete INVITE_CODES --name ariadne
```

Already set and unchanged: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. Check with
`npx wrangler secret list --name ariadne`.

`TURNSTILE_HOSTNAMES` (optional, a plain var) makes the server also check which hostname a
token was issued on. Commit 4 sets it to `ariadneagents.si,www.ariadneagents.si` in
`wrangler.jsonc`; before that it's unset, so tokens from `app.` are accepted during testing.

Invite link format, for later: `https://ariadneagents.si/sign-up?invite=CODE` (fills the
code in for them). Accounts created with a code skip the first-day trial cap.

## 3. Turnstile widget hostnames

Dashboard → Turnstile → the widget with site key `0x4AAAAAAFNAmvf4QVghMro0` → Hostnames:

- `ariadneagents.si` and `www.ariadneagents.si` — should already be there (the early-access
  page uses this widget). Keep them.
- Add `app.ariadneagents.si` **for now**, so you can test sign-up on `app.` in step 5.
  Remove it after step 8.

## 4. Apply migration 0004 to production D1 — before pushing main

```sh
npx wrangler d1 migrations list ariadne --remote
npx wrangler d1 migrations apply ariadne --remote      # applies 0004_invite_code.sql
npx wrangler d1 execute ariadne --remote --command 'PRAGMA table_info("User")'   # inviteCode is listed
```

`0004` only adds a nullable column (`ALTER TABLE "User" ADD COLUMN "inviteCode" TEXT`), so
the code that's live now keeps working after it. The new code reads that column on every
sign-in, sign-up and page load, so **pushing before this step breaks sign-in.**

## 5. Push the Phase 0 code (still on app.ariadneagents.si)

Get commits 1–3 onto `main` (merge or fast-forward the `phase0` branch **up to commit 3**,
without commit 4), then push. Workers Builds deploys it to `app.ariadneagents.si`.

```sh
git checkout main
git merge --ff-only <commit 3 hash>     # or: git am patches/0001…0003 on main
git push origin main
```

Wait for the build to finish (Workers & Pages → ariadne → Deployments), then check on
`app.` (Access still in front, so sign in through Access first):

- `https://app.ariadneagents.si/` shows the landing, not the board, when signed out.
  Signed in, it goes to `/dashboard`.
- Sign up with a fresh address: the Turnstile check passes, you land on `/dashboard`, the
  first-run dialog shows the new one-liner, and the top bar says `6/6 runs left today`.
- An old link like `https://app.ariadneagents.si/?project=<id>` goes to `/dashboard?project=<id>`.
- Workers & Pages → ariadne → Logs: no errors, and CPU time per request on `/` is low.

If anything is wrong here, stop and roll back (section R1). Domains haven't changed yet.

## 6. Take the routes off `ariadne-landing`

1. If `ariadne-landing` has a Git build connected (step 0): Workers & Pages →
   ariadne-landing → Settings → Build → **Disconnect**, so a later push can't redeploy it and
   grab the routes back.
2. Workers & Pages → ariadne-landing → Settings → Domains & Routes → delete
   `ariadneagents.si/*` and `www.ariadneagents.si/*`.

From now until step 7 finishes, the apex and `www` show a Cloudflare error page. Do step 7
straight away.

## 7. Attach the apex and `www` to `ariadne`

Do both, in this order:

1. **By hand, for speed:** Workers & Pages → ariadne → Settings → Domains & Routes → Add →
   Route → zone `ariadneagents.si`, route `ariadneagents.si/*`. Again for
   `www.ariadneagents.si/*`. This is live within seconds.
2. **Then make the config match:** push commit 4 to `main`
   (`git merge --ff-only phase0 && git push origin main`). Its `wrangler.jsonc` lists the two
   zone routes and no longer lists `app.`, and it removes `routes` from `landing/wrangler.jsonc`.

   Do this right after the manual step. When a wrangler file has `routes`, a deploy treats
   them as the full list, so a deploy from the old config (only `app.`) could drop the routes
   you added by hand.

## 8. Verify

```sh
curl -sI https://ariadneagents.si/ | head -n 1                    # HTTP/2 200
curl -s  https://ariadneagents.si/ | grep -c "Tie the Thread"     # > 0
curl -sI https://www.ariadneagents.si/ | head -n 1                # HTTP/2 200
curl -sI https://ariadneagents.si/dashboard | grep -i '^location' # /sign-in
curl -sI https://ariadneagents.si/sign-up | head -n 1             # HTTP/2 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ariadneagents.si/api/early-access   # not the old form (404 or 405)
curl -sI https://ariadneagents.si/ | grep -i strict-transport     # security headers present
```

In a private window: open `https://ariadneagents.si`, press **Tie the Thread**, sign up,
create a project, run step 1 once. Check `www.` too, and an Instagram/X in-app browser if
you can. Watch Workers Logs for errors and for requests over the CPU limit (Error 1102).

Accounts signed in on `app.` will need to sign in again on the apex: the session cookie is
per-hostname.

## 9. After the switch: remove `app.` and Cloudflare Access

Only once step 8 looks good (wait at least an hour, ideally a day):

1. Workers & Pages → ariadne → Settings → Domains & Routes → remove the custom domain
   `app.ariadneagents.si`. (Commit 4 already took it out of `wrangler.jsonc`, but that alone
   doesn't detach it.)
2. Zero Trust → Access → Applications → `app.ariadneagents.si` → Delete. Delete its policy
   too if it was a separate reusable policy. Also remove any Access app you made for
   `ariadne.sr-labs.workers.dev` or preview URLs (`workers_dev` and `preview_urls` are off).
3. Turnstile widget → Hostnames → remove `app.ariadneagents.si`.

Optional, for anyone with an old `app.` bookmark: instead of letting `app.` go dead, keep a
proxied DNS record for it and add a Redirect Rule (Rules → Redirect Rules →
`app.ariadneagents.si/*` → `https://ariadneagents.si/${1}`, 301, keep query string) for a
couple of weeks. Old board links land on `/?project=…`, which already goes to `/dashboard`.

---

## Rollback

Migration `0004` is additive and the secrets are harmless to old code, so none of these
steps touch the database.

**R1. Phase 0 code misbehaves, domains not yet moved (after step 5):**

```sh
npx wrangler rollback --name ariadne          # or Deployments → pick the version from step 0 → Rollback
git revert --no-edit <commit 1>^..<commit 3>  # on main, so the next build doesn't redeploy it
git push origin main
```

**R2. Problems after the domain switch (after step 7):**

1. Workers & Pages → ariadne → Domains & Routes → delete `ariadneagents.si/*` and
   `www.ariadneagents.si/*`.
2. Workers & Pages → ariadne-landing → Domains & Routes → add both routes back (zone
   `ariadneagents.si`). The early-access page comes straight back: its Worker and database
   were never deleted.
3. On `main`, `git revert` commit 4 and push, so the next build doesn't re-attach the routes.
4. The product is still on `app.ariadneagents.si` (step 9 hasn't run). If you already removed
   `app.`, re-add it as a custom domain on `ariadne` and recreate the Access app.
5. Reconnect the landing Worker's Git build only if you want it back for good.

**R3. Turnstile blocks real people:** check the widget hostnames (step 3) and that
`TURNSTILE_SECRET` belongs to that widget. As a stopgap set `INVITE_CODES` and hand out codes;
don't remove `TURNSTILE_SECRET` (production then refuses sign-ups).

**R4. Too many sign-ups / spend:** set `INVITE_CODES` (instant, no deploy). The site-wide cap
of 200 model runs a day holds regardless.
