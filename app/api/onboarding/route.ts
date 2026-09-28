import { requireUser } from "@/lib/auth";
import { startFirstProject } from "@/lib/demo";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      brief?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
    if (!name || !brief) {
      return Response.json({ error: "Name and description are required" }, { status: 400 });
    }
    if (name.length > 120) {
      return Response.json({ error: "Name is too long" }, { status: 400 });
    }
    if (brief.length > 4000) {
      return Response.json({ error: "Description is too long" }, { status: 400 });
    }
    const id = await startFirstProject(user.id, name, brief);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
