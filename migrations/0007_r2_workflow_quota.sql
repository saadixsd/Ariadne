-- 0007 (Oct 14 2026): original files in R2 (3-day lifecycle) and the per-workflow quota.
ALTER TABLE "SourceFile" ADD COLUMN "blobKey" TEXT;
ALTER TABLE "SourceFile" ADD COLUMN "expiresAt" DATETIME;

CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME
);
CREATE INDEX "Workflow_userId_day_idx" ON "Workflow"("userId", "day");
CREATE INDEX "Workflow_projectId_status_idx" ON "Workflow"("projectId", "status");
