import { errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const KINDS = new Set(["bug", "idea", "confusing"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      kind?: unknown;
      message?: unknown;
    } | null;
    const kind = typeof body?.kind === "string" ? body.kind : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!KINDS.has(kind)) {
      return Response.json({ error: "Kind must be bug, idea, or confusing" }, { status: 400 });
    }
    if (!message) return Response.json({ error: "Message is required" }, { status: 400 });
    if (message.length > 4000) {
      return Response.json({ error: "Message is too long" }, { status: 400 });
    }
    const feedback = await prisma.feedback.create({ data: { kind, message } });
    return Response.json(
      {
        id: feedback.id,
        kind: feedback.kind,
        message: feedback.message,
        createdAt: feedback.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
