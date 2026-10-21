import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { verifyCheckTask } from "@/lib/pages-server";

export const runtime = "nodejs";

/** Checks each "supported" quote of a finished fact-check against the pages Ariadne read. No model. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = ((await request.json().catch(() => null)) ?? {}) as { taskId?: unknown };
    return Response.json(await verifyCheckTask(id, user.id, body.taskId));
  } catch (error) {
    return errorResponse(error);
  }
}
