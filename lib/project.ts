import "server-only";

import { prisma } from "@/lib/prisma";
import { isStuck, reclaimStuckTasks } from "@/lib/reclaim";
import { serializeEvent, serializeProject } from "@/lib/serialize";
import type { ActivityEventDTO, ProjectDTO } from "@/lib/types";

const projectInclude = {
  agents: true,
  tasks: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { createdAt: "desc" as const }, take: 100 },
};

// Both read paths (board/tree load and the 2s event poll) lazily recover tasks
// stuck in `running`, so a dead run becomes runnable again without a cron.
//
// One owned load first; the reclaim (and a reload) only happens when a loaded task is
// actually `running` past the timeout. Same outcome as probing ownership and running
// the reclaim scan up front, without two extra queries on every page load (Worker CPU).
export async function getProject(id: string, userId: string): Promise<ProjectDTO | null> {
  const project = await prisma.project.findFirst({
    where: { id, userId },
    include: projectInclude,
  });
  if (!project) return null;
  const now = Date.now();
  if (project.tasks.some((task) => task.status === "running" && isStuck(task, now))) {
    await reclaimStuckTasks(id, now);
    return loadCheckedProject(id, userId);
  }
  return serializeProject(project);
}

/**
 * Full project load for callers that have just checked ownership and run stuck-run
 * recovery themselves (the polled GET, via projectVersion). Saves the ownership
 * probe and the reclaim scan that getProject would repeat.
 */
export async function loadCheckedProject(id: string, userId: string): Promise<ProjectDTO | null> {
  const project = await prisma.project.findFirst({ where: { id, userId }, include: projectInclude });
  return project ? serializeProject(project) : null;
}

export async function getEvents(projectId: string, userId: string): Promise<ActivityEventDTO[] | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, tasks: { where: { status: "running" }, select: { id: true, startedAt: true } } },
  });
  if (!project) return null;
  const now = Date.now();
  if (project.tasks.some((task) => isStuck(task, now))) await reclaimStuckTasks(projectId, now);
  const events = await prisma.activityEvent.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return events.map(serializeEvent);
}
