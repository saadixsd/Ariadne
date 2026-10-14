"use client";

import { useMemo } from "react";
import { parseCritique } from "@/lib/critique";
import { VERDICT_LABEL, verdictCounts } from "@/lib/knots";
import { issueKey, stripQuotes, type Decision } from "@/lib/workspace";

const TONE = { supported: "text-ok", unsupported: "text-gate-ink", wrong: "text-danger" } as const;

/** The proof attached to the answer: every claim Daedalus checked, its verdict, source and your decision. */
export function ClaimTable({ challengeOutput, decisions }: { challengeOutput: string | null | undefined; decisions: Decision[] }) {
  const flags = useMemo(() => parseCritique(challengeOutput ?? "").flags.filter((f) => f.verdict), [challengeOutput]);
  if (flags.length === 0) return null;
  const byKey = new Map(decisions.map((d) => [d.flagKey, d]));
  const v = verdictCounts(flags);
  return (
    <section data-testid="claim-table" className="mt-8 border-t border-line pt-6">
      <h3 className="font-serif text-xl">Claims checked</h3>
      <p className="mt-1 text-xs text-ink-dim">
        Daedalus checked {v.checked} claim{v.checked === 1 ? "" : "s"} in the draft: {v.supported} supported, {v.unsupported} unsupported, {v.wrong} wrong. A second model&apos;s check, not a guarantee.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] tracking-wide text-ink-dim uppercase">
            <tr><th className="py-1.5 pr-3">Claim</th><th className="py-1.5 pr-3">Verdict</th><th className="py-1.5 pr-3">Your decision</th><th className="py-1.5">Source</th></tr>
          </thead>
          <tbody>
            {flags.map((f) => {
              const d = byKey.get(issueKey(f));
              return (
                <tr key={f.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3">{f.claim ? stripQuotes(f.claim) : f.issue}</td>
                  <td className={`py-2 pr-3 font-medium ${TONE[f.verdict!]}`}>{VERDICT_LABEL[f.verdict!]}</td>
                  <td className="py-2 pr-3 capitalize text-ink-dim">{f.verdict === "supported" ? "—" : d?.state ?? "not decided"}</td>
                  <td className="max-w-[220px] break-words py-2 text-ink-dim">
                    {f.source && /^https?:\/\//i.test(f.source) ? (
                      <a className="text-thread underline" href={f.source} target="_blank" rel="noopener noreferrer nofollow">{f.source.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</a>
                    ) : (
                      f.source ?? "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
