import { Dashboard } from "@/components/Dashboard";
import { ProjectIntro } from "@/components/ProjectIntro";
import { accountDisplay } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { pickBoardProject } from "@/lib/board-project";
import { needsProjectIntroFor } from "@/lib/starter-thread";
import { missingSetup } from "@/lib/setup";
import { dailyRunLimit, modelRunsToday } from "@/lib/usage";
import { getPrisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The board. It lived at "/" until the landing page took that path; proxy.ts sends old
// "/?project=" links here.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; new?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const { project: requested, new: startNew } = await searchParams;
  const prisma = await getPrisma();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, brief: true, template: true },
  });
  // Default door is the Workspace (/p/[id]) or the new-project flow (/new). The Board is
  // the advanced view: it opens when a project is named (?project=) or with ?new=1.
  if (!requested && startNew !== "1") {
    if (await needsProjectIntroFor(user.id, projects)) redirect("/new");
    redirect(`/p/${projects[projects.length - 1].id}`);
  }
  if (await needsProjectIntroFor(user.id, projects)) return <ProjectIntro />;
  // needsProjectIntroFor() is true for a user with no projects, so a project always exists here.
  const existing = pickBoardProject(projects, requested)!;

  const project = await getProject(existing.id, user.id);
  const account = accountDisplay(user);
  const runsLimit = dailyRunLimit(user);
  const runsLeft = Math.max(0, runsLimit - (await modelRunsToday(user.id)));
  if (!project) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6">
        <h1 className="font-serif text-[40px] font-normal leading-none tracking-[-0.015em]">Project unavailable</h1>
        <p className="mt-3 text-sm leading-normal text-ink-dim">
          This project could not be opened. It may have been deleted. Nothing is sent to a model from
          this screen.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard" className="rt-btn rt-btn-thread h-10 text-sm">
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
      runsLimit={runsLimit}
      startNew={startNew === "1"}
    />
  );
}
