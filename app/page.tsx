import { BrandMark } from "@/components/BrandMark";
import { Dashboard } from "@/components/Dashboard";
import { ProjectIntro } from "@/components/ProjectIntro";
import { accountDisplay } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { pickBoardProject } from "@/lib/board-project";
import { needsProjectIntro } from "@/lib/demo";
import { missingSetup } from "@/lib/setup";
import { DAILY_MODEL_RUNS, modelRunsToday } from "@/lib/usage";
import { getPrisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const { project: requested } = await searchParams;
  if (await needsProjectIntro(user.id)) return <ProjectIntro />;
  const prisma = await getPrisma();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, brief: true, template: true },
  });
  const existing = pickBoardProject(projects, requested);

  if (!existing) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
        <BrandMark />
        <h1 className="mt-6 font-serif text-[44px] font-normal leading-none tracking-[-0.015em]">No project yet</h1>
        <p className="mt-3 text-sm leading-normal text-ink-dim">
          Sign out and sign in again to name your project. That does not call Claude or GPT.
        </p>
      </main>
    );
  }

  const project = await getProject(existing.id, user.id);
  const account = accountDisplay(user);
  const runsLeft = Math.max(0, DAILY_MODEL_RUNS - (await modelRunsToday(user.id)));
  if (!project) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6">
        <h1 className="font-serif text-[40px] font-normal leading-none tracking-[-0.015em]">Project unavailable</h1>
        <p className="mt-3 text-sm leading-normal text-ink-dim">
          Refresh the page. If it stays empty, run the seed again. Nothing is sent to a model from
          this screen.
        </p>
      </main>
    );
  }

  return (
    <Dashboard
      initial={project}
      projects={projects.map(({ id, name }) => ({ id, name }))}
      missingSetup={missingSetup()}
      email={user.email}
      accountInitial={account.initial}
      runsLeft={runsLeft}
    />
  );
}
