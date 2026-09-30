import { BrandMark } from "@/components/BrandMark";
import { Monogram } from "@/components/ThreadBits";
import { SignOutButton } from "@/components/SignOutButton";
import { accountDisplay } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { HANDS } from "@/lib/hands";
import { DAILY_MODEL_RUNS, modelRunsToday } from "@/lib/usage";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings · Ariadne",
};

const HAND_COLORS: Record<string, string> = {
  anthropic: "var(--color-agent-1)",
  openai: "var(--color-agent-2)",
  human: "var(--color-gate)",
};

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const account = accountDisplay(user);
  const used = Math.min(DAILY_MODEL_RUNS, await modelRunsToday(user.id));
  const left = Math.max(0, DAILY_MODEL_RUNS - used);

  return (
    <div className="min-h-full text-ink">
      <header className="flex min-h-14 items-center gap-4 border-b border-line bg-raised/60 px-4 py-2 backdrop-blur-md sm:px-7">
        <Link href="/" aria-label="Back to the board">
          <BrandMark className="max-sm:text-[0px]" />
        </Link>
        <div className="flex-1" />
        <Link href="/" className="rt-btn rt-btn-ghost">
          ← Back to the thread
        </Link>
      </header>
      <main className="mx-auto grid max-w-2xl gap-6 px-5 pt-10 pb-20 sm:px-7">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="mt-1 font-serif text-[46px] leading-none tracking-[-0.015em]">{account.firstName || "Your account"}</h1>
        </div>

        <section aria-labelledby="you-title" className="rt-card px-5 py-4">
          <h2 id="you-title" className="font-serif text-[24px] leading-tight">
            You
          </h2>
          <dl className="mt-3 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13.5px]">
            <dt className="text-ink-faint">First name</dt>
            <dd>{account.firstName || <span className="text-ink-faint">Not set</span>}</dd>
            <dt className="text-ink-faint">Last name</dt>
            <dd>{account.lastName || <span className="text-ink-faint">Not set</span>}</dd>
            <dt className="text-ink-faint">Email</dt>
            <dd className="truncate font-mono text-[12.5px]">{user.email}</dd>
          </dl>
        </section>

        <section aria-labelledby="budget-title" className="rt-card px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="budget-title" className="font-serif text-[24px] leading-tight">
              Today&apos;s runs
            </h2>
            <p className="font-serif text-[30px] leading-none tnum">
              {left}
              <span className="text-ink-faint">/{DAILY_MODEL_RUNS}</span>
              <span className="ml-1.5 font-sans text-[13px] text-ink-dim">left</span>
            </p>
          </div>
          <div className="mt-3 flex h-2 gap-0.5" role="img" aria-label={`${used} of ${DAILY_MODEL_RUNS} runs used today`}>
            {Array.from({ length: DAILY_MODEL_RUNS }, (_, index) => (
              <i key={index} className={`block h-full flex-1 rounded-sm ${index < used ? "bg-thread" : "bg-line"}`} />
            ))}
          </div>
          <p className="mt-2.5 text-[13px] leading-normal text-ink-dim">
            {used} used today. Only a hand&apos;s successful run counts; failed runs and your own decisions at a knot never do. The count starts again at midnight UTC.
          </p>
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

        <section className="flex items-center justify-between gap-3 px-1">
          <p className="text-[13px] text-ink-dim">Signing out ends this session on this device.</p>
          <SignOutButton />
        </section>
      </main>
    </div>
  );
}
