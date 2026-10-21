import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { fetchSharedPage, pageStatuses } from "@/lib/pages-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Which cited pages Ariadne has read for this project (status only). */
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const owned = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!owned) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json({ pages: await pageStatuses(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Read one cited page once (one page per request keeps Worker CPU small). Never runs a model. */
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = ((await request.json().catch(() => null)) ?? {}) as { url?: unknown };
    const page = await fetchSharedPage(id, user.id, body.url);
    return Response.json({ url: page.url, status: page.status, note: page.note, title: page.title, fetchedAt: page.fetchedAt });
  } catch (error) {
    return errorResponse(error);
  }
}
