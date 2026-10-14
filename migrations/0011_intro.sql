-- 0011 (Oct 14 2026): when the user finished or skipped the first-run intro (null = show it).
ALTER TABLE "User" ADD COLUMN "introSeenAt" DATETIME;
