import { steerTask } from "@/lib/agents";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { dailyRunLimit } from "@/lib/limits";

export const runtime = "nodejs";

/** Per-step Intervene: note into this step's packet, then re-run when it already spun. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { note?: unknown } | null;
    const note = typeof body?.note === "string" ? body.note : "";
    const task = await steerTask(id, note, user.id, dailyRunLimit(user));
    return Response.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}
