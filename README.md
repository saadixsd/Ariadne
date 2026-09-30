# Ariadne

Ariadne coordinates the AI workforce teams already use. Coordination is the product. The dashboard is only the visibility surface.

This is the phase 1 prototype: Odysseus (Claude, researches and reviews) and Daedalus (GPT, drafts and builds) share one project brief, hand work to each other, and stop at a knot for your approval before anything moves on.

- Thesis: [docs/muse/01_VISION.md](docs/muse/01_VISION.md)
- Project log: [docs/PROJECT_LOG.md](docs/PROJECT_LOG.md)
- Specs: [docs/muse/](docs/muse/)

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_MODEL`, and `ANTHROPIC_MODEL`. Keys stay on the server.
3. `npm install`
4. `npm run db:setup`
5. `npm run dev`

Open [http://localhost:3000](http://localhost:3000).

## Database migrations

- Local dev uses SQLite (`prisma/dev.db`) and `npm run db:push` straight from `prisma/schema.prisma`.
- Production D1 changes go through `migrations/` in wrangler's format:
  `npx wrangler d1 migrations list ariadne --remote`, then `npx wrangler d1 migrations apply ariadne --remote`.
  Apply migrations **before** deploying code that needs them (every migration here is additive).
- When you change `schema.prisma`, add the next `migrations/000N_*.sql` with
  `npx prisma migrate diff --from-schema-datamodel <previous schema> --to-schema-datamodel prisma/schema.prisma --script`,
  and regenerate `prisma/d1.sql` (fresh-database snapshot only, never applied to an existing DB).
