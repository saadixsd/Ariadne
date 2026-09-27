import { rerunTask } from "@/lib/agents";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const task = await rerunTask(id);
    return Response.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}
