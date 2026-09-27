import { rerunTask } from "@/lib/agents";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const task = await rerunTask(id, user.id);
    return Response.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}
