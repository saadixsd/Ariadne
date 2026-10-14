import { requestPasswordReset } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await enforceRateLimit(request, "reset");
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const origin = process.env.NODE_ENV === "production" ? SITE_URL : new URL(request.url).origin;
    return Response.json(await requestPasswordReset(email, origin));
  } catch (error) {
    return errorResponse(error);
  }
}
