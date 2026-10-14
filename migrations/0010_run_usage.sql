-- 0010 (Oct 14 2026): token usage and estimated cost per model run (additive, nullable).
ALTER TABLE "TaskRun" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "TaskRun" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "TaskRun" ADD COLUMN "cacheReadTokens" INTEGER;
ALTER TABLE "TaskRun" ADD COLUMN "toolCalls" INTEGER;
ALTER TABLE "TaskRun" ADD COLUMN "costUsd" REAL;
