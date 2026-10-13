import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** "Not now" on the first-completion popup: it does not come back. /feedback stays open. */
export async function POST() {
  try {
    const user = await requireUser();
    await prisma.user.update({ where: { id: user.id }, data: { feedbackPromptAt: new Date() } });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
