# Database migrations

Production runs on Cloudflare D1 (`ariadne`). Local dev runs on SQLite (`prisma/dev.db`).

## Day to day

- Local: `npm run db:push` applies `prisma/schema.prisma` straight to `prisma/dev.db`.
- Production: every schema change ships as the next `migrations/000N_*.sql`, applied with wrangler:

  ```sh
  npx wrangler d1 migrations list ariadne --remote
  npx wrangler d1 migrations apply ariadne --remote
  ```

  Apply migrations **before** deploying code that needs them. Every migration so far is additive,
  so code that is already deployed keeps working after it.
- To write a migration after editing `schema.prisma`:

  ```sh
  npx prisma migrate diff --from-schema-datamodel <previous schema> \
    --to-schema-datamodel prisma/schema.prisma --script > migrations/000N_name.sql
  ```

  Then regenerate `prisma/d1.sql` (a fresh-database snapshot, never applied to an existing database).
- `npm test` includes `tests/integration/migrations.test.mjs`, which checks that the migrations
  rebuild exactly `schema.prisma`, on a fresh database and on a copy of production's original shape.

## One-off pre-step: `User.firstName` / `User.lastName`

Production's D1 was first built by hand from an early `prisma/d1.sql` that predates the
`firstName` and `lastName` columns on `User`. `migrations/0001_baseline.sql` uses
`CREATE TABLE IF NOT EXISTS`, which cannot add columns to a table that already exists.

Before the first `migrations apply` on a database built that way, check the table:

```sh
npx wrangler d1 execute ariadne --remote --command 'PRAGMA table_info("User")'
```

If `firstName` and `lastName` are missing, add them once:

```sh
npx wrangler d1 execute ariadne --remote --command \
  'ALTER TABLE "User" ADD COLUMN "firstName" TEXT; ALTER TABLE "User" ADD COLUMN "lastName" TEXT;'
```

A database created from `migrations/` (or the current `prisma/d1.sql`) already has both columns
and needs no pre-step.
