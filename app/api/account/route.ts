import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { MAX_PERSON_NAME_CHARS, readPersonName } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// The signed-in user's own name. Nothing else about the account is editable here:
// email, password and verification stay with the auth routes.
export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => null)) as { firstName?: unknown; lastName?: unknown } | null;
    if (!body || typeof body !== "object") return Response.json({ error: "Send firstName and/or lastName" }, { status: 400 });
    const data: { firstName?: string | null; lastName?: string | null } = {};
    for (const [key, label] of [["firstName", "First name"], ["lastName", "Last name"]] as const) {
      if (!(key in body)) continue;
      const parsed = readPersonName(body[key]);
      if (parsed === undefined) {
        return Response.json({ error: `${label} must be text of at most ${MAX_PERSON_NAME_CHARS} characters` }, { status: 400 });
      }
      data[key] = parsed;
    }
    if (!("firstName" in data) && !("lastName" in data)) {
      return Response.json({ error: "Send firstName and/or lastName" }, { status: 400 });
    }
    const saved = await prisma.user.update({
      where: { id: user.id },
      data,
      select: { firstName: true, lastName: true },
    });
    return Response.json({ firstName: saved.firstName ?? "", lastName: saved.lastName ?? "" });
  } catch (error) {
    return errorResponse(error);
  }
}
