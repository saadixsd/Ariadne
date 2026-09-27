import "server-only";

import { prisma } from "@/lib/prisma";
import { serializeEvent, serializeProject } from "@/lib/serialize";
import type { ActivityEventDTO, ProjectDTO } from "@/lib/types";

const projectInclude = {
  agents: true,
  tasks: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { createdAt: "desc" as const }, take: 100 },
};

export async function getProject(id: string, userId: string): Promise<ProjectDTO | null> {
  const project = await prisma.project.findFirst({
    where: { id, userId },
    include: projectInclude,
  });
  if (!project) return null;
  return serializeProject(project);
}

export async function getEvents(projectId: string, userId: string): Promise<ActivityEventDTO[] | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return null;
  const events = await prisma.activityEvent.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return events.map(serializeEvent);
}
