# Landing worker (optional)

Optional early-access / waitlist Worker under `landing/`. Not required to run Ariadne
locally. The main app is the Next.js project at the repo root.

## Local

```bash
cd landing
cp .dev.vars.example .dev.vars   # fill placeholders only
npm install
npx wrangler dev
```

See `landing.config.json` for the Turnstile site key used by the static pages (defaults to
Cloudflare's always-pass test key).
