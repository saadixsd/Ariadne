import { deleteProjectOriginals } from "@/lib/workspace-server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { assertMaxLength } from "@/lib/input-caps";
import { MAX_BRIEF_CHARS, MAX_PROJECT_NAME_CHARS } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { getProject, loadCheckedProject } from "@/lib/project";
import { etagFor, projectVersion } from "@/lib/project-version";
import { reclaimStuckTasks } from "@/lib/reclaim";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

// Polled by the Board and Tree. The client echoes the ETag back as If-None-Match;
// while nothing changed the answer is a body-less 304 after two small reads.
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const version = await projectVersion(id, user.id);
    if (!version) return Response.json({ error: "Project not found" }, { status: 404 });
    const etag = etagFor(version);
    const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    const project = await loadCheckedProject(id, user.id);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json(project, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const existing = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) return Response.json({ error: "Project not found" }, { status: 404 });

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      brief?: unknown;
    } | null;
    const data: { name?: string; brief?: string } = {};
    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
      assertMaxLength("Name", name, MAX_PROJECT_NAME_CHARS);
      data.name = name;
    }
    if (typeof body?.brief === "string") {
      const brief = body.brief.trim();
      if (!brief) return Response.json({ error: "Brief is required" }, { status: 400 });
      assertMaxLength("Brief", brief, MAX_BRIEF_CHARS);
      data.brief = brief;
    }
    if (!data.name && !data.brief) {
      return Response.json({ error: "Name or brief is required" }, { status: 400 });
    }

    await prisma.project.update({ where: { id }, data });
    const project = await getProject(id, user.id);
    return Response.json(project);
  } catch (error) {
    return errorResponse(error);
  }
}

// Deletes one of the caller's own projects. Agents, tasks, task runs and ledger events
// go with it through the schema's ON DELETE CASCADE foreign keys (migrations 0001/0002),
// in the same single DELETE statement. UsageDay is keyed to the user, not the project,
// so today's run count is untouched. Anyone else's project, or a missing one, is a 404.
export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const owned = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!owned) return Response.json({ error: "Project not found" }, { status: 404 });
    // A live run still holds a quota reservation and will write its result back, so
    // wait for it. A run stuck past the timeout is reclaimed first and never blocks.
    await reclaimStuckTasks(id);
    const spinning = await prisma.task.findFirst({
      where: { projectId: id, status: "running" },
      select: { id: true },
    });
    if (spinning) {
      return Response.json({ error: "A step is still running. Wait for it to land, then delete the project." }, { status: 409 });
    }
    // Originals in R2 go first (the lifecycle rule would remove them within 3 days anyway).
    await deleteProjectOriginals(id, user.id);
    // userId in the filter again, so ownership is enforced by the delete itself.
    const { count } = await prisma.project.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) return Response.json({ error: "Project not found" }, { status: 404 });
    const next = await prisma.project.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return Response.json({ deleted: id, nextProjectId: next?.id ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
