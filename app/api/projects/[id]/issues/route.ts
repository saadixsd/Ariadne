import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { decideIssue } from "@/lib/workspace-server";

export const runtime = "nodejs";

/** Save your decision on one Challenge dispute. Never runs a model. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    return Response.json(await decideIssue(id, user.id, body));
  } catch (error) {
    return errorResponse(error);
  }
}
