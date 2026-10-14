import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ONE_LINER } from "@/lib/one-liner";
import { OG_IMAGE, SITE_NAME, SITE_URL, SOCIAL } from "@/lib/site";
import "./landing.css";

// The public front door at ariadneagents.si. Fully static: built once at deploy, so a
// visit costs the Worker no rendering. Everyone gets it, signed in or not (proxy.ts only
// sends old "/?project=" links on to /dashboard), so this never reads a cookie.
// Honesty rule: only what works today is described; nothing
// that is not built yet (Phases 1-4 of the Oct 6 plan) is shown as working.
// The moving parts (the thread, the Door, the pass in miniature) are public/landing/life.js;
// without JavaScript the page is complete and still. No numbers, quotes or results on this
// page are invented: the walkthrough is an animation of the steps, not a fake output.

const TITLE = "Ariadne · AI fact-checking for researchers";
const DESCRIPTION =
  "Stop guessing which AI answers are true. Ariadne makes two models check each other, claim by claim, against your sources and the web, so you only verify what's flagged. A second check, not a guarantee.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: SITE_NAME, url: "/", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", site: "@ariadne_agents", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
};

// Structured data: only facts that are true today. No ratings, prices or user counts.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icon.png`, sameAs: SOCIAL },
    {
      "@type": "WebApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Web browser",
      description: ONE_LINER,
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    { "@type": "WebSite", name: SITE_NAME, url: SITE_URL, publisher: { "@id": `${SITE_URL}/#org` } },
  ],
};

// Cloudflare Web Analytics: cookie-free, only on this public page, only when a token is set.
const CF_BEACON = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN;

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

function KnotGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path d="M2 15c4 0 6 0 8-3s4-6 5-3-3 5-4 2 4-1 11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="lp" id="top">
      <a className="lp-skip" href="#how">
        Skip to how it works
      </a>
      <header className="lp-top">
        <div className="lp-wrap">
          <Brand />
          <nav aria-label="Account">
            {/* life.js swaps these for "Your projects" when the ariadne_in marker cookie says you're signed in. */}
            <a className="lp-signin" href="/sign-in" data-when="out">
              Sign in
            </a>
            <a className="lp-btn lp-btn-thread lp-btn-sm" href="/sign-up" data-when="out">
              Tie the Thread
            </a>
            <a className="lp-btn lp-btn-thread lp-btn-sm" href="/dashboard" data-when="in" hidden>
              Your projects
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* ---------- the Door ---------- */}
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-door" data-stage="closed">
            <div className="lp-threshold" aria-hidden />
            <svg className="lp-hero-thread" aria-hidden focusable="false">
              <path className="ht-line" d="" />
              <path className="ht-glow" d="" />
              <circle className="ht-bead" cx="-10" cy="-10" r="3.5" />
            </svg>
            <div className="lp-door-way" aria-hidden>
              <span className="lp-door-light" />
              <span className="lp-door-seam" />
              <span className="lp-leaf lp-leaf-l">
                <span className="lp-leaf-shade" />
                <span className="lp-leaf-edge" />
              </span>
              <span className="lp-leaf lp-leaf-r">
                <span className="lp-leaf-shade" />
                <span className="lp-leaf-edge" />
              </span>
            </div>
            <span className="lp-door-spill" aria-hidden />
            <div className="lp-door-inner">
              <p className="lp-eyebrow lp-rise">AI fact-checking for researchers</p>
              <h1 id="lp-title" className="lp-title lp-rise" style={{ "--delay": ".12s" } as React.CSSProperties}>
                <span className="lp-line">Stop guessing</span> <span className="lp-line">which AI answers</span>{" "}
                <span className="lp-line">
                  are <em>true.</em>
                </span>
              </h1>
              <p className="lp-lede lp-rise" style={{ "--delay": ".24s" } as React.CSSProperties}>
                Ariadne makes two models check each other, claim by claim, so you only verify what&apos;s flagged.
              </p>
              <ol className="lp-flow lp-rise" aria-label="What happens" style={{ "--delay": ".3s" } as React.CSSProperties}>
                <li>Odysseus answers from your sources</li>
                <li>Daedalus fact-checks every claim</li>
                <li>you judge only the flagged ones</li>
                <li>Odysseus revises</li>
                <li>you approve, with the checks attached</li>
              </ol>
              <div className="lp-cta lp-rise" style={{ "--delay": ".36s" } as React.CSSProperties}>
                <a className="lp-btn lp-btn-thread" href="/sign-up" data-door-cta data-when="out">
                  Tie the Thread
                </a>
                <a className="lp-btn lp-btn-thread" href="/dashboard" data-when="in" hidden>
                  Open your projects
                </a>
                <p className="lp-note" data-when="out">
                  Already have an account? <a href="/sign-in">Sign in</a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section className="lp-section lp-how" id="how" aria-labelledby="how-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">How it works</p>
              <h2 id="how-title">
                One model answers. <em>Another checks every claim.</em>
              </h2>
              <p className="lp-lede">
                They work toward the same goal: an answer you can stand behind. You don&apos;t copy answers between
                chat windows, and nothing moves to the next step until you say so.
              </p>
            </div>

            <div className="lp-stage">
              <svg className="lp-steps-thread" aria-hidden focusable="false">
                <path className="hn-measure" d="" />
                <path className="hn-line" d="" />
                <path className="hn-trail" d="" />
                <circle className="hn-pulse" cx="-10" cy="-10" r="5" />
              </svg>
              <ol className="lp-steps">
                <li className="lp-step" data-step="draft">
                  <span className="lp-monogram lp-mono-o" aria-hidden>
                    O
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">1 · Draft</p>
                    <h3>Odysseus answers</h3>
                    <p className="lp-step-who">The writer</p>
                    <p className="lp-step-text">
                      Answers your question from your brief and the sources you upload (PDF, DOCX, Markdown), stating each
                      fact as a specific claim. Not what you asked? Tell it why and it redrafts.
                    </p>
                  </div>
                </li>
                <li className="lp-step" data-step="challenge">
                  <span className="lp-monogram lp-mono-d" aria-hidden>
                    D
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">2 · Challenge</p>
                    <h3>Daedalus fact-checks</h3>
                    <p className="lp-step-who">The fact-checker</p>
                    <p className="lp-step-text">
                      When the draft looks right to you, Daedalus checks it claim by claim against your sources and a
                      web search, and labels each claim Supported, Unsupported or Wrong, with the evidence and a link.
                    </p>
                  </div>
                </li>
                <li className="lp-step" data-step="judge">
                  <span className="lp-monogram lp-mono-y" aria-hidden>
                    Y
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">3 · Judge</p>
                    <h3>You judge what&apos;s flagged</h3>
                    <p className="lp-step-who">You</p>
                    <p className="lp-step-text">
                      Supported claims stay out of your way. For each Wrong or Unsupported claim, open the evidence,
                      then accept, edit or reject it. Odysseus revises with your decisions.
                    </p>
                    <div className="lp-knot-actions lp-js" role="group" aria-label="Your decision at the knot">
                      <button className="lp-btn lp-btn-knot lp-btn-sm" type="button" data-act="tie" disabled>
                        Tie it off
                      </button>
                      <button className="lp-btn lp-btn-sm" type="button" data-act="back" disabled>
                        Send it back
                      </button>
                    </div>
                  </div>
                </li>
                <li className="lp-step" data-step="tie">
                  <span className="lp-monogram lp-mono-t" aria-hidden>
                    <KnotGlyph />
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">4 · Tie Off</p>
                    <h3>You approve, with proof attached</h3>
                    <p className="lp-step-who">Signed off by you</p>
                    <p className="lp-step-text">
                      The final answer carries a table of every claim checked, its verdict, its source and your
                      decision. Every step stays in the thread, and you can export the record.
                    </p>
                  </div>
                </li>
              </ol>
              <div className="lp-demo lp-js">
                <p className="lp-eyebrow">A pass, in miniature. Try it.</p>
                <p className="lp-demo-status" id="lp-demo-status" role="status" aria-live="polite">
                  Scroll here and the hands start passing the work along.
                </p>
                <button className="lp-btn lp-btn-ghost lp-btn-sm" type="button" data-act="again" hidden>
                  Run it again
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- the problem ---------- */}
        <section className="lp-section" aria-labelledby="problem-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">The problem</p>
              <h2 id="problem-title">
                AI models guess, <em>and they sound sure when they do.</em>
              </h2>
              <p className="lp-lede">
                Ask several assistants how many DNS root server instances are in Canada and you can get several confident,
                different numbers. The answer is a lookup, not an opinion: root-servers.org lists every instance by
                country. On October 13, 2026 it listed 45 in Canada.
              </p>
            </div>
            <ul className="lp-questions">
              <li>Is this number right?</li>
              <li>Does the source actually say that?</li>
              <li>Is it out of date?</li>
              <li>Did the model make it up?</li>
            </ul>
            <p className="lp-close">
              Checking every sentence yourself defeats the point of using AI. Ariadne narrows it down to the claims
              that need you.
            </p>
          </div>
        </section>

        {/* ---------- an example ---------- */}
        <section className="lp-section" aria-labelledby="example-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">Try it on a real question</p>
              <h2 id="example-title">
                “How many DNS root server instances <em>are in Canada?</em>”
              </h2>
              <p className="lp-lede">
                It&apos;s one of the sample questions in the app. What happens, step by step (an outline of the steps,
                not a recorded output):
              </p>
            </div>
            <div className="lp-example">
              <ol className="lp-pass">
                <li>
                  <p className="lp-pass-n">Draft</p>
                  <p>Odysseus gives a number, the cities it knows of, and says where it is unsure.</p>
                </li>
                <li>
                  <p className="lp-pass-n">Challenge</p>
                  <p>
                    Daedalus checks each claim against root-servers.org and other sources it finds, and marks the
                    count, the cities and the operators Supported, Unsupported or Wrong, with links.
                  </p>
                </li>
                <li>
                  <p className="lp-pass-n">Judge</p>
                  <p>You open the evidence on the flagged claims only, and accept, edit or reject each one.</p>
                </li>
                <li>
                  <p className="lp-pass-n">Revise</p>
                  <p>Odysseus rewrites the answer with your decisions.</p>
                </li>
                <li>
                  <p className="lp-pass-n">Tie Off</p>
                  <p>You approve the answer. The claim table and sources go with it.</p>
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* ---------- who it's for ---------- */}
        <section className="lp-section" aria-labelledby="who-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">Who it&apos;s for</p>
              <h2 id="who-title">
                Researchers who use AI <em>and can&apos;t afford to be wrong.</em>
              </h2>
            </div>
            <ul className="lp-who">
              <li>You use AI assistants for literature reviews, summaries, analysis or reports.</li>
              <li>Your work carries numbers, citations or claims that someone else will check.</li>
              <li>You already paste one model&apos;s answer into another to see if it holds up.</li>
            </ul>
            <p className="lp-isnt">
              <strong>What Ariadne isn&apos;t:</strong> a guarantee. Both models can still be wrong, and the
              fact-check is a second model&apos;s reading of the sources, not an authority. It shows you its evidence
              so you can decide. The last word is always yours.
            </p>
          </div>
        </section>

        {/* ---------- the last door ---------- */}
        <section className="lp-section lp-final" aria-labelledby="final-title">
          <div className="lp-wrap">
            <svg className="lp-knot" viewBox="0 0 160 90" aria-hidden focusable="false">
              <path className="lp-knot-draw" d="M0 64 C30 64 46 64 62 48 C78 32 100 14 95 38 C90 60 60 50 70 36 C80 22 104 56 160 64" />
              <circle className="lp-knot-dot" cx="80" cy="42" r="6" />
            </svg>
            <p className="lp-eyebrow">The door</p>
            <h2 id="final-title">
              Pick up the <em>thread.</em>
            </h2>
            <p className="lp-lede">{ONE_LINER}</p>
            <a className="lp-btn lp-btn-thread" href="/sign-up">
              Tie the Thread
            </a>
            <p className="lp-note">Free to use. No card needed.</p>
          </div>
        </section>
      </main>


      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-brand">
            <Brand />
            <nav className="lp-social" aria-label="Ariadne elsewhere">
              <a href="https://www.instagram.com/ariadne_agents/" target="_blank" rel="noopener noreferrer" aria-label="Ariadne on Instagram">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
                  <rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  <circle cx="17.3" cy="6.7" r="1.15" fill="currentColor" />
                </svg>
              </a>
              <a href="https://x.com/ariadne_agents" target="_blank" rel="noopener noreferrer" aria-label="Ariadne on X">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
                  <path
                    fill="currentColor"
                    d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
                  />
                </svg>
              </a>
            </nav>
          </div>
          <p>Ariadne is AI fact-checking for researchers. You remain the final judge.</p>
          <p>
            <a href="/sign-in">Sign in</a> · © 2026 Ariadne
          </p>
        </div>
      </footer>
      {/* A plain script from public/: decoration only, no framework code, no Worker CPU. */}
      <Script src="/landing/life.js" strategy="afterInteractive" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      {CF_BEACON ? (
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="lazyOnload"
          data-cf-beacon={JSON.stringify({ token: CF_BEACON })}
        />
      ) : null}
    </div>
  );
}
