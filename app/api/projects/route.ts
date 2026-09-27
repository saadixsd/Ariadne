import { createRoster } from "@/lib/demo";
import { errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";

export const runtime = "nodejs";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, brief: true, createdAt: true },
  });
  return Response.json(
    projects.map((project) => ({
      ...project,
      createdAt: project.createdAt.toISOString(),
    })),
  );
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
    const project = await prisma.project.create({ data: { name, brief } });
    await createRoster(project.id);
    const created = await getProject(project.id);
    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
