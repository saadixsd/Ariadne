# Ariadne

**Ariadne helps you verify important AI-generated work by having one AI model challenge
another, while you remain the final judge.**

One model drafts, a model from a different family challenges the draft, and you judge:
**Draft → Challenge → Judge → Tie Off.** Nothing moves past a *knot* until you decide.

## Hosted product discontinued

The managed site at **ariadneagents.si** is offline. Cloudflare Workers, D1 data, and
hosted API secrets for that deployment have been removed. Ariadne is now an
**open-source, self-hosted / local** app: you bring your own Anthropic and OpenAI API keys
(BYOK). The Ariadne team does not run a public multi-tenant service anymore.

## Quick start (local BYOK)

1. Clone this repo and install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set your own keys (never commit `.env`):

   ```bash
   cp .env.example .env
   ```

   Required:

   - `OPENAI_API_KEY` — your OpenAI key
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `ARIADNE_SELF_HOST=1` — lifts the old hosted daily quotas so your own keys are not
     throttled by the previous multi-tenant caps

   Optional locally: Turnstile (`TURNSTILE_SECRET`), invite codes (`INVITE_CODES`),
   `CONTACT_EMAIL` for Help / privacy mailto links.

3. Set up the local database and run the app:

   ```bash
   npm run db:setup
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

You pay the model providers directly. Revoke any keys that were ever shared with the old
hosted Worker.

## Self-host on Cloudflare (optional)

The repo still includes OpenNext + `wrangler.jsonc` for deploying your **own** Worker.
That is optional. If you deploy:

- Create your own D1 / R2 (do not reuse old hosted IDs unless you intend to).
- Put `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` as **your** Worker secrets.
- Set `ARIADNE_SELF_HOST=1` as a Worker var.
- Point DNS / routes at **your** domain — the old ariadneagents.si zone routes are gone.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/WORKSPACE.md`](docs/WORKSPACE.md)
for how the product works. Historical cutover notes live under [`docs/`](docs/).

## How it works

![How a run moves through Ariadne](docs/diagrams/02-run-pipeline-sequence.png)

The default screen is the **Workspace** (`/p/[id]`). New projects start at `/new`.
Board and Tree remain under *Advanced views*.

## License

MIT — see [LICENSE](LICENSE).

Built by the Ariadne team, with AI coding assistants used during development.
History: [CHANGELOG.md](CHANGELOG.md), [docs/PROJECT_LOG.md](docs/PROJECT_LOG.md).
