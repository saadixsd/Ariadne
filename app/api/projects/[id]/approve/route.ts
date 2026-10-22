import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { approveDeliverable } from "@/lib/workspace-server";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { hash?: unknown; anyway?: unknown } | null;
    return Response.json(await approveDeliverable(id, user.id, body?.hash, body?.anyway === true));
  } catch (error) {
    return errorResponse(error);
  }
}
