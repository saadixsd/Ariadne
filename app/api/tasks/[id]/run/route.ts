import { runTask } from "@/lib/agents";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { dailyRunLimit } from "@/lib/limits";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const task = await runTask(id, user.id, dailyRunLimit(user));
    return Response.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}
