-- 0006 (Oct 14 2026): workspace — per-issue decisions, uploaded source text, explicit approval.
ALTER TABLE "Project" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "approvedHash" TEXT;

CREATE TABLE "IssueDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "edit" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssueDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IssueDecision_projectId_flagKey_key" ON "IssueDecision"("projectId", "flagKey");

CREATE TABLE "SourceFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT,
    "bytes" INTEGER,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SourceFile_projectId_idx" ON "SourceFile"("projectId");
