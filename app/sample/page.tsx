import type { Metadata } from "next";
import Link from "next/link";
import { SAMPLE } from "@/lib/sample-report";
import "../landing.css";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Sample report · Ariadne",
  description: "An example Ariadne report: a direct, dated answer with every key claim checked against its source.",
  alternates: { canonical: "/sample" },
};

const TONE = { supported: "#2f6b3a", unsupported: "#8a5a00", wrong: "#a3261b", disputed: "#a3261b" } as const;
const LABEL = { supported: "Supported", unsupported: "Not supported by sources", wrong: "Wrong", disputed: "Sources disagree" } as const;

/** Public, static, no account needed (fix plan O1). */
export default function SampleReport() {
  const counts = SAMPLE.claims.reduce((m, c) => ({ ...m, [c.verdict]: (m[c.verdict] ?? 0) + 1 }), {} as Record<string, number>);
  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-wrap lp-top-row">
          <Link className="lp-brand" href="/">Ariadne</Link>
          <nav className="lp-nav" aria-label="Account">
            <a className="lp-btn lp-btn-primary lp-btn-sm" href="/sign-up">Check your own question</a>
          </nav>
        </div>
      </header>
      <main className="lp-section">
        <article className="lp-wrap" style={{ maxWidth: 860 }} data-testid="sample-report">
          <p className="lp-eyebrow">Sample report · data read on root-servers.org on Oct 21, 2026</p>
          <h1 style={{ fontSize: "2.2rem", lineHeight: 1.15 }}>{SAMPLE.question}</h1>
          <p className="lp-sub" style={{ marginTop: 8 }}>
            A hand-built example from the Ariadne team, showing what a report contains. It isn&apos;t a live run, so a real report may look different.
          </p>

          <section style={{ marginTop: 28 }}>
            <h2>Answer</h2>
            {SAMPLE.answer.map((p, i) => (
              <p key={i} style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
            ))}
          </section>

          <section style={{ marginTop: 28 }}>
            <h2>Claims checked</h2>
            <p style={{ marginTop: 6, fontSize: 14 }}>
              Checked version: final answer · {SAMPLE.claims.length} claims: {counts.supported ?? 0} supported · {counts.unsupported ?? 0} not supported · {counts.wrong ?? 0} wrong. A second model&apos;s check against the sources, not a guarantee.
            </p>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <th style={{ padding: "6px 10px 6px 0" }}>Claim</th>
                    <th style={{ padding: "6px 10px 6px 0" }}>Verdict</th>
                    <th style={{ padding: "6px 0" }}>Source and quote</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE.claims.map((c) => (
                    <tr key={c.claim} style={{ borderTop: "1px solid #e4ddd2", verticalAlign: "top" }}>
                      <td style={{ padding: "8px 10px 8px 0" }}>
                        {c.claim}
                        {c.decision ? <span style={{ display: "block", fontSize: 12, opacity: 0.75 }}>Your decision: {c.decision}</span> : null}
                      </td>
                      <td style={{ padding: "8px 10px 8px 0", color: TONE[c.verdict], fontWeight: 600 }}>{LABEL[c.verdict]}</td>
                      <td style={{ padding: "8px 0", maxWidth: 320, wordBreak: "break-word" }}>
                        <a href={c.source} target="_blank" rel="noopener noreferrer nofollow">{c.source.replace(/^https?:\/\//, "")}</a>
                        <span style={{ display: "block", fontSize: 12, opacity: 0.75 }}>{c.quote}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginTop: 28 }}>
            <h2>How this report was made</h2>
            <ol style={{ marginTop: 10, paddingLeft: 20 }}>
              {SAMPLE.flow.map((f) => (
                <li key={f.stage} style={{ marginTop: 6 }}><strong>{f.stage}.</strong> {f.text}</li>
              ))}
            </ol>
            <p style={{ marginTop: 10 }}>Use “Change something” at any point: edit the question, redraft, re-check a claim, or rewrite the final answer.</p>
          </section>

          <div className="lp-cta" style={{ marginTop: 32 }}>
            <a className="lp-btn lp-btn-primary lp-btn-lg" href="/sign-up">Check your own question</a>
            <Link className="lp-btn lp-btn-quiet" href="/">Back to the home page</Link>
          </div>
        </article>
      </main>
    </div>
  );
}
