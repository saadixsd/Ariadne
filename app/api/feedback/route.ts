import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { parseFeedback } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    let input;
    try {
      input = parseFeedback(body);
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
    const user = await requireUser();
    // A project link is only kept for a project this account owns.
    let projectId: string | null = null;
    if (input.projectId) {
      const owned = await prisma.project.findFirst({ where: { id: input.projectId, userId: user.id }, select: { id: true } });
      projectId = owned?.id ?? null;
    }
    const feedback = await prisma.feedback.create({
      data: {
        userId: user.id,
        kind: input.kind,
        message: input.message,
        rating: input.rating,
        worked: input.worked,
        wrong: input.wrong,
        changeFirst: input.changeFirst,
        projectId,
        allowProjectView: projectId !== null && input.allowProjectView,
        source: input.source,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
        triage: "new",
      },
    });
    if (input.source === "popup") {
      await prisma.user.update({ where: { id: user.id }, data: { feedbackPromptAt: new Date() } });
    }
    return Response.json(
      {
        id: feedback.id,
        kind: feedback.kind,
        message: feedback.message,
        rating: feedback.rating,
        createdAt: feedback.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
