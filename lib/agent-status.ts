import "server-only";

import { getPrisma } from "@/lib/prisma";

// Moved unchanged from lib/agents.ts so lib/reclaim.ts can reuse it.
export async function syncAgentStatus(agentId: string) {
  const prisma = await getPrisma();
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return;
  const tasks = await prisma.task.findMany({ where: { agentId } });
  const working = tasks.some(
    (task) =>
      task.status === "running" ||
      (agent.provider === "human" && task.status === "awaiting_approval"),
  );
  const status = working
    ? "working"
    : tasks.length > 0 && tasks.every((task) => task.status === "done")
      ? "done"
      : "idle";
  if (agent.status !== status) {
    await prisma.agent.update({ where: { id: agentId }, data: { status } });
  }
}
