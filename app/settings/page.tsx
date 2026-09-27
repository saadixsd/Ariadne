import Link from "next/link";
import { accountDisplay } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");

  const account = accountDisplay(user);

  return (
    <main className="mx-auto min-h-full max-w-lg px-4 py-8">
      <p className="text-xs font-semibold tracking-[0.22em] text-thread">ARIADNE</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-tight">Settings</h1>
        <Link href="/" className="text-sm text-thread hover:text-thread-bright">
          Back to board
        </Link>
      </div>
      <p className="mt-2 text-sm leading-normal text-ink-dim">More settings will come later.</p>
      <section className="mt-6 bg-panel px-4 py-4 ring-1 ring-white/10">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center bg-base text-sm font-semibold text-thread ring-1 ring-thread/40"
          >
            {account.initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{account.name}</p>
            <p className="truncate text-sm text-ink-dim">{user.email}</p>
          </div>
        </div>
        <dl className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-dim">First name</dt>
            <dd className="truncate">{account.firstName || "Not set"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-dim">Last name</dt>
            <dd className="truncate">{account.lastName || "Not set"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-dim">Email</dt>
            <dd className="truncate">{user.email}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
