# Ariadne

Ariadne coordinates the AI workforce teams already use. Coordination is the product. The dashboard is only the visibility surface.

This is the phase 1 prototype: Scout (Claude) and Maker (GPT) share one project brief, hand work to each other, and stop for a human approval before a landing page is built.

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
