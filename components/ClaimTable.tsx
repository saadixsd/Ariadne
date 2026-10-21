"use client";

import { useMemo } from "react";
import { parseCritique, sourceLinks, type CritiqueFlag } from "@/lib/critique";
import { VERDICT_LABEL, verdictCounts, verdictSummary } from "@/lib/knots";
import { claimInText, DECISION_LABEL, issueKey, stripQuotes, type Decision } from "@/lib/workspace";

const TONE = { supported: "text-ok", unsupported: "text-gate-ink", wrong: "text-danger", disputed: "text-danger" } as const;

function Sources({ f }: { f: CritiqueFlag }) {
  const links = sourceLinks(f.source).filter((u) => /^https?:\/\//i.test(u));
  return (
    <>
      {links.length ? (
        links.map((u) => (
          <a key={u} className="block text-thread underline" href={u} target="_blank" rel="noopener noreferrer nofollow">
            {u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
          </a>
        ))
      ) : f.source ? (
        <span>{f.source}</span>
      ) : (
        <span className="text-gate-ink">No source found</span>
      )}
      {f.evidence && f.verdict !== "disputed" ? <span className="mt-0.5 block text-[12px] text-ink-faint">{f.evidence.slice(0, 280)}</span> : null}
    </>
  );
}

/**
 * The claims table attached to the answer (fix plan B2, B3): built from the check of the
 * version shown (the final answer when it was checked), every claim counted, supported rows
 * collapsed, each row with its own source and quote.
 */
export function ClaimTable({
  checkOutput,
  checkedVersion,
  text,
  decisions,
}: {
  checkOutput: string | null | undefined;
  checkedVersion: "final" | "draft";
  text: string | null | undefined;
  decisions: Decision[];
}) {
  const critique = useMemo(() => parseCritique(checkOutput ?? ""), [checkOutput]);
  const flags = critique.flags.filter((f) => f.verdict);
  if (flags.length === 0) return null;
  const byKey = new Map(decisions.map((d) => [d.flagKey, d]));
  const v = verdictCounts(flags);
  const supported = flags.filter((f) => f.verdict === "supported");
  const flagged = flags.filter((f) => f.verdict !== "supported");
  const missing = checkedVersion === "final" ? flags.filter((f) => f.claim && !claimInText(f.claim, text)).length : 0;
  const row = (f: CritiqueFlag) => {
    const d = byKey.get(issueKey(f));
    const inText = checkedVersion !== "final" || !f.claim || claimInText(f.claim, text);
    return (
      <tr key={f.id} className="border-t border-line align-top" data-verdict={f.verdict}>
        <td className="py-2 pr-3">
          {f.claim ? stripQuotes(f.claim) : f.issue}
          {!inText ? <span className="mt-0.5 block text-[11px] text-gate-ink">Not found word for word in the answer above</span> : null}
        </td>
        <td className={`py-2 pr-3 font-medium ${TONE[f.verdict!]}`}>{VERDICT_LABEL[f.verdict!]}</td>
        {checkedVersion === "draft" ? <td className="py-2 pr-3 text-ink-dim">{f.verdict === "supported" ? "—" : d ? DECISION_LABEL[d.state] : "Not decided"}</td> : null}
        <td className="max-w-[260px] break-words py-2 text-ink-dim"><Sources f={f} /></td>
      </tr>
    );
  };
  const head = (
    <thead className="text-[11px] tracking-wide text-ink-dim uppercase">
      <tr>
        <th className="py-1.5 pr-3">Claim</th>
        <th className="py-1.5 pr-3">Verdict</th>
        {checkedVersion === "draft" ? <th className="py-1.5 pr-3">Your decision</th> : null}
        <th className="py-1.5">Source and quote</th>
      </tr>
    </thead>
  );
  return (
    <section data-testid="claim-table" className="mt-8 border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-xl">Claims checked</h3>
        <span className="rounded-full bg-tint px-2 py-0.5 text-[11px] ring-1 ring-line" data-testid="checked-version">
          Checked version: {checkedVersion === "final" ? "final answer" : "draft"}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-dim" data-testid="claim-table-counts">
        {v.checked} claim{v.checked === 1 ? "" : "s"}: {verdictSummary(v)}.{critique.dataDate ? ` Data checked: ${critique.dataDate}.` : ""} A second model&apos;s check against the sources, not a guarantee.
        {missing ? ` ${missing} claim${missing === 1 ? " was" : "s were"} not found word for word in the answer.` : ""}
      </p>
      {flagged.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            {head}
            <tbody>{flagged.map(row)}</tbody>
          </table>
        </div>
      ) : null}
      {supported.length ? (
        <details className="mt-3" data-testid="claim-table-supported">
          <summary className="cursor-pointer text-sm"><span className="font-medium text-ok">{supported.length} supported claim{supported.length === 1 ? "" : "s"}</span> <span className="text-ink-dim">· show</span></summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              {head}
              <tbody>{supported.map(row)}</tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}
