import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { addSources, removeSource } from "@/lib/workspace-server";

export const runtime = "nodejs";

/** Body: { sources: [{ name, mime, bytes, text }] } — text extracted in the browser. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { sources?: unknown } | null;
    const added = await addSources(id, user.id, body?.sources);
    return Response.json({ added }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const sourceId = new URL(request.url).searchParams.get("source") ?? "";
    await removeSource(id, user.id, sourceId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
