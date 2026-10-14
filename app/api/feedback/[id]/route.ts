import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** The author turns project viewing on or off for one of their own feedback items. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { allowProjectView?: unknown } | null;
    if (typeof body?.allowProjectView !== "boolean") return Response.json({ error: "allowProjectView must be true or false" }, { status: 400 });
    const { count } = await prisma.feedback.updateMany({
      where: { id, userId: user.id, projectId: { not: null } },
      data: { allowProjectView: body.allowProjectView },
    });
    if (count === 0) return Response.json({ error: "Feedback not found" }, { status: 404 });
    return Response.json({ id, allowProjectView: body.allowProjectView });
  } catch (error) {
    return errorResponse(error);
  }
}
