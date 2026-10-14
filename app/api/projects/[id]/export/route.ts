import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { exportRecord } from "@/lib/thread-server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { name, markdown } = await exportRecord(id, user.id);
    const file = `${name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "thread"}-record.md`;
    return new Response(markdown, {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
