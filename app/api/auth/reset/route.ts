import { resetPassword } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await enforceRateLimit(request, "reset");
    const body = (await request.json().catch(() => null)) as { token?: unknown; password?: unknown } | null;
    await resetPassword(typeof body?.token === "string" ? body.token : "", typeof body?.password === "string" ? body.password : "");
    return Response.json({ ok: true, message: "Password changed. Sign in with your new password." });
  } catch (error) {
    return errorResponse(error);
  }
}
