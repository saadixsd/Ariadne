import { prisma } from "../lib/prisma";
import { ensureDemo, ensureMarketProject } from "../lib/demo";

async function main() {
  const id = await ensureDemo();
  await ensureMarketProject();
  const [projects, agents, tasks] = await Promise.all([
    prisma.project.count(),
    prisma.agent.count({ where: { projectId: id } }),
    prisma.task.count({ where: { projectId: id } }),
  ]);
  console.log(`Seeded project ${id} (${projects} project, ${agents} agents, ${tasks} tasks)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
