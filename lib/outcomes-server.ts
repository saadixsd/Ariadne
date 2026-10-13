import "server-only";

import { ABANDONED_AFTER_MS, errorType, type Outcome } from "@/lib/outcomes";
import { prisma } from "@/lib/prisma";

/** Per-account workflow outcomes (definitions in lib/outcomes.ts). Newest activity first. */
export async function workflowOutcomes(now = Date.now(), limit = 200): Promise<Outcome[]> {
  const [projects, workflows, challengeRuns, failed, feedback] = await Promise.all([
    prisma.project.findMany({ select: { id: true, userId: true, approvedAt: true, createdAt: true } }),
    prisma.workflow.findMany({ select: { userId: true, projectId: true, status: true, createdAt: true } }),
    prisma.taskRun.findMany({ where: { outcome: "succeeded", provider: "openai" }, select: { projectId: true }, distinct: ["projectId"] }),
    prisma.taskRun.findMany({ where: { outcome: "failed" }, select: { projectId: true, error: true } }),
    prisma.feedback.groupBy({ by: ["userId"], where: { userId: { not: null } }, _count: { _all: true }, _avg: { rating: true } }),
  ]);
  const owner = new Map(projects.map((p) => [p.id, p.userId]));
  const approvedProject = new Set(projects.filter((p) => p.approvedAt).map((p) => p.id));
  const by = new Map<string, Outcome>();
  const row = (userId: string) => {
    let r = by.get(userId);
    if (!r) {
      r = { userId, campaign: null, refCode: null, feedback: 0, avgRating: null, projects: 0, started: 0, challenged: 0, approved: 0, abandoned: 0, failures: {}, lastActive: null };
      by.set(userId, r);
    }
    return r;
  };
  const touch = (r: { lastActive: string | null }, at: Date) => {
    const iso = at.toISOString();
    if (!r.lastActive || iso > r.lastActive) r.lastActive = iso;
  };
  for (const p of projects) {
    if (!p.userId) continue;
    const r = row(p.userId);
    r.projects += 1;
    if (p.approvedAt) {
      r.approved += 1;
      touch(r, p.approvedAt);
    }
    touch(r, p.createdAt);
  }
  for (const w of workflows) {
    const r = row(w.userId);
    r.started += 1;
    touch(r, w.createdAt);
    if (w.status === "open" && now - w.createdAt.getTime() > ABANDONED_AFTER_MS && !approvedProject.has(w.projectId)) r.abandoned += 1;
  }
  for (const c of challengeRuns) {
    const u = owner.get(c.projectId);
    if (u) row(u).challenged += 1;
  }
  for (const f of failed) {
    const u = owner.get(f.projectId);
    if (!u) continue;
    const t = errorType(f.error);
    const r = row(u);
    r.failures[t] = (r.failures[t] ?? 0) + 1;
  }
  for (const f of feedback) {
    if (!f.userId || !by.has(f.userId)) continue;
    const r = by.get(f.userId)!;
    r.feedback = f._count._all;
    r.avgRating = f._avg.rating;
  }
  const users = await prisma.user.findMany({ where: { id: { in: [...by.keys()] } }, select: { id: true, utmCampaign: true, refCode: true } });
  const known = new Set(users.map((u) => u.id));
  for (const u of users) {
    const r = by.get(u.id)!;
    r.campaign = u.utmCampaign;
    r.refCode = u.refCode;
  }
  return [...by.values()]
    .filter((r) => known.has(r.userId))
    .sort((a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""))
    .slice(0, limit);
}
