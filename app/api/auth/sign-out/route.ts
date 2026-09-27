import { signOut } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST() {
  try {
    await signOut();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
