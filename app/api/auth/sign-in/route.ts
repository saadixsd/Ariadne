import { signIn } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    await signIn(email, password);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
