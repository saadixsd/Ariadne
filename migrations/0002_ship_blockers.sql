-- Migration 0002: ship-blockers (run history, structured events, auth rate limits).
-- Additive only: new nullable columns and new tables. Code deployed before this
-- migration keeps working after it (Prisma only selects columns it knows about),
-- so apply this migration BEFORE deploying the new Worker.
--
-- Generated with: prisma migrate diff --from-schema-datamodel <baseline schema> --to-schema-datamodel prisma/schema.prisma --script
-- plus the hand-written backfill at the bottom.

-- AlterTable
ALTER TABLE "ActivityEvent" ADD COLUMN "fromTaskId" TEXT;
ALTER TABLE "ActivityEvent" ADD COLUMN "payload" TEXT;
ALTER TABLE "ActivityEvent" ADD COLUMN "runId" TEXT;
ALTER TABLE "ActivityEvent" ADD COLUMN "toTaskId" TEXT;

-- CreateTable
CREATE TABLE "TaskRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "systemPrompt" TEXT,
    "prompt" TEXT,
    "output" TEXT,
    "error" TEXT,
    "latencyMs" INTEGER,
    "tries" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TaskRun_projectId_idx" ON "TaskRun"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRun_taskId_attempt_key" ON "TaskRun"("taskId", "attempt");

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");


-- Backfill structured columns for events written before this migration, so the UI
-- (which now reads only the columns, never the message text) keeps showing old
-- handoffs and approvals. One-time and idempotent (only touches NULL columns).
-- Handoff messages were written as: Handoff: <fromAgent> handed "<fromTitle>" to <toAgent>
-- with taskId = the receiving task. Matching is exact string equality (no LIKE),
-- so titles containing % or _ are safe; events that match nothing stay NULL and the
-- UI falls back to the plain message.
UPDATE "ActivityEvent" SET "toTaskId" = "taskId"
WHERE "type" = 'handoff' AND "toTaskId" IS NULL AND "taskId" IS NOT NULL;

UPDATE "ActivityEvent" SET "fromTaskId" = (
    SELECT t."id"
    FROM "Task" t
    JOIN "Agent" sa ON sa."id" = t."agentId"
    JOIN "Task" r ON r."id" = "ActivityEvent"."taskId"
    JOIN "Agent" ra ON ra."id" = r."agentId"
    WHERE t."projectId" = "ActivityEvent"."projectId"
      AND "ActivityEvent"."message" = 'Handoff: ' || sa."name" || ' handed "' || t."title" || '" to ' || ra."name"
    LIMIT 1
)
WHERE "type" = 'handoff' AND "fromTaskId" IS NULL;

UPDATE "ActivityEvent" SET "payload" = (
    SELECT json_object('fromAgent', sa."name", 'toAgent', ra."name", 'fromTitle', t."title", 'toTitle', r."title")
    FROM "Task" t
    JOIN "Agent" sa ON sa."id" = t."agentId"
    JOIN "Task" r ON r."id" = "ActivityEvent"."taskId"
    JOIN "Agent" ra ON ra."id" = r."agentId"
    WHERE t."id" = "ActivityEvent"."fromTaskId"
)
WHERE "type" = 'handoff' AND "fromTaskId" IS NOT NULL AND "payload" IS NULL;

-- Approvals were always written as: You approved "<title>"
UPDATE "ActivityEvent" SET "payload" = json_object('decision', 'approved', 'approver', 'You')
WHERE "type" = 'approved' AND "payload" IS NULL AND substr("message", 1, 14) = 'You approved "';
