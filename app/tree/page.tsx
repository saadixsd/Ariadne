import { LiveTree } from "@/components/LiveTree";
import { accountDisplay } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { pickBoardProject } from "@/lib/board-project";
import { needsProjectIntroFor } from "@/lib/starter-thread";
import { dailyRunLimit, modelRunsToday } from "@/lib/usage";
import { getPrisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coordination tree · Ariadne",
};

export default async function TreePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const { project: requested } = await searchParams;
  const prisma = await getPrisma();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, brief: true, template: true },
  });
  if (await needsProjectIntroFor(user.id, projects)) redirect("/dashboard");
  const existing = pickBoardProject(projects, requested);
  if (!existing) redirect("/dashboard");
  const project = await getProject(existing.id, user.id);
  if (!project) redirect("/dashboard");
  const runsLimit = dailyRunLimit(user);
  const runsLeft = Math.max(0, runsLimit - (await modelRunsToday(user.id)));

  return (
    <LiveTree
      initial={project}
      projects={projects.map(({ id, name }) => ({ id, name }))}
      runsLeft={runsLeft}
      runsLimit={runsLimit}
      authorName={accountDisplay(user).name}
      accountInitial={accountDisplay(user).initial}
    />
  );
}
