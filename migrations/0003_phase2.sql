-- Migration 0003: Phase 2 (hands renamed; indexes for the cheap board poll).
-- Safe to apply before or after deploying the Phase 2 Worker:
--  * The code maps the old names for display and prompts (lib/hands.ts handName),
--    so the rename only makes the stored rows match what users already see.
--  * The indexes are additive.
-- Roles, providers and model ids are NOT changed.

-- Rename the hands: Scout -> Odysseus (Claude), Maker -> Daedalus (GPT).
UPDATE "Agent" SET "name" = 'Odysseus' WHERE "name" = 'Scout' AND "provider" = 'anthropic';
UPDATE "Agent" SET "name" = 'Daedalus' WHERE "name" = 'Maker' AND "provider" = 'openai';

-- The poll reads "tasks of a project" and "newest event of a project" every few seconds.
-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "ActivityEvent_projectId_createdAt_idx" ON "ActivityEvent"("projectId", "createdAt");
