-- 0013 (Oct 21 2026): tester readiness. Additive only.
-- FetchedPage: each page cited in a draft is read ONCE by the Worker and the same text (or
-- the same "could not read" status) is given to the writer, the fact-check and the final
-- answer, so they never disagree about what a source says (fix plan B1/B4).
-- User.testerUntil: invited testers get TESTER_RUNS_PER_DAY runs a day until this date (O2).
-- Apply locally with: npx wrangler d1 migrations apply ariadne --local
ALTER TABLE "User" ADD COLUMN "testerUntil" DATETIME;

CREATE TABLE "FetchedPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "title" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FetchedPage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FetchedPage_projectId_url_key" ON "FetchedPage"("projectId", "url");
