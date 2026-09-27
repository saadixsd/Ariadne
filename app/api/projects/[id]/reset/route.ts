import { requireUser } from "@/lib/auth";
import { resetDemo } from "@/lib/demo";
import { errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const existing = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) return Response.json({ error: "Project not found" }, { status: 404 });
    await resetDemo(id);
    const project = await getProject(id, user.id);
    return Response.json(project);
  } catch (error) {
    return errorResponse(error);
  }
}
