import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function timeLabel(value: Date) {
  return value.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function FeedbackInbox() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/sign-in");
  const rows = await prisma.feedback.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8">
      <BrandMark />
      <div className="mt-2 flex items-end justify-between gap-4">
        <h1 className="font-serif text-[40px] font-normal leading-none tracking-[-0.015em]">Feedback</h1>
        <Link href="/dashboard" className="text-sm text-thread hover:text-thread-bright">
          Back to workspace
        </Link>
      </div>
      <p className="mt-2 text-sm leading-normal text-ink-dim">
        The notes you sent from Give feedback. Reading this page does not run an agent.
      </p>
      {rows.length === 0 ? (
        <p className="mt-8 bg-panel px-4 py-6 text-sm leading-normal text-ink-dim ring-1 ring-line">
          No feedback yet. Use Give feedback in the workspace header.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="bg-panel px-4 py-3 ring-1 ring-line">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold tracking-[0.14em] text-thread uppercase">
                  {row.kind}
                </span>
                <time className="font-mono text-xs text-ink-dim" dateTime={row.createdAt.toISOString()}>
                  {timeLabel(row.createdAt)}
                </time>
              </div>
              <p className="mt-2 text-sm leading-normal whitespace-pre-wrap">{row.message}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
