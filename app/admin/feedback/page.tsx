import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { TriageSelect } from "@/components/TriageSelect";
import { anonymiseOldFeedback, requireAdminPage } from "@/lib/admin";
import { TRIAGE } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Search = { rating?: string; triage?: string; campaign?: string };

export default async function AdminFeedback({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage();
  await anonymiseOldFeedback();
  const q = await searchParams;
  const rating = q.rating && /^[1-5]$/.test(q.rating) ? Number(q.rating) : undefined;
  const triage = q.triage && (TRIAGE as readonly string[]).includes(q.triage) ? q.triage : undefined;
  const campaign = q.campaign?.slice(0, 64) || undefined;
  const rows = await prisma.feedback.findMany({
    where: {
      ...(rating ? { rating } : {}),
      ...(triage ? { triage } : {}),
      ...(campaign ? { user: { utmCampaign: campaign === "(none)" ? null : campaign } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { utmCampaign: true, refCode: true } } },
  });
  const campaigns = await prisma.user.findMany({ distinct: ["utmCampaign"], select: { utmCampaign: true } });

  return (
    <main className="mx-auto min-h-full max-w-5xl px-4 py-8">
      <BrandMark />
      <h1 className="mt-2 font-serif text-[40px] leading-none">Feedback (admin)</h1>
      <p className="mt-2 text-sm text-ink-dim">
        Newest 200. Emails are not shown here; a row links to the person only by campaign and ref code. Older than 12 months is anonymised on load.
      </p>
      <form className="mt-4 flex flex-wrap items-end gap-3 text-sm" method="get">
        <label>
          Rating{" "}
          <select name="rating" defaultValue={q.rating ?? ""} className="bg-canvas px-2 py-1 ring-1 ring-line">
            <option value="">any</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Triage{" "}
          <select name="triage" defaultValue={q.triage ?? ""} className="bg-canvas px-2 py-1 ring-1 ring-line">
            <option value="">any</option>
            {TRIAGE.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Campaign{" "}
          <select name="campaign" defaultValue={q.campaign ?? ""} className="bg-canvas px-2 py-1 ring-1 ring-line">
            <option value="">any</option>
            {campaigns.map((c) => (
              <option key={c.utmCampaign ?? "(none)"}>{c.utmCampaign ?? "(none)"}</option>
            ))}
          </select>
        </label>
        <button className="bg-thread px-3 py-1 text-raised">Filter</button>
        <Link href="/admin/feedback" className="text-thread">
          Clear
        </Link>
      </form>
      <p className="mt-3 text-sm text-ink-dim">{rows.length} rows</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink-dim uppercase">
            <tr>
              <th className="py-2 pr-3">When (UTC)</th>
              <th className="pr-3">Rating</th>
              <th className="pr-3">Answers</th>
              <th className="pr-3">Campaign · version</th>
              <th className="pr-3">Project</th>
              <th>Triage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="pr-3">{row.rating ?? row.kind}</td>
                <td className="max-w-md pr-3 whitespace-pre-wrap">
                  {row.message ? <div>{row.message}</div> : null}
                  {row.worked ? <div><b>Worked:</b> {row.worked}</div> : null}
                  {row.wrong ? <div><b>Wrong:</b> {row.wrong}</div> : null}
                  {row.changeFirst ? <div><b>Change first:</b> {row.changeFirst}</div> : null}
                </td>
                <td className="pr-3 text-xs">
                  {row.user?.utmCampaign ?? "(none)"}
                  <br />
                  <span className="font-mono">{row.user?.refCode ?? ""}</span>
                  <br />
                  <span className="font-mono">{row.appVersion ?? "?"}</span> · {row.source ?? ""}
                </td>
                <td className="pr-3 text-xs">
                  {row.projectId ? <Link className="text-thread" href={`/admin/feedback/${row.id}`}>{row.allowProjectView ? "open (allowed)" : "steps only"}</Link> : "—"}
                </td>
                <td>
                  <TriageSelect id={row.id} value={row.triage} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
