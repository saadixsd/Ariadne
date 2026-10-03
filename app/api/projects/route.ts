import { requireUser } from "@/lib/auth";
import { createUserProject } from "@/lib/starter-thread";
import { errorResponse } from "@/lib/errors";
import { assertMaxLength } from "@/lib/input-caps";
import { MAX_BRIEF_CHARS, MAX_PROJECT_NAME_CHARS } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, brief: true, createdAt: true },
    });
    return Response.json(
      projects.map((project) => ({
        ...project,
        createdAt: project.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      brief?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
    if (!name || !brief) {
      return Response.json({ error: "Name and brief are required" }, { status: 400 });
    }
    assertMaxLength("Name", name, MAX_PROJECT_NAME_CHARS);
    assertMaxLength("Brief", brief, MAX_BRIEF_CHARS);
    const user = await requireUser();
    const projectId = await createUserProject(user.id, name, brief);
    const created = await getProject(projectId, user.id);
    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
