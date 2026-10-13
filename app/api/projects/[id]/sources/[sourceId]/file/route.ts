import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { MAX_ORIGINAL_BYTES } from "@/lib/file-store";
import { readOriginal, storeOriginal } from "@/lib/workspace-server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; sourceId: string }> };

/** Body: the raw file bytes. Kept 3 days in R2 under the user's prefix; never parsed here. */
export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id, sourceId } = await context.params;
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_ORIGINAL_BYTES) return Response.json({ error: "Files up to 15 MB" }, { status: 413 });
    const body = await request.arrayBuffer();
    const stored = await storeOriginal(id, user.id, sourceId, body, request.headers.get("content-type"));
    if (!stored) return Response.json({ kept: false, error: "Original files are not kept on this server" }, { status: 503 });
    return Response.json({ kept: true, expiresAt: stored.expiresAt });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id, sourceId } = await context.params;
    const file = await readOriginal(id, user.id, sourceId);
    if (!file) return Response.json({ error: "The original is no longer kept (3 days)" }, { status: 404 });
    return new Response(file.body as BodyInit, {
      headers: {
        "content-type": file.contentType ?? "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
