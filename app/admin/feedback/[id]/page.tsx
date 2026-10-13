import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import MarkdownBody from "@/components/MarkdownBody";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * The project behind one feedback row. Without the person's opt-in only the shape shows
 * (steps, status, run counts, issue decisions). The brief, outputs and uploaded text show
 * only when they ticked "Saad may open this project".
 */
export default async function AdminFeedbackProject({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const row = await prisma.feedback.findUnique({ where: { id } });
  if (!row?.projectId) notFound();
  const project = await prisma.project.findUnique({
    where: { id: row.projectId },
    include: {
      tasks: { orderBy: { createdAt: "asc" }, include: { agent: true, _count: { select: { runs: true } } } },
      issueDecisions: true,
      sources: { select: { name: true, bytes: true, text: row.allowProjectView } },
    },
  });
  if (!project) notFound();
  const decisions = project.issueDecisions.reduce<Record<string, number>>((acc, d) => {
    acc[d.state] = (acc[d.state] ?? 0) + 1;
    return acc;
  }, {});
  const open = row.allowProjectView;

  return (
    <main className="mx-auto min-h-full max-w-3xl px-4 py-8">
      <BrandMark />
      <Link href="/admin/feedback" className="text-sm text-thread">
        ← All feedback
      </Link>
      <h1 className="mt-2 font-serif text-[32px] leading-tight">{open ? project.name : "Project (steps only)"}</h1>
      <p className="mt-1 text-sm text-ink-dim">
        {open ? "The person allowed you to open this project." : "The person did not allow opening this project, so no brief, outputs or file text are shown."}
      </p>
      <p className="mt-3 text-sm">
        Approved: {project.approvedAt ? project.approvedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "no"} · Sources: {project.sources.length} · Issue
        decisions: {Object.entries(decisions).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}
      </p>
      <ol className="mt-4 space-y-3">
        {project.tasks.map((task) => (
          <li key={task.id} className="bg-panel p-3 ring-1 ring-line">
            <div className="text-sm">
              <b>{task.title}</b> · {task.agent.name} · {task.status} · {task._count.runs} run(s)
            </div>
            {open && task.output ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-thread">Output</summary>
                <MarkdownBody text={task.output} />
              </details>
            ) : null}
          </li>
        ))}
      </ol>
      {open ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Brief</h2>
          <p className="mt-1 text-sm whitespace-pre-wrap">{project.brief}</p>
        </section>
      ) : null}
    </main>
  );
}
