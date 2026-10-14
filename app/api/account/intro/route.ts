import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** {seen: true} marks the first-run intro done; {seen: false} shows it again on the next app page. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => null)) as { seen?: unknown } | null;
    const seen = body?.seen !== false;
    const prisma = await getPrisma();
    await prisma.user.update({ where: { id: user.id }, data: { introSeenAt: seen ? new Date() : null } });
    return Response.json({ seen });
  } catch (error) {
    return errorResponse(error);
  }
}
