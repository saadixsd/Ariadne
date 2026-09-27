import { signUp } from "@/lib/auth";
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
    const result = await signUp(email, password);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
