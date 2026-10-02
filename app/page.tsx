import { BrandMark } from "@/components/BrandMark";
import { Dashboard } from "@/components/Dashboard";
import { ProjectIntro } from "@/components/ProjectIntro";
import { accountDisplay } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { pickBoardProject } from "@/lib/board-project";
import { needsProjectIntroFor } from "@/lib/demo";
import { missingSetup } from "@/lib/setup";
import { DAILY_MODEL_RUNS, modelRunsToday } from "@/lib/usage";
import { getPrisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";
import Link from "next/link";
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
  const prisma = await getPrisma();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, brief: true, template: true },
  });
  if (await needsProjectIntroFor(user.id, projects)) return <ProjectIntro />;
  const existing = pickBoardProject(projects, requested);

  if (!existing) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
        <BrandMark />
        <h1 className="mt-6 font-serif text-[44px] font-normal leading-none tracking-[-0.015em]">No project yet</h1>
        <p className="mt-3 text-sm leading-normal text-ink-dim">
          Name a project to start a thread. That does not call Claude or GPT.
        </p>
        <Link href="/" className="rt-btn rt-btn-thread mt-5 h-10 w-fit text-sm">
          Start a project
        </Link>
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
          This project could not be opened. It may have been deleted. Nothing is sent to a model from
          this screen.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/" className="rt-btn rt-btn-thread h-10 text-sm">
            Open my projects
          </Link>
          <Link href="/settings#projects" className="rt-btn h-10 text-sm">
            Manage projects
          </Link>
        </div>
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
      accountName={user.firstName?.trim() || user.lastName?.trim() ? account.name : ""}
      runsLeft={runsLeft}
    />
  );
}
