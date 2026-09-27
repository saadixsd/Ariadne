import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { getEvents } from "@/lib/project";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const events = await getEvents(id, user.id);
    if (!events) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json(events);
  } catch (error) {
    return errorResponse(error);
  }
}
