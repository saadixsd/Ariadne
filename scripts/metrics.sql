-- Outreach funnel and usage, read-only. Counts and states only; never reads brief,
-- outputs or uploaded text. Run:
--   npx wrangler d1 execute ariadne --remote --file scripts/metrics.sql
-- (statements run in order; each prints its own table)

-- 1. Funnel by campaign: signed up -> created project -> ran a model step -> approved a deliverable -> left feedback.
SELECT
  COALESCE(u."utmCampaign", '(none)') AS campaign,
  COUNT(DISTINCT u.id) AS signed_up,
  COUNT(DISTINCT p."userId") AS created_project,
  COUNT(DISTINCT CASE WHEN r.id IS NOT NULL THEN p."userId" END) AS ran_a_step,
  COUNT(DISTINCT CASE WHEN p."approvedAt" IS NOT NULL THEN p."userId" END) AS approved_deliverable,
  COUNT(DISTINCT f."userId") AS gave_feedback
FROM "User" u
LEFT JOIN "Project" p ON p."userId" = u.id
LEFT JOIN "TaskRun" r ON r."projectId" = p.id AND r.outcome = 'success'
LEFT JOIN "Feedback" f ON f."userId" = u.id
GROUP BY campaign
ORDER BY signed_up DESC;

-- Prisma may write DateTime as epoch ms or as text, so dates go through typeof().
-- 2. Starts, completions and model runs per day (UTC).
SELECT day, SUM(starts) AS projects_started, SUM(approvals) AS deliverables_approved, SUM(runs) AS model_runs FROM (
  SELECT substr(CASE typeof("createdAt") WHEN 'integer' THEN datetime("createdAt"/1000, 'unixepoch') ELSE "createdAt" END, 1, 10) AS day, 1 AS starts, 0 AS approvals, 0 AS runs FROM "Project"
  UNION ALL
  SELECT substr(CASE typeof("approvedAt") WHEN 'integer' THEN datetime("approvedAt"/1000, 'unixepoch') ELSE "approvedAt" END, 1, 10), 0, 1, 0 FROM "Project" WHERE "approvedAt" IS NOT NULL
  UNION ALL
  SELECT day, 0, 0, runs FROM "UsageDay"
) GROUP BY day ORDER BY day DESC LIMIT 30;

-- 3. Repeat use: accounts active (model runs) on 2+ distinct days, by campaign.
SELECT COALESCE(u."utmCampaign", '(none)') AS campaign, COUNT(*) AS repeat_users
FROM "User" u
WHERE (SELECT COUNT(*) FROM "UsageDay" d WHERE d."userId" = u.id AND d.runs > 0) >= 2
GROUP BY campaign;

-- 4. Feedback ratings by campaign and app version.
SELECT COALESCE(u."utmCampaign", '(none)') AS campaign, f."appVersion", COUNT(*) AS n, ROUND(AVG(f.rating), 2) AS avg_rating
FROM "Feedback" f LEFT JOIN "User" u ON u.id = f."userId"
WHERE f.rating IS NOT NULL
GROUP BY campaign, f."appVersion" ORDER BY n DESC;
