import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { listRuns, listVersionRuns } from "@/lib/run-history";
import { serializeTaskRun } from "@/lib/serialize";

export const runtime = "nodejs";

// Read-only run history for one task, oldest first. The task's `output` is the
// latest run; every earlier attempt stays retrievable here. `?view=versions` is the
// light form for v1 → v2: version-able runs only, without the prompts.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const task = await prisma.task.findFirst({
      where: { id, project: { userId: user.id } },
      select: { id: true, output: true },
    });
    if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
    const versionsOnly = new URL(request.url).searchParams.get("view") === "versions";
    const runs = versionsOnly ? await listVersionRuns(task.id) : await listRuns(task.id);
    return Response.json({ taskId: task.id, output: task.output, runs: runs.map(serializeTaskRun) });
  } catch (error) {
    return errorResponse(error);
  }
}
