import { LiveTree } from "@/components/LiveTree";
import { currentUser } from "@/lib/auth";
import { pickBoardProject } from "@/lib/board-project";
import { needsProjectIntro } from "@/lib/demo";
import { DAILY_MODEL_RUNS, modelRunsToday } from "@/lib/usage";
import { getPrisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";
import { redirect } from "next/navigation";
import "./tree.css";

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
  if (await needsProjectIntro(user.id)) redirect("/");
  const { project: requested } = await searchParams;
  const prisma = await getPrisma();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, brief: true, template: true },
  });
  const existing = pickBoardProject(projects, requested);
  if (!existing) redirect("/");
  const project = await getProject(existing.id, user.id);
  if (!project) redirect("/");
  const runsLeft = Math.max(0, DAILY_MODEL_RUNS - (await modelRunsToday(user.id)));

  return (
    <LiveTree
      initial={project}
      projects={projects.map(({ id, name }) => ({ id, name }))}
      runsLeft={runsLeft}
    />
  );
}
