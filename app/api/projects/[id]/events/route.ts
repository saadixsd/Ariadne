import { getEvents } from "@/lib/project";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const events = await getEvents(id);
  if (!events) return Response.json({ error: "Project not found" }, { status: 404 });
  return Response.json(events);
}
