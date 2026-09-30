import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { assertMaxLength } from "@/lib/input-caps";
import { MAX_BRIEF_CHARS, MAX_PROJECT_NAME_CHARS } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { getProject, loadCheckedProject } from "@/lib/project";
import { etagFor, projectVersion } from "@/lib/project-version";

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
