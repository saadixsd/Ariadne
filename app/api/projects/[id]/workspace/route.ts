import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { loadWorkspace } from "@/lib/workspace-server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const data = await loadWorkspace(id, user.id);
    if (!data) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
