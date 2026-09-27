import { decideTask } from "@/lib/agents";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      approved?: unknown;
      note?: unknown;
    } | null;
    if (!body || typeof body.approved !== "boolean") {
      return Response.json(
        { error: "Expected { approved: boolean, note?: string }" },
        { status: 400 },
      );
    }
    const note = typeof body.note === "string" ? body.note : undefined;
    const task = await decideTask(id, body.approved, note);
    return Response.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}
