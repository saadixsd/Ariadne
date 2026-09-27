import { resendCode } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    await resendCode(email);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
