import { HomeMark } from "@/components/BrandMark";
import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { FeedbackPageForm } from "@/components/FeedbackPageForm";

export const dynamic = "force-dynamic";

export default async function FeedbackInbox({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/sign-in");
  const projects = await prisma.project.findMany({ where: { userId: user.id }, select: { id: true, name: true } });
  const rows = await prisma.feedback.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8">
      <HomeMark />
      <div className="mt-2 flex items-end justify-between gap-4">
        <h1 className="font-serif text-[40px] font-normal leading-none tracking-[-0.015em]">Feedback</h1>
        <Link href="/dashboard" className="text-sm text-thread hover:text-thread-bright">
          Back to workspace
        </Link>
      </div>
      <p className="mt-2 text-sm leading-normal text-ink-dim">
        Tell us what helped and what got in the way. The Ariadne team reads every answer. Nothing here runs an agent.
      </p>
      <FeedbackPageForm projects={projects} projectId={projects.some((p) => p.id === project) ? (project ?? null) : null} />
      <h2 className="mt-8 text-xs font-semibold tracking-[0.14em] text-ink-dim uppercase">What you sent</h2>
      {rows.length === 0 ? (
        <p className="mt-8 bg-panel px-4 py-6 text-sm leading-normal text-ink-dim ring-1 ring-line">
          Nothing sent yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="bg-panel px-4 py-3 ring-1 ring-line">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold tracking-[0.14em] text-thread uppercase">
                  {row.kind === "rating" ? `Usefulness ${row.rating ?? "–"}/5` : row.kind}
                </span>
                <time className="font-mono text-xs text-ink-dim" dateTime={row.createdAt.toISOString()}>
                  <LocalTime iso={row.createdAt.toISOString()} format="short" />
                </time>
              </div>
              {row.message ? <p className="mt-2 text-sm leading-normal whitespace-pre-wrap">{row.message}</p> : null}
              {row.worked ? <p className="mt-2 text-sm whitespace-pre-wrap"><b className="font-medium">Worked:</b> {row.worked}</p> : null}
              {row.wrong ? <p className="mt-1 text-sm whitespace-pre-wrap"><b className="font-medium">Wrong / missing:</b> {row.wrong}</p> : null}
              {row.changeFirst ? <p className="mt-1 text-sm whitespace-pre-wrap"><b className="font-medium">Change first:</b> {row.changeFirst}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
