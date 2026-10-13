-- 0005 (Oct 14 2026): campaign attribution on User, richer Feedback. Additive only.
ALTER TABLE "User" ADD COLUMN "refCode" TEXT;
ALTER TABLE "User" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "User" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "User" ADD COLUMN "feedbackPromptAt" DATETIME;
ALTER TABLE "Feedback" ADD COLUMN "rating" INTEGER;
ALTER TABLE "Feedback" ADD COLUMN "worked" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "wrong" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "changeFirst" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "allowProjectView" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Feedback" ADD COLUMN "appVersion" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "source" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "triage" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "triageNote" TEXT;
