-- Migration 0004: invite codes at sign-up (Phase 0B, landing + open sign-up).
-- Additive only: one nullable column. Apply BEFORE pushing the code that reads it
-- (Prisma selects every User column, so the new code fails on a database without it):
--   npx wrangler d1 migrations apply ariadne --remote
-- The code deployed before this migration never reads the column, so applying it early is safe.
-- User.inviteCode holds the INVITE_CODES entry the account signed up with, or NULL for an
-- open sign-up. Invited accounts skip the first-day trial cap (lib/limits.ts).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "inviteCode" TEXT;
