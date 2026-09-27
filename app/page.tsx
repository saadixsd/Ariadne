import { Dashboard } from "@/components/Dashboard";
import { missingSetup } from "@/lib/setup";
import { prisma } from "@/lib/prisma";
import { getProject } from "@/lib/project";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: requested } = await searchParams;
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const existing = projects.find((project) => project.id === requested) ?? projects[0];

  if (!existing) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold tracking-[0.22em] text-thread">ARIADNE</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight">No project yet</h1>
        <p className="mt-3 text-sm leading-normal text-ink-dim">
          Run <code className="bg-raised px-1.5 py-0.5 font-mono text-ink">npm run db:setup</code> to
          seed the landing-page example, then refresh. That writes pending tasks only. It does not
          call Claude or GPT.
        </p>
      </main>
    );
  }

  const project = await getProject(existing.id);
  if (!project) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6">
        <h1 className="text-2xl font-semibold leading-tight">Project unavailable</h1>
        <p className="mt-3 text-sm leading-normal text-ink-dim">
          Refresh the page. If it stays empty, run the seed again. Nothing is sent to a model from
          this screen.
        </p>
      </main>
    );
  }

  return <Dashboard initial={project} projects={projects} missingSetup={missingSetup()} />;
}
