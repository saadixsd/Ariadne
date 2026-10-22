import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { LocalTime } from "@/components/LocalTime";
import { currentUser } from "@/lib/auth";
import { projectDoor } from "@/lib/project-door";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = { title: "My projects" };

// "My projects": the list of the user's projects, newest first. Old links still work:
// ?new=1 opens /new, ?project=<id> opens that project, and a user with no project yet
// (or still in the first-run intro) goes to /new.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ project?: string; new?: string }> }) {
  const { project, new: startNew } = await searchParams;
  if (startNew === "1") redirect("/new");
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  if (project) redirect(await projectDoor(project));
  const door = await projectDoor(null);
  if (door === "/new") redirect("/new");
  const prisma = await getPrisma();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true },
  });
  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8 text-ink">
      <div className="flex items-center justify-between">
        <Link href="/" aria-label="Ariadne home"><BrandMark /></Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/settings" className="text-ink-dim hover:text-ink">Settings</Link>
          <Link href="/new" className="bg-thread px-4 py-1.5 font-medium text-raised hover:bg-thread-bright">New check</Link>
        </div>
      </div>
      <h1 className="mt-6 font-serif text-[40px] leading-none tracking-[-0.015em]">My projects</h1>
      <ul className="mt-6 divide-y divide-line ring-1 ring-line" data-testid="projects-list">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/p/${p.id}`} className="flex items-baseline justify-between gap-4 bg-raised px-4 py-3 hover:bg-canvas">
              <span className="min-w-0 break-words">{p.name}</span>
              <span className="shrink-0 text-xs text-ink-faint"><LocalTime iso={p.createdAt.toISOString()} format="date" /></span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-faint">Rename or delete projects in <Link href="/settings" className="text-thread">Settings</Link>.</p>
    </main>
  );
}
