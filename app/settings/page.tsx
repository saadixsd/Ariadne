import { BrandMark } from "@/components/BrandMark";
import { FeedbackConsent } from "@/components/FeedbackConsent";
import { Monogram } from "@/components/ThreadBits";
import { NameForm } from "@/components/NameForm";
import { ProjectsManager } from "@/components/ProjectsManager";
import { SignOutButton } from "@/components/SignOutButton";
import { accountDisplay } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { HANDS } from "@/lib/hands";
import { MAX_PROJECT_NAME_CHARS } from "@/lib/limits";
import { newProjectHref } from "@/lib/new-project";
import { getPrisma } from "@/lib/prisma";
import { DAILY_MODEL_RUNS, workflowsStarted } from "@/lib/usage";
import { WORKFLOWS_PER_DAY } from "@/lib/limits";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings",
};

const HAND_COLORS: Record<string, string> = {
  anthropic: "var(--color-agent-1)",
  openai: "var(--color-agent-2)",
  human: "var(--color-gate)",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const account = accountDisplay(user);
  const limit = WORKFLOWS_PER_DAY;
  const trialEnds = null as Date | null;
  const used = Math.min(limit, await workflowsStarted(user.id));
  const left = Math.max(0, limit - used);
  const prisma = await getPrisma();
  const owned = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true, tasks: { select: { status: true } } },
  });
  const sharedFeedback = (
    await prisma.feedback.findMany({
      where: { userId: user.id, projectId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, projectId: true, allowProjectView: true },
    })
  ).map((f) => ({ id: f.id, createdAt: f.createdAt.toISOString(), project: owned.find((p) => p.id === f.projectId)?.name ?? null, allowProjectView: f.allowProjectView }));
  const projects = owned.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    done: project.tasks.filter((task) => task.status === "done").length,
    total: project.tasks.length,
  }));
  // Back to the project the user came from, while it still exists; otherwise the board
  // opens their next project (or the new-project intro when none are left).
  const { project: from } = await searchParams;
  const back = from && projects.some((project) => project.id === from) ? `/p/${encodeURIComponent(from)}` : "/dashboard";

  return (
    <div className="min-h-full text-ink">
      <header className="bar-safe flex min-h-14 items-center gap-4 border-b border-line bg-raised/60 pb-2 backdrop-blur-md">
        <Link href="/" aria-label="Ariadne, home" className="touch-min">
          <BrandMark className="max-sm:text-[0px]" />
        </Link>
        <div className="flex-1" />
        <Link href={back} className="rt-btn rt-btn-ghost">
          ← Back to the project
        </Link>
      </header>
      <main className="gutter-safe mx-auto grid max-w-2xl gap-6 pt-8 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pt-10 lg:max-w-3xl">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="mt-1 font-serif text-[40px] leading-none tracking-[-0.015em] break-words sm:text-[46px]">{account.firstName || account.lastName || "Your account"}</h1>
        </div>

        <section aria-labelledby="you-title" className="rt-card px-5 py-4">
          <h2 id="you-title" className="font-serif text-[24px] leading-tight">
            You
          </h2>
          <NameForm firstName={account.firstName} lastName={account.lastName} email={user.email} />
        </section>

        <section id="projects" aria-labelledby="projects-title" className="rt-card scroll-mt-4 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="projects-title" className="font-serif text-[24px] leading-tight">
              Projects
            </h2>
            <p className="ml-auto font-mono text-[11.5px] text-ink-faint tnum">{projects.length} {projects.length === 1 ? "project" : "projects"}</p>
            <a href={newProjectHref()} className="rt-btn rt-btn-thread shrink-0 self-center">
              ＋ New project
            </a>
          </div>
          <ProjectsManager projects={projects} maxName={MAX_PROJECT_NAME_CHARS} />
        </section>

        <section id="feedback" aria-labelledby="feedback-title" className="rt-card scroll-mt-4 px-5 py-4">
          <h2 id="feedback-title" className="font-serif text-[24px] leading-tight">
            Feedback you&apos;ve shared
          </h2>
          <p className="mt-1 text-[13px] text-ink-dim">
            When this is on, the Ariadne team may open that project to understand your feedback. When it is off, we only see which steps ran and how many issues were raised.
          </p>
          <FeedbackConsent items={sharedFeedback} />
        </section>

        <section aria-labelledby="budget-title" className="rt-card px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="budget-title" className="font-serif text-[24px] leading-tight">
              Today&apos;s workflows
            </h2>
            <p className="font-serif text-[30px] leading-none tnum">
              {left}
              <span className="text-ink-faint">/{limit}</span>
              <span className="ml-1.5 font-sans text-[13px] text-ink-dim">left</span>
            </p>
          </div>
          <div className="mt-3 flex h-2 gap-0.5" role="img" aria-label={`${used} of ${limit} workflows started today`}>
            {Array.from({ length: limit }, (_, index) => (
              <i key={index} className={`block h-full flex-1 rounded-sm ${index < used ? "bg-thread" : "bg-line"}`} />
            ))}
          </div>
          <p className="mt-2.5 text-[13px] leading-normal text-ink-dim">
            {used} started today. A workflow is one Draft → Challenge → Judge → Tie Off pass on a project; reruns and revisions inside it do not count again, and approving the deliverable finishes it. A failed first run does not count. The count starts again at midnight UTC.
          </p>
          {trialEnds ? (
            <p className="mt-1.5 text-[13px] leading-normal text-ink-dim" data-trial>
              Your first day includes {limit} runs. From{" "}
              <time dateTime={trialEnds.toISOString()}>
                {trialEnds.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
              </time>{" "}
              you get {DAILY_MODEL_RUNS} a day.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="hands-title" className="rt-card px-5 py-4">
          <h2 id="hands-title" className="font-serif text-[24px] leading-tight">
            The hands
          </h2>
          <p className="mt-1 text-[13px] text-ink-dim">Every project has the same three. They hand work along the thread; you judge at each knot.</p>
          <ul className="mt-3 grid gap-2.5">
            {HANDS.map((hand) => (
              <li key={hand.name} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-line bg-panel px-3.5 py-3">
                <Monogram tone={{ name: hand.name, initial: hand.name[0], color: HAND_COLORS[hand.provider], human: hand.provider === "human" }} size={28} />
                <div className="min-w-0">
                  <p className="font-serif text-[20px] leading-tight">{hand.name}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-dim">{hand.does}</p>
                </div>
                <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] ${hand.provider === "human" ? "bg-gate-bg text-gate-ink" : "bg-canvas text-ink-dim ring-1 ring-line"}`}>
                  {hand.family}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-[13px] text-ink-dim">Signing out ends this session on this device.</p>
          <SignOutButton />
        </section>
      </main>
    </div>
  );
}
