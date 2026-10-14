import { requireAdminApi } from "@/lib/admin";
import { errorResponse } from "@/lib/errors";
import { TRIAGE } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Admin-only: set triage on one feedback row. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi();
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { triage?: unknown; triageNote?: unknown } | null;
    const triage = typeof body?.triage === "string" && (TRIAGE as readonly string[]).includes(body.triage) ? body.triage : null;
    if (!triage) return Response.json({ error: `Triage must be one of ${TRIAGE.join(", ")}` }, { status: 400 });
    const note = typeof body?.triageNote === "string" ? body.triageNote.trim().slice(0, 1000) : undefined;
    const row = await prisma.feedback.update({ where: { id }, data: { triage, ...(note !== undefined ? { triageNote: note } : {}) } });
    return Response.json({ id: row.id, triage: row.triage, triageNote: row.triageNote });
  } catch (error) {
    return errorResponse(error);
  }
}
