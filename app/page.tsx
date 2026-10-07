import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ONE_LINER } from "@/lib/one-liner";
import "./landing.css";

// The public front door at ariadneagents.si. Fully static: built once at deploy, so a
// visit costs the Worker no rendering. Everyone gets it, signed in or not (proxy.ts only
// sends old "/?project=" links on to /dashboard), so this never reads a cookie.
// Honesty rule: every step is labelled "Works today" / "Today" or "Coming next"; nothing
// that is not built yet (Phases 1-4 of the Oct 6 plan) is shown as working.
// The moving parts (the thread, the Door, the pass in miniature) are public/landing/life.js;
// without JavaScript the page is complete and still. No numbers, quotes or results on this
// page are invented: the walkthrough is an animation of the steps, not a fake output.

export const metadata: Metadata = {
  title: "Ariadne · One AI drafts, another tries to break it, you decide",
  description: ONE_LINER,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Ariadne",
    url: "/",
    title: "Ariadne · One AI drafts, another tries to break it, you decide",
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
              <p className="lp-eyebrow lp-rise">Draft → Challenge → Judge → Tie Off</p>
              <h1 id="lp-title" className="lp-title lp-rise" style={{ "--delay": ".12s" } as React.CSSProperties}>
                <span className="lp-line">Important AI work</span> <span className="lp-line">shouldn&apos;t depend</span>{" "}
                <span className="lp-line">
                  on <em>one model.</em>
                </span>
              </h1>
              <p className="lp-lede lp-rise" style={{ "--delay": ".24s" } as React.CSSProperties}>
                Ariadne has one AI create the work and another try to break it — while you make the final call.
              </p>
              <ol className="lp-flow lp-rise" aria-label="What happens" style={{ "--delay": ".3s" } as React.CSSProperties}>
                <li>AI does the research</li>
                <li>another AI tries to break it</li>
                <li>you decide what&apos;s right</li>
                <li>Ariadne revises it</li>
                <li>you approve the final result</li>
              </ol>
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

        {/* ---------- how it works ---------- */}
        <section className="lp-section lp-how" id="how" aria-labelledby="how-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">How it works</p>
              <h2 id="how-title">
                One model drafts. <em>Another tries to break it.</em>
              </h2>
              <p className="lp-lede">
                You don&apos;t copy answers between two chat windows. Ariadne handles the handoff. You handle
                the judgment.
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
                    <h3>Odysseus drafts</h3>
                    <p className="lp-step-who">Claude · the Drafter</p>
                    <p className="lp-step-text">Writes the first answer to your question, from your brief.</p>
                    <span className="lp-badge">Works today</span>
                    <p className="lp-step-later">Coming next: the answer first, with numbered claims and sources underneath.</p>
                  </div>
                </li>
                <li className="lp-step" data-step="challenge">
                  <span className="lp-monogram lp-mono-d" aria-hidden>
                    D
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">2 · Challenge</p>
                    <h3>Daedalus challenges</h3>
                    <p className="lp-step-who">GPT · the Challenger</p>
                    <p className="lp-step-text">
                      A different model tries to break the draft: what&apos;s wrong, unsupported, outdated,
                      contradicted or missing.
                    </p>
                    <span className="lp-badge">Works today</span>
                    <p className="lp-step-later">
                      Today it works from what it already knows. Coming next: one click, web search, and every
                      challenge tied to a claim and a source.
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
                    <span className="lp-badge">Works today</span>
                    <p className="lp-step-later">Coming next: accept, reject or edit each challenge, or add your own.</p>
                  </div>
                </li>
                <li className="lp-step" data-step="tie">
                  <span className="lp-monogram lp-mono-t" aria-hidden>
                    <KnotGlyph />
                  </span>
                  <div className="lp-step-body">
                    <p className="lp-step-n">4 · Tie Off</p>
                    <h3>You tie it off</h3>
                    <p className="lp-step-who">Signed off by you</p>
                    <p className="lp-step-text">
                      The version you approved is kept with who drafted it, who challenged it and who tied it off.
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

            <blockquote className="lp-quote">
              <p>
                Don&apos;t ask another AI if the answer is good. <em>Ask it to try to prove the answer wrong.</em>
              </p>
              <footer>That&apos;s why the step is called Challenge, not Review.</footer>
            </blockquote>

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
                    <strong>A five-step thread:</strong> Odysseus (Claude) researches and drafts, Daedalus (GPT)
                    challenges the draft, you judge at the knot, and Odysseus writes up the version you approved.
                  </li>
                  <li>
                    <strong>Challenges you can act on:</strong> add any of them to your note in one click and send
                    the draft back. Odysseus revises, Daedalus challenges the new version, and a v1 → v2
                    comparison shows what changed. You press Run for each step.
                  </li>
                  <li>
                    <strong>Nothing is overwritten.</strong> Every run is kept in the history.
                  </li>
                  <li>The models work from what they already know. They don&apos;t search the web yet.</li>
                </ul>
              </div>
              <div className="lp-status-col next">
                <h3>
                  <span className="lp-badge lp-badge-next">Coming next</span> What we&apos;re building
                </h3>
                <ul>
                  <li>
                    <strong>Answer-first drafts</strong> with numbered claims, so you can read the answer in
                    seconds and point at exactly what you doubt.
                  </li>
                  <li>
                    <strong>One-click Challenge:</strong> the challenger searches the web, and every challenge
                    names a claim and carries a source. Challenges without one are labelled as opinion.
                  </li>
                  <li>
                    <strong>Judging point by point:</strong> accept, reject or edit each challenge, or add your own.
                  </li>
                  <li>
                    <strong>Revise and re-challenge only what changed:</strong> the drafter fixes the claims you
                    accepted, the challenger checks just those, and you tie off. A round or two, not an endless
                    debate.
                  </li>
                  <li>
                    <strong>Quick Answer and Deep Work:</strong> a fast answer when that&apos;s all you need, the
                    full thread when it matters.
                  </li>
                </ul>
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
                AI writes research fast. <em>Checking it is still on you.</em>
              </h2>
              <p className="lp-lede">When the work matters, the answer arrives and the questions start:</p>
            </div>
            <ul className="lp-questions">
              <li>Is this claim true?</li>
              <li>Does the source actually support it?</li>
              <li>Is it out of date?</li>
              <li>Did the model miss something?</li>
              <li>Do two sources contradict each other?</li>
              <li>Did it confidently make something up?</li>
            </ul>
            <p className="lp-close">
              So AI sometimes creates a new job: checking the AI. Ariadne is built to make that job smaller.
            </p>
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
            <p className="lp-lede lp-center">
              Analysts, builders and students doing serious work come later — researchers first.
            </p>
            <p className="lp-close">
              Most AI tools give you an answer. Ariadne gives you a way to challenge the answer before you trust
              it.
            </p>
            <p className="lp-isnt">
              <strong>What Ariadne isn&apos;t:</strong> ChatGPT with more models, AI agents talking to each other,
              or a promise of no hallucinations. Models still make mistakes, and the challenger is a second
              opinion, not an authority. The last word is always yours.
            </p>
          </div>
        </section>

        {/* ---------- an example ---------- */}
        <section className="lp-section" aria-labelledby="example-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">An example of how it works</p>
              <h2 id="example-title">
                One question, <em>start to finish.</em>
              </h2>
              <p className="lp-lede">
                An illustration of the steps, not real output. Some steps already run today in a simpler form;
                the labels say which.
              </p>
            </div>
            <div className="lp-example">
              <p className="lp-ask">
                <span className="lp-eyebrow">You ask</span>
                “Map the strongest pre-seed investors in Montreal investing in AI developer tools.”
              </p>
              <ol className="lp-pass">
                <li>
                  <p className="lp-pass-n">Draft</p>
                  <p>
                    Odysseus writes the answer first: a shortlist, with the reasons and sources for each name
                    underneath, and where it isn&apos;t sure.
                  </p>
                  <span className="lp-badge">Today</span>
                </li>
                <li>
                  <p className="lp-pass-n">Challenge</p>
                  <p>
                    Daedalus goes looking for what&apos;s wrong: a fund that no longer writes pre-seed cheques, a
                    partner who has moved on, a source that doesn&apos;t say what the draft claims, an obvious name
                    that&apos;s missing.
                  </p>
                  <span className="lp-badge">Today, without web search</span>
                </li>
                <li>
                  <p className="lp-pass-n">Judge</p>
                  <p>
                    You go through the challenges. A real problem? Accept it. Not valid? Reject it. Half right?
                    Edit it. Something nobody caught? Add your own. AI does not get the final vote.
                  </p>
                  <span className="lp-badge lp-badge-next">Point by point: coming next</span>
                </li>
                <li>
                  <p className="lp-pass-n">Revise</p>
                  <p>Odysseus rewrites the claims you accepted or edited, not the whole answer.</p>
                  <span className="lp-badge lp-badge-next">Coming next</span>
                </li>
                <li>
                  <p className="lp-pass-n">Re-challenge</p>
                  <p>Daedalus checks only what changed. A round or two, not an endless debate.</p>
                  <span className="lp-badge lp-badge-next">Coming next</span>
                </li>
                <li>
                  <p className="lp-pass-n">Tie Off</p>
                  <p>
                    “I&apos;m satisfied with this version. This is the final answer.” It&apos;s kept as finished
                    work, not another chat.
                  </p>
                  <span className="lp-badge">Today</span>
                </li>
              </ol>
              <p className="lp-example-note">
                Today, judging happens in one note: add the challenges you agree with and send the draft back.
                Odysseus redrafts and Daedalus challenges the new version in full.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- where the judgment sits ---------- */}
        <section className="lp-section lp-philo" aria-labelledby="philo-title">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Where the judgment sits</p>
            <h2 id="philo-title">
              <span className="lp-line">Agents do the work.</span> <span className="lp-line">Agents challenge the work.</span>{" "}
              <em className="lp-line">Humans judge the work.</em>
            </h2>
            <p className="lp-lede">
              Ariadne doesn&apos;t replace your judgment. It takes on the mechanical work around it:
            </p>
            <ul className="lp-chores">
              <li>copying context between models</li>
              <li>switching between chat windows</li>
              <li>asking one model to review another</li>
              <li>a first pass at checking claims</li>
              <li>hunting for contradictions</li>
              <li>reconciling two answers</li>
              <li>prompting again, and again</li>
            </ul>
          </div>
        </section>

        {/* ---------- two ways in (not built yet) ---------- */}
        <section className="lp-section" aria-labelledby="ways-title">
          <div className="lp-wrap">
            <div className="lp-intro">
              <p className="lp-eyebrow">Coming next · Two ways in</p>
              <h2 id="ways-title">
                A quick answer, <em>or the full thread.</em>
              </h2>
              <p className="lp-lede">Today every project runs the full thread. Soon you&apos;ll choose how deep to go.</p>
            </div>
            <ul className="lp-ways">
              <li>
                <span className="lp-badge lp-badge-next">Coming next</span>
                <h3>Quick Answer</h3>
                <p className="lp-ways-lead">Just need the answer? Start here.</p>
                <p>Get a fast answer, then challenge it if it matters.</p>
              </li>
              <li>
                <span className="lp-badge lp-badge-next">Coming next</span>
                <h3>Deep Work</h3>
                <p className="lp-ways-lead">Working on something important?</p>
                <p>
                  Let another model try to break the answer before you sign off on it. Draft → Challenge → Judge →
                  Revise → Tie Off, still answer-first, with the detail underneath.
                </p>
              </li>
            </ul>
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
          <p>Ariadne helps you verify important AI-generated work. You remain the final judge.</p>
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
