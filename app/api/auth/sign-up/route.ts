import { checkSignUpInput, signUp } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { checkInvite, requireHuman } from "@/lib/signup-guard";

export const runtime = "nodejs";

// Order: per-IP rate limit (every attempt counts) -> body -> email/password shape ->
// Turnstile -> invite switch -> create the account. Nothing touches the User table until
// the visitor has passed Turnstile, so a bot cannot even learn whether an email exists.
export async function POST(request: Request) {
  try {
    await enforceRateLimit(request, "signup");
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
      turnstileToken?: unknown;
      inviteCode?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    checkSignUpInput(email, password);
    await requireHuman(typeof body?.turnstileToken === "string" ? body.turnstileToken : "", clientIp(request));
    const inviteCode = checkInvite(typeof body?.inviteCode === "string" ? body.inviteCode : "");
    const result = await signUp(email, password, { inviteCode });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
