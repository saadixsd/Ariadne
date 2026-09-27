import { verifyEmail } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      code?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const code = typeof body?.code === "string" ? body.code : "";
    await verifyEmail(email, code);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
