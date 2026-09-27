import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";
import { serializeTask } from "@/lib/serialize";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const project = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    const body = (await request.json().catch(() => null)) as {
      title?: unknown;
      agentId?: unknown;
      instructions?: unknown;
      dependsOn?: unknown;
      requiresApproval?: unknown;
    } | null;

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const agentId = typeof body?.agentId === "string" ? body.agentId : "";
    const instructions = typeof body?.instructions === "string" ? body.instructions.trim() : "";
    const dependsOn = Array.isArray(body?.dependsOn)
      ? body.dependsOn.filter((item): item is string => typeof item === "string")
      : [];
    if (!title || !agentId || !instructions) {
      return Response.json(
        { error: "title, agentId, and instructions are required" },
        { status: 400 },
      );
    }

    const agent = await prisma.agent.findFirst({ where: { id: agentId, projectId: id } });
    if (!agent) return Response.json({ error: "Agent not found on this project" }, { status: 400 });

    if (dependsOn.length > 0) {
      const found = await prisma.task.count({
        where: { projectId: id, id: { in: dependsOn } },
      });
      if (found !== dependsOn.length) {
        return Response.json({ error: "dependsOn includes an unknown task" }, { status: 400 });
      }
    }

    const task = await prisma.task.create({
      data: {
        projectId: id,
        agentId,
        title,
        instructions,
        dependsOn: JSON.stringify(dependsOn),
        requiresApproval: body?.requiresApproval === true,
      },
    });
    return Response.json({ task: serializeTask(task), project: await getProject(id, user.id) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
