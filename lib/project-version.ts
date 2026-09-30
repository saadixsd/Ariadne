import "server-only";

import { prisma } from "@/lib/prisma";
import { isStuck, reclaimStuckTasks } from "@/lib/reclaim";

/**
 * A cheap fingerprint of everything the Board and Tree render from a project:
 * name, brief, each task's id/status/timestamps, and the newest event. Two small
 * indexed reads (the project with a thin task list, then the newest event id)
 * instead of the full project + 100 events. The poll sends it back as If-None-Match
 * and gets a body-less 304 while nothing changed.
 *
 * Stuck-run recovery still happens on this path, but only when one of the thin
 * task rows is actually `running` past the timeout, so an idle poll issues no
 * reclaim queries at all.
 */
export async function projectVersion(id: string, userId: string, allowReclaim = true): Promise<string | null> {
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: {
      name: true,
      brief: true,
      tasks: { select: { id: true, status: true, startedAt: true, completedAt: true, instructions: true } },
    },
  });
  if (!project) return null;
  const now = Date.now();
  if (allowReclaim && project.tasks.some((task) => task.status === "running" && isStuck(task, now))) {
    await reclaimStuckTasks(id, now);
    return projectVersion(id, userId, false);
  }
  const newest = await prisma.activityEvent.findFirst({
    where: { projectId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const parts: (string | number)[] = [project.name, project.brief, newest?.id ?? ""];
  for (const task of [...project.tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    parts.push(
      task.id,
      task.status,
      task.startedAt?.getTime() ?? "",
      task.completedAt?.getTime() ?? "",
      task.instructions.length,
    );
  }
  return fnv1a(parts.join("\u0001"));
}

/** 64-bit FNV-1a as hex (two 32-bit lanes). Not cryptographic: a change detector only. */
function fnv1a(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ input.length;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x5bd1e995);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function etagFor(version: string): string {
  return `W/"p-${version}"`;
}
