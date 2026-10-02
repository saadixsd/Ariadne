import { requireUser } from "@/lib/auth";
import { startFirstProject } from "@/lib/demo";
import { errorResponse } from "@/lib/errors";
import { assertMaxLength } from "@/lib/input-caps";
import { MAX_BRIEF_CHARS, MAX_PROJECT_NAME_CHARS } from "@/lib/limits";

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
    assertMaxLength("Name", name, MAX_PROJECT_NAME_CHARS);
    assertMaxLength("Description", brief, MAX_BRIEF_CHARS);
    const id = await startFirstProject(user.id, name, brief);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
