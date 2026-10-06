import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ONE_LINER } from "@/lib/one-liner";
import "./landing.css";

// The public front door at ariadneagents.si. Fully static: built once at deploy, so a
// visit costs the Worker no rendering. proxy.ts sends anyone who already holds a session
// (and any old "/?project=" link) straight to /dashboard, so this never reads a cookie.
// The moving parts (the thread, the Door, the pass in miniature) are public/landing/life.js;
// without JavaScript the page is complete and still. No numbers, quotes or results on this
// page are invented: the walkthrough is an animation of the steps, not a fake output.

export const metadata: Metadata = {
  title: "Ariadne · One model drafts, another challenges, you judge",
  description: ONE_LINER,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Ariadne",
    url: "/",
    title: "Ariadne · One model drafts, another challenges, you judge",
    description: ONE_LINER,
  },
};

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
            <a className="lp-signin" href="/sign-in">
              Sign in
            </a>
            <a className="lp-btn lp-btn-thread lp-btn-sm" href="/sign-up">
              Tie the Thread
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
              <p className="lp-eyebrow lp-rise">Agents draft. Agents challenge. You judge.</p>
              <h1 id="lp-title" className="lp-title lp-rise" style={{ "--delay": ".12s" } as React.CSSProperties}>
                One model drafts. Another challenges. <em>You judge.</em>
              </h1>
              <p className="lp-lede lp-rise" style={{ "--delay": ".24s" } as React.CSSProperties}>
                {ONE_LINER}
              </p>
              <div className="lp-cta lp-rise" style={{ "--delay": ".36s" } as React.CSSProperties}>
                <a className="lp-btn lp-btn-thread" href="/sign-up" data-door-cta>
                  Tie the Thread
                </a>
                <p className="lp-note">
                  Already have an account? <a href="/sign-in">Sign in</a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- the problem ---------- */}
        <section className="lp-section" aria-labelledby="problem-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">The labyrinth</p>
              <h2 id="problem-title">
                Writing got cheap. <em>Checking didn&apos;t.</em>
              </h2>
              <p className="lp-lede">
                If you use AI for research, the real work starts when the answer arrives. You read it line by
                line, chase every citation, paste it into a second model and compare. That checking can take
                hours, and it all lands on you.
              </p>
            </div>
            <ul className="lp-cards">
              <li className="lp-card">
                <span className="lp-card-mark" aria-hidden />
                <h3>Confident mistakes</h3>
                <p>A wrong number, date or name reads exactly like a right one. Nothing in the text tells you which is which.</p>
              </li>
              <li className="lp-card">
                <span className="lp-card-mark" aria-hidden />
                <h3>Sources that aren&apos;t there</h3>
                <p>A citation can look real, with plausible authors, a journal and a year, and still not exist or not say what the draft claims.</p>
              </li>
              <li className="lp-card">
                <span className="lp-card-mark" aria-hidden />
                <h3>Reviews that just agree</h3>
                <p>Ask a model to check an answer, especially its own, and it often confirms what was already said instead of looking for what&apos;s wrong.</p>
              </li>
            </ul>
            <p className="lp-close">You end up as the machine that checks the machines.</p>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section className="lp-section lp-how" id="how" aria-labelledby="how-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">Ariadne&apos;s thread · Draft → Challenge → Judge → Tie Off</p>
              <h2 id="how-title">
                Two hands spin. <em>You tie the knot.</em>
              </h2>
              <p className="lp-lede">
                In the myth, Ariadne gave Theseus a thread so he could find his way out of the labyrinth. She
                didn&apos;t walk it for him. Here, two models from different families do the walking, and you
                hold the thread.
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
                  <span className="lp-monogram lp-mono-d" aria-hidden>
                    D
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">1 · Draft</p>
                    <h3>Daedalus drafts</h3>
                    <p className="lp-step-who">GPT</p>
                    <p className="lp-step-text">Writes the first answer to your question or brief.</p>
                    <span className="lp-badge">Works today</span>
                  </div>
                </li>
                <li className="lp-step" data-step="challenge">
                  <span className="lp-monogram lp-mono-o" aria-hidden>
                    O
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">2 · Challenge</p>
                    <h3>Odysseus challenges</h3>
                    <p className="lp-step-who">Claude, a different model family</p>
                    <p className="lp-step-text">Reads the draft looking for what is wrong, unsupported or missing.</p>
                    <span className="lp-badge lp-badge-next">Coming next</span>
                    <p className="lp-step-later">
                      Today Odysseus writes a review and flags problems. Next: one click, web search, and every
                      objection tied to a claim and a source.
                    </p>
                  </div>
                </li>
                <li className="lp-step" data-step="judge">
                  <span className="lp-monogram lp-mono-y" aria-hidden>
                    Y
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">3 · Judge</p>
                    <h3>You judge</h3>
                    <p className="lp-step-who">The knot</p>
                    <p className="lp-step-text">Nothing moves on until you decide: tie it off, or send it back with a note.</p>
                    <div className="lp-knot-actions lp-js" role="group" aria-label="Your decision at the knot">
                      <button className="lp-btn lp-btn-knot lp-btn-sm" type="button" data-act="tie" disabled>
                        Tie it off
                      </button>
                      <button className="lp-btn lp-btn-sm" type="button" data-act="back" disabled>
                        Send it back
                      </button>
                    </div>
                    <p className="lp-step-later">Next: accept, reject or edit each objection on its own.</p>
                  </div>
                </li>
                <li className="lp-step" data-step="tie">
                  <span className="lp-monogram lp-mono-t" aria-hidden>
                    <KnotGlyph />
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">4 · Tie Off</p>
                    <h3>The thread is tied</h3>
                    <p className="lp-step-who">Signed off by you</p>
                    <p className="lp-step-text">
                      The answer you approved is kept with who drafted it, who reviewed it and who tied it off.
                      Earlier versions stay in the history.
                    </p>
                    <span className="lp-badge">Works today</span>
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

            <div className="lp-status">
              <div className="lp-status-col">
                <h3>
                  <span className="lp-badge">Today</span> What you can use now
                </h3>
                <ul>
                  <li>
                    <strong>Projects with a brief</strong> that every step reads first.
                  </li>
                  <li>
                    <strong>A five-step thread:</strong> Odysseus (Claude) sets out the ground, Daedalus (GPT)
                    drafts, Odysseus reviews the draft, you decide at the knot, and Daedalus produces the final
                    version.
                  </li>
                  <li>
                    <strong>Review flags</strong> you can add to your note in one click, and a v1 → v2 comparison
                    after you ask for changes.
                  </li>
                  <li>
                    <strong>Nothing is overwritten.</strong> Every run is kept in the history.
                  </li>
                  <li>The models work from what they already know. They don&apos;t search the web yet.</li>
                </ul>
              </div>
              <div className="lp-status-col next">
                <h3>
                  <span className="lp-badge lp-badge-next">Next</span> What we&apos;re building
                </h3>
                <ul>
                  <li>
                    <strong>Answer-first drafts</strong> with numbered claims, so you can read the answer in
                    seconds and point at exactly what you doubt.
                  </li>
                  <li>
                    <strong>One-click Challenge:</strong> the challenger searches the web, and every objection
                    names a claim and carries a source. Objections without one are labelled as opinion.
                  </li>
                  <li>
                    <strong>Judging point by point:</strong> accept, reject or edit each objection, add your own,
                    then revise only what you accepted.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- who it's for ---------- */}
        <section className="lp-section" aria-labelledby="who-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">Who it&apos;s for</p>
              <h2 id="who-title">
                Researchers who lean on AI <em>and can&apos;t afford to be wrong.</em>
              </h2>
            </div>
            <ul className="lp-who">
              <li>You use ChatGPT, Claude or both for literature reviews, summaries, analysis or reports.</li>
              <li>Your work carries numbers, citations or claims that someone else will check.</li>
              <li>You already paste one model&apos;s answer into another to see if it holds up.</li>
            </ul>
            <p className="lp-lede">
              Analysts, builders and students doing serious work come later — researchers first.
            </p>
            <p className="lp-isnt">
              <strong>What Ariadne isn&apos;t:</strong> an autopilot, or a promise of no hallucinations. Models
              still make mistakes. Ariadne is built to make them easier to find, and the last word is always
              yours.
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
            <p className="lp-lede">
              Ariadne starts with one job: checking AI work before you rely on it. Further out, we want people
              and AI agents working side by side, with the judgment staying with people.
            </p>
            <a className="lp-btn lp-btn-thread" href="/sign-up">
              Tie the Thread
            </a>
            <p className="lp-note">Free while we test it with a small group of researchers.</p>
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
          <p>Ariadne helps researchers verify AI-generated work. The judgment stays yours.</p>
          <p>
            <a href="/sign-in">Sign in</a> · © 2026 Ariadne
          </p>
        </div>
      </footer>
      {/* A plain script from public/: decoration only, no framework code, no Worker CPU. */}
      <Script src="/landing/life.js" strategy="afterInteractive" />
    </div>
  );
}
