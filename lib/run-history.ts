import "server-only";

import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type EventStructure = {
  fromTaskId?: string | null;
  toTaskId?: string | null;
  runId?: string | null;
  payload?: Record<string, unknown> | null;
};

/**
 * Writes an ActivityEvent. The human-readable `message` is kept for old clients
 * and the feed; the structured columns are what the UI reads (lib/handoff-preview.ts,
 * lib/lineage.ts).
 */
export async function emitEvent(
  projectId: string,
  type: string,
  message: string,
  taskId: string,
  structure: EventStructure = {},
) {
  const prisma = await getPrisma();
  await prisma.activityEvent.create({
    data: {
      projectId,
      type,
      message,
      taskId,
      fromTaskId: structure.fromTaskId ?? null,
      toTaskId: structure.toTaskId ?? null,
      runId: structure.runId ?? null,
      payload: structure.payload ? JSON.stringify(structure.payload) : null,
    },
  });
}

// D1's adapter reports unique violations as P2002; the local node:sqlite adapter
// passes the raw SQLite message through. Accept both.
function isUniqueViolation(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return true;
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export type RunOutcome = "succeeded" | "failed" | "reclaimed" | "discarded" | "legacy";

export type NewTaskRun = {
  id?: string;
  taskId: string;
  projectId: string;
  outcome: RunOutcome;
  provider?: string | null;
  model?: string | null;
  systemPrompt?: string | null;
  prompt?: string | null;
  output?: string | null;
  error?: string | null;
  latencyMs?: number | null;
  tries?: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

/**
 * Appends one immutable TaskRun row. There is intentionally no update/delete
 * helper for TaskRun anywhere in the app: history is insert-only. `attempt` is the
 * next 1-based ordinal for the task; the (taskId, attempt) unique index makes a
 * concurrent writer retry with the next number instead of overwriting.
 */
export async function recordRun(run: NewTaskRun) {
  const prisma = await getPrisma();
  for (let tryIndex = 0; ; tryIndex++) {
    const last = await prisma.taskRun.findFirst({
      where: { taskId: run.taskId },
      orderBy: { attempt: "desc" },
      select: { attempt: true },
    });
    try {
      return await prisma.taskRun.create({
        data: {
          ...(run.id ? { id: run.id } : {}),
          taskId: run.taskId,
          projectId: run.projectId,
          attempt: (last?.attempt ?? 0) + 1,
          outcome: run.outcome,
          provider: run.provider ?? null,
          model: run.model ?? null,
          systemPrompt: run.systemPrompt ?? null,
          prompt: run.prompt ?? null,
          output: run.output ?? null,
          error: run.error ?? null,
          latencyMs: run.latencyMs ?? null,
          tries: run.tries ?? 1,
          startedAt: run.startedAt ?? null,
          completedAt: run.completedAt ?? null,
        },
      });
    } catch (error) {
      const conflict = isUniqueViolation(error);
      if (!conflict || tryIndex >= 2) throw error;
      // Attempt number was taken by a concurrent writer; if our id collided, mint a new one.
      if (run.id && (await prisma.taskRun.findUnique({ where: { id: run.id }, select: { id: true } }))) {
        run = { ...run, id: undefined };
      }
    }
  }
}

type SnapshotTask = {
  id: string;
  projectId: string;
  output: string | null;
  model: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

/**
 * Before invalidating tasks (rerun, request changes), make sure any output that
 * predates the TaskRun table is preserved as a `legacy` row. Outputs produced
 * after this change already have a TaskRun row, so this is a no-op for them.
 */
export async function preserveLegacyOutputs(tasks: SnapshotTask[]) {
  const prisma = await getPrisma();
  for (const task of tasks) {
    if (!task.output) continue;
    const existing = await prisma.taskRun.count({ where: { taskId: task.id } });
    if (existing > 0) continue;
    await recordRun({
      taskId: task.id,
      projectId: task.projectId,
      outcome: "legacy",
      model: task.model,
      output: task.output,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    });
  }
}

export async function listRuns(taskId: string) {
  const prisma = await getPrisma();
  return prisma.taskRun.findMany({ where: { taskId }, orderBy: { attempt: "asc" } });
}

/**
 * The light read behind v1 → v2: only runs that can be versions (succeeded or legacy,
 * with output), and only the columns the comparison reads. The prompts (which carry
 * every upstream output) stay out, so the payload and the Worker's JSON work are small.
 * The reader still uses listRuns for the full attempt-by-attempt view.
 */
export async function listVersionRuns(taskId: string) {
  const prisma = await getPrisma();
  const rows = await prisma.taskRun.findMany({
    where: { taskId, outcome: { in: ["succeeded", "legacy"] }, output: { not: null } },
    orderBy: { attempt: "asc" },
    select: {
      id: true,
      taskId: true,
      projectId: true,
      attempt: true,
      outcome: true,
      provider: true,
      model: true,
      output: true,
      error: true,
      latencyMs: true,
      tries: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({ ...row, systemPrompt: null, prompt: null }));
}
