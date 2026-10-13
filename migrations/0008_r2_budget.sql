-- 0008 (Oct 13 2026): keep R2 inside the free tier. Bytes actually stored per original,
-- and a site-wide count of R2 writes per UTC day.
ALTER TABLE "SourceFile" ADD COLUMN "blobBytes" INTEGER;

CREATE TABLE "R2Day" (
    "day" TEXT NOT NULL PRIMARY KEY,
    "writes" INTEGER NOT NULL DEFAULT 0
);
