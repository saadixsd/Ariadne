import "server-only";
import { currentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { needsProjectIntroFor } from "@/lib/starter-thread";

/**
 * Where a signed-in visitor lands: the named project's Workspace when they own it,
 * otherwise their newest project, or /new when they have none. The old Board (/dashboard)
 * and Tree (/tree) URLs both resolve through here, so old links keep working.
 */
export async function projectDoor(requested?: string | null): Promise<string> {
  const user = await currentUser();
  if (!user) return "/sign-in";
  if (!user.emailVerified) return "/verify";
  const prisma = await getPrisma();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, brief: true, template: true },
  });
  if (requested && projects.some((p) => p.id === requested)) return `/p/${requested}`;
  if (await needsProjectIntroFor(user.id, projects)) return "/new";
  return `/p/${projects[projects.length - 1].id}`;
}
