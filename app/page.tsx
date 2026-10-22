import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ONE_LINER } from "@/lib/one-liner";
import { OG_IMAGE, SITE_NAME, SITE_URL, SOCIAL } from "@/lib/site";
import { SAMPLE } from "@/lib/sample-report";
import "./landing.css";

// The public front door at ariadneagents.si. Fully static: built once at deploy, so a visit
// costs the Worker no rendering, and it never reads a cookie. /landing/auth.js swaps the
// account links when the non-secret "ariadne_in" marker cookie says you are signed in.
// Only what works today is described. No testimonials, logos, counts or results.

const TITLE = "Ariadne";
const SHARE_TITLE = "Ariadne · Stop Second-Guessing Your Research";
const DESCRIPTION =
  "AI fact-checking for researchers. Ariadne checks the key claims in an AI answer against their sources, asks you only about the ones a source contradicts, and gives you a corrected answer with a claims table.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: SITE_NAME, url: "/", title: SHARE_TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", site: "@ariadne_agents", title: SHARE_TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icon.png`, sameAs: SOCIAL, email: "saad@ariadneagents.si" },
    { "@type": "WebApplication", name: SITE_NAME, url: SITE_URL, applicationCategory: "ProductivityApplication", operatingSystem: "Web browser", description: DESCRIPTION, publisher: { "@id": `${SITE_URL}/#org` } },
    { "@type": "WebSite", name: SITE_NAME, url: SITE_URL, publisher: { "@id": `${SITE_URL}/#org` } },
  ],
};


const STEPS = [
  { n: "1", who: "Ask or paste", title: "One box, one Check button", text: "Type a question, or paste an answer from any AI. One box, one Check button." },
  { n: "2", who: "Write and check", title: "Every key claim is checked", text: "A writer drafts the answer. A fact-checker checks each claim against the web pages it cites (Supported, Not supported, or Wrong) and sends what it found back to the writer." },
  { n: "3", who: "Only what needs you", title: "You decide only what matters", text: "Claims a source contradicts, and that matter, wait under Needs you (at most 5): Keep it, Use the source's version, Remove it, or Write my own. Everything else is handled under Checked automatically. Claims with no source are kept and marked not confirmed." },
  { n: "4", who: "Final answer", title: "Final answer, checked again", text: "Approve it, copy it, or export it as PDF, Word, PowerPoint or Markdown. Use Change something at any point." },
];

const USES = [
  { title: "Literature reviews", text: "Summaries of the papers you collected, with each statement traced to the paper it came from." },
  { title: "Policy briefs", text: "Background on rules, programmes and dates, checked against the official texts." },
  { title: "Grant background", text: "Context sections with each figure linked to its source, so they're easier to check before a reviewer does." },
  { title: "Health evidence summaries", text: "Trial results, indications and guidance, each claim linked to its source." },
  { title: "Legal and regulatory research", text: "What a law or regulation requires and from when, quoted from the text itself." },
];

const GETS = [
  { title: "Claim-level verdicts", text: "Each claim checked is marked Supported, Not supported by sources, Wrong, or Sources disagree, with the quoted evidence and its own link." },
  { title: "You decide only what matters", text: "You decide only what matters: the few claims a source contradicts. The rest is handled for you and listed so you can check it." },
  { title: "The full thread", text: "Every draft, check and decision is kept in order, so you can see how the answer was reached." },
  { title: "Export in four formats", text: "Export to PDF, Word, PowerPoint or Markdown: the answer, its sources, the fact-check and your decisions." },
];

const FAQ = [
  { q: "How is this different from asking one AI?", a: "Two models work together toward your goal. One writes the answer; a second checks each key claim against the source it cites, and Ariadne confirms the quoted words are on that page. You make the calls on anything flagged, and the final answer is rewritten from your decisions and checked again." },
  { q: "Can I check an answer I already have?", a: "Yes. Paste it into the box and press Check. Ariadne sees it's an answer and skips straight to the fact-check. If it guesses wrong, switch it with one click." },
  { q: "Does a check mean the answer is guaranteed correct?", a: "No. The check tells you which claims a source supports and which need your attention, and shows you why. You remain the judge of the final answer." },
  { q: "What sources can I add?", a: "PDF, DOCX and Markdown files. Their text is read in your browser and used for the draft and the check. The fact-check can also search the web. Ariadne reads ordinary web pages. Pages that load their content with JavaScript may not be readable, and Ariadne tells you when that happens." },
  { q: "Who can see my projects?", a: "Only you. The Ariadne team cannot open your projects unless you choose to share one with us when you send feedback, and you can withdraw that in Settings." },
  { q: "How much can I use it?", a: "Free: one run a day. A run is one question taken all the way to a final answer, with up to 3 redrafts or re-checks plus one free rewrite of the final answer. Runs reset at 00:00 UTC (8 PM Toronto). The start screen shows what you have left." },
];

function ThreadGlyph() {
  return (
    <svg viewBox="0 0 26 26" fill="none" aria-hidden focusable="false">
      <path d="M3 20c4-10 8 4 12-6s6-6 8-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="3" cy="20" r="2.2" fill="currentColor" />
    </svg>
  );
}

function Brand() {
  return (
    <Link className="lp-brand" href="/" aria-label="Ariadne, home">
      <ThreadGlyph />
      Ariadne
    </Link>
  );
}

function PrimaryCta() {
  return (
    <>
      <a className="lp-btn lp-btn-primary lp-btn-lg" href="/sign-up" data-when="out">
        Check Your First Question
      </a>
      <a className="lp-btn lp-btn-primary lp-btn-lg" href="/dashboard" data-when="in" hidden>
        Open Your Projects
      </a>
    </>
  );
}

export default function Landing() {
  return (
    <div className="lp" id="top">
      <a className="lp-skip" href="#how">
        Skip to how it works
      </a>
      <header className="lp-top">
        <div className="lp-wrap lp-top-row">
          <Brand />
          <nav aria-label="Account" className="lp-nav">
            <a href="#how" className="lp-nav-link">How it works</a>
            <a href="#faq" className="lp-nav-link">FAQ</a>
            <a className="lp-nav-link" href="/sign-in" data-when="out">
              Sign in
            </a>
            <a className="lp-btn lp-btn-primary lp-btn-sm" href="/sign-up" data-when="out">
              Check Your First Question
            </a>
            <a className="lp-btn lp-btn-primary lp-btn-sm" href="/dashboard" data-when="in" hidden>
              Open Your Projects
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero-grid">
            <div>
              <p className="lp-eyebrow">AI fact-checking for researchers</p>
              <h1 id="lp-title" className="lp-title">
                Stop <em>Second-Guessing</em> Your Research.
              </h1>
              <p className="lp-sublede">Every Key Claim, Checked Against Its Source.</p>
              <p className="lp-lede">
                Ariadne checks the key claims in an AI answer against their sources, asks you only about the ones a source
                contradicts, and gives you a corrected answer with a claims table.
              </p>
              <div className="lp-cta">
                <PrimaryCta />
                <a className="lp-btn lp-btn-quiet" href="/sample" data-testid="sample-link">
                  Read a sample report
                </a>
              </div>
              <p className="lp-note" data-when="out">
                Free to use. Already have an account? <a href="/sign-in">Sign in</a>
              </p>
            </div>
            <figure className="lp-shot" data-testid="sample-preview" style={{ background: "#fff", padding: 22, borderRadius: 16 }}>
              {/* A real report, readable without an account (fix plan O1); the full one is at /sample. */}
              <p className="lp-eyebrow" style={{ margin: 0 }}>Sample report</p>
              <p style={{ fontWeight: 600, marginTop: 6 }}>{SAMPLE.question}</p>
              <p style={{ marginTop: 8, fontSize: 15 }} dangerouslySetInnerHTML={{ __html: SAMPLE.answer[0].replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
              <ul style={{ marginTop: 12, listStyle: "none", padding: 0, fontSize: 13 }}>
                {SAMPLE.claims.slice(0, 3).map((c) => (
                  <li key={c.claim} style={{ borderTop: "1px solid #e4ddd2", padding: "6px 0" }}>
                    <strong style={{ color: c.verdict === "supported" ? "#2f6b3a" : "#8a5a00" }}>{c.verdict === "supported" ? "Supported" : "Not supported by sources"}</strong> · {c.claim}
                  </li>
                ))}
              </ul>
              <a href="/sample" style={{ display: "inline-block", marginTop: 10, fontWeight: 600 }}>Read the full sample report →</a>
            </figure>
          </div>
        </section>

        <section className="lp-section" id="how" aria-labelledby="how-title">
          <div className="lp-wrap">
            <p className="lp-eyebrow">How it works</p>
            <h2 id="how-title">How a check works</h2>
            <ol className="lp-steps">
              {STEPS.map((s) => (
                <li key={s.n} className="lp-step">
                  <p className="lp-step-n">
                    <span>{s.n}</span> {s.who}
                  </p>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-alt" aria-labelledby="gets-title">
          <div className="lp-wrap">
            <p className="lp-eyebrow">What you get</p>
            <h2 id="gets-title">An answer, and the reasons to trust it.</h2>
            <ul className="lp-cards">
              {GETS.map((g) => (
                <li key={g.title} className="lp-card">
                  <h3>{g.title}</h3>
                  <p>{g.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="who-title">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Who it&apos;s for</p>
            <h2 id="who-title">For researchers whose work gets checked.</h2>
            <p className="lp-sub">Academic, policy, health and legal researchers, and the analysts who brief them.</p>
            <ul className="lp-uses">
              {USES.map((u) => (
                <li key={u.title}>
                  <h3>{u.title}</h3>
                  <p>{u.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section lp-alt" aria-labelledby="trust-title">
          <div className="lp-wrap lp-trust">
            <div>
              <p className="lp-eyebrow">Privacy</p>
              <h2 id="trust-title">Your research stays yours.</h2>
            </div>
            <ul>
              <li>Your projects are private to you. The Ariadne team cannot see them unless you choose to share one.</li>
              <li>Original files you upload are deleted after 3 days. The text read from them stays with your project until you delete it.</li>
              <li>You can delete a project, and everything in it, at any time from Settings.</li>
            </ul>
          </div>
        </section>

        <section className="lp-section" id="faq" aria-labelledby="faq-title">
          <div className="lp-wrap lp-faq">
            <p className="lp-eyebrow">FAQ</p>
            <h2 id="faq-title">Questions</h2>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-section lp-final" aria-labelledby="final-title">
          <div className="lp-wrap">
            <h2 id="final-title">Start with the question you are working on.</h2>
            <p className="lp-lede">{ONE_LINER}</p>
            <div className="lp-cta lp-cta-center">
              <PrimaryCta />
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-row">
          <div>
            <Brand />
            <p className="lp-foot-note">Sourced research, key claims checked. Made by the Ariadne team.</p>
          </div>
          <div className="lp-foot-links">
            <a href="mailto:saad@ariadneagents.si">saad@ariadneagents.si</a>
            <a href="/privacy">Privacy</a>
            <a href="/privacy#cookies" data-consent-open>Cookie settings</a>
            <a href="/sign-in">Sign in</a>
            <nav className="lp-social" aria-label="Ariadne elsewhere">
              <a href="https://www.instagram.com/ariadne_agents/" target="_blank" rel="noopener noreferrer" aria-label="Ariadne on Instagram">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
                  <rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  <circle cx="17.3" cy="6.7" r="1.15" fill="currentColor" />
                </svg>
              </a>
              <a href="https://x.com/ariadne_agents" target="_blank" rel="noopener noreferrer" aria-label="Ariadne on X">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
                  <path fill="currentColor" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                </svg>
              </a>
            </nav>
          </div>
        </div>
        <p className="lp-wrap lp-copy">© 2026 Ariadne</p>
      </footer>
      <Script src="/landing/auth.js" strategy="afterInteractive" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
    </div>
  );
}
