import "server-only";

import { getPrisma } from "@/lib/prisma";

/**
 * Recomputes an agent's status from its tasks (moved from lib/agents.ts so lib/reclaim.ts
 * can reuse it). Callers that already know the agent's provider skip the agent read and
 * write the status directly (an unchanged status is rewritten as-is); `alsoSet` folds
 * another agent field (the run's model) into that same write.
 */
export async function syncAgentStatus(agentId: string, knownProvider?: string, alsoSet?: { model?: string }) {
  const prisma = await getPrisma();
  const agent = knownProvider
    ? null
    : await prisma.agent.findUnique({ where: { id: agentId }, select: { provider: true, status: true } });
  if (!knownProvider && !agent) return;
  const provider = knownProvider ?? agent!.provider;
  const tasks = await prisma.task.findMany({ where: { agentId }, select: { status: true } });
  const working = tasks.some(
    (task) =>
      task.status === "running" ||
      (provider === "human" && task.status === "awaiting_approval"),
  );
  const status = working
    ? "working"
    : tasks.length > 0 && tasks.every((task) => task.status === "done")
      ? "done"
      : "idle";
  if (knownProvider || agent!.status !== status) {
    await prisma.agent.updateMany({ where: { id: agentId }, data: { status, ...alsoSet } });
  }
}
