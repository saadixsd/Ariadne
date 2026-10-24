import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_CONTACT, PRIVACY_CONTACT_HREF, PRIVACY_POLICY_EFFECTIVE, PRIVACY_POLICY_VERSION } from "@/lib/policy";
import "../landing.css";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Ariadne collects, uses, shares and protects personal information, and how to exercise your rights.",
  alternates: { canonical: "/privacy" },
};

const mail = PRIVACY_CONTACT_HREF;

// Static. Describes only what the app does today (see lib/, proxy.ts, public/consent.js).
// Keep in step with the code; bump PRIVACY_POLICY_VERSION in lib/policy.ts on material changes.
export default function Privacy() {
  return (
    <div className="lp">
      <main className="lp-section lp-policy" style={{ borderTop: 0 }}>
        <div className="lp-wrap">
          <p className="lp-eyebrow">
            <Link href="/">Ariadne</Link> · Privacy
          </p>
          <h1 className="lp-policy-title">Privacy Policy</h1>
          <p className="lp-policy-meta">
            Effective {PRIVACY_POLICY_EFFECTIVE} · Version {PRIVACY_POLICY_VERSION}
          </p>

          <p>
            This policy explains what personal information Ariadne collects, why, who it is shared with, how long it is kept, and the rights you have under
            Canada&apos;s Personal Information Protection and Electronic Documents Act (PIPEDA) and Québec&apos;s Act respecting the protection of personal
            information in the private sector. We collect only what the service needs.
          </p>

          <h2>Who is responsible</h2>
          <p>
            Ariadne is operated by the Ariadne team. The person in charge of the protection of personal information is the Ariadne team&apos;s privacy lead,
            reachable via <a href={mail}>{PRIVACY_CONTACT}</a>. Use that link for any question, request or complaint about your personal information.
          </p>

          <h2>What we collect, and why</h2>
          <ul>
            <li><b>Account:</b> your email address, a salted hash of your password (never the password itself), whether your email is verified, and optionally your first and last name. Purpose: to create your account, sign you in and contact you about it.</li>
            <li><b>Sign-in sessions:</b> a random session token (stored only as a hash) for up to 30 days. Purpose: keeping you signed in.</li>
            <li><b>Your projects:</b> the questions, briefs, notes, drafts, fact-checks, your decisions on flagged claims and the history of each project. Purpose: providing the service you asked for.</li>
            <li><b>Files you upload:</b> the text is read in your browser and stored with the project. The original file is kept for 3 days, then deleted. Purpose: drafting and checking against your sources.</li>
            <li><b>Feedback you send:</b> your message and ratings, and, only if you tick the box, permission for the team to open that one project. Purpose: improving Ariadne. You can withdraw that permission in Settings.</li>
            <li><b>Usage counts:</b> how many projects and model runs you start each day, and their cost. Purpose: daily limits and keeping the service affordable.</li>
            <li><b>Security data:</b> your IP address, used briefly to limit sign-up, sign-in and reset attempts (counters expire within an hour) and passed to Cloudflare Turnstile at sign-up to tell people from bots. Purpose: protecting accounts and the service.</li>
            <li><b>Sign-up consent:</b> the date you agreed to this policy and its version.</li>
            <li><b>Outreach attribution (optional):</b> if you arrived from one of our outreach links and accepted optional cookies, the link&apos;s code and campaign name are kept with your account. The code identifies a link, not a person&apos;s name or email.</li>
          </ul>
          <p>
            Ariadne does not use your information for advertising, does not sell it, and does not use it to make automated decisions about you. Ariadne is
            not intended for children under 14.
          </p>

          <h2>Who we share it with, and where it goes</h2>
          <p>We share personal information only with service providers that process it on our behalf, to run the service:</p>
          <ul>
            <li><b>Cloudflare</b> (hosting, database, file storage, bot check, and cookieless page analytics if you opt in).</li>
            <li><b>Anthropic and OpenAI</b> (the AI models that write and fact-check answers). To draft and check an answer, your brief, the text of your sources and the drafts are sent to them, and the checks may search the web.</li>
            <li><b>Brevo</b> (sends account emails such as verification codes and password-reset links).</li>
          </ul>
          <p>
            These providers store or process information outside Québec and outside Canada, including in the United States and the European Union, where
            local laws (for example, laws allowing government access) apply. Avoid putting information you would not want processed this way, such as
            health records about identifiable people, into a project.
          </p>
          <p>We may also disclose information where the law requires it.</p>

          <h2>How long we keep it</h2>
          <ul>
            <li>Original uploaded files: 3 days.</li>
            <li>Projects, including the text read from your files: until you delete the project or your account.</li>
            <li>Account information: while your account exists. When you ask us to delete your account, we delete it and its projects.</li>
            <li>Sessions: 30 days or until you sign out. Verification codes: 15 minutes. Password-reset links: 30 minutes.</li>
            <li>Feedback: until it is no longer needed to improve the service, or until you ask us to delete it.</li>
          </ul>

          <h2>Your rights</h2>
          <p>You can ask us, via <a href={mail}>{PRIVACY_CONTACT}</a>, to:</p>
          <ul>
            <li>confirm what personal information we hold about you and give you a copy (access);</li>
            <li>correct information that is inaccurate, incomplete or equivocal (rectification);</li>
            <li>give you the information you provided in a structured, commonly used format (portability); you can also export any project yourself;</li>
            <li>delete your account and its data; you can delete any project yourself from the app;</li>
            <li>withdraw your consent, for example to optional cookies or to the team viewing a project you shared with feedback.</li>
          </ul>
          <p>
            We will confirm your identity, reply in writing within 30 days, and do this free of charge. If we refuse a request, we will tell you why and how
            to challenge it.
          </p>

          <h2>Complaints</h2>
          <p>
            Please contact us first via <a href={mail}>{PRIVACY_CONTACT}</a>; we will look into it and reply. You may also complain to the{" "}
            <a href="https://www.cai.gouv.qc.ca/" target="_blank" rel="noopener noreferrer">Commission d&apos;accès à l&apos;information du Québec</a> or the{" "}
            <a href="https://www.priv.gc.ca/" target="_blank" rel="noopener noreferrer">Office of the Privacy Commissioner of Canada</a>.
          </p>

          <h2 id="cookies">Cookies and similar technology</h2>
          <p>
            Optional cookies and analytics are off by default. They are used only if you choose Accept, or turn them on in{" "}
            <a href="/privacy#cookies" data-consent-open>Cookie settings</a>, which you can change at any time (also from Settings).
          </p>
          <div className="lp-policy-table" role="region" aria-label="Cookies" tabIndex={0}>
            <table>
              <thead>
                <tr><th>Name</th><th>Type</th><th>Purpose</th><th>Kept for</th></tr>
              </thead>
              <tbody>
                <tr><td>ariadne_session</td><td>Strictly necessary</td><td>Keeps you signed in (random token, not readable by page scripts).</td><td>30 days</td></tr>
                <tr><td>ariadne_in</td><td>Strictly necessary</td><td>Tells the home page you are signed in, to show &ldquo;Open Your Projects&rdquo;. Contains only &ldquo;1&rdquo;.</td><td>30 days</td></tr>
                <tr><td>ariadne_consent</td><td>Strictly necessary</td><td>Remembers your cookie choice.</td><td>6 months</td></tr>
                <tr><td>ariadne_ref</td><td>Optional (attribution)</td><td>Which outreach link brought you to Ariadne, saved with your account if you sign up.</td><td>30 days</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Ariadne also stores one item in your browser&apos;s local storage (ariadne_intro_done) so the first-run intro is not shown again. If you opt in
            and analytics is enabled, Cloudflare Web Analytics counts page views without cookies. At sign-up, Cloudflare Turnstile runs a bot check, which
            Cloudflare describes in its own privacy policy. Ariadne does not use advertising or cross-site tracking cookies.
          </p>

          <h2>Emails</h2>
          <p>
            Ariadne sends only emails about your account: verification codes and password-reset links you request. We do not send marketing emails from the
            app. If we ever send you a promotional message, it will identify us, include our contact information and let you unsubscribe.
          </p>

          <h2>Security</h2>
          <p>
            Passwords are stored only as salted hashes, sessions and reset tokens only as hashes, and all traffic uses HTTPS. Only the Ariadne team can
            access the systems, and only to run the service; the team cannot open your projects unless you share one with feedback. If a confidentiality
            incident presents a risk of serious injury, we will notify you and the regulators as the law requires.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            We will post any change here with a new effective date and, for significant changes, tell you in the app or by email before it applies.
          </p>
        </div>
      </main>
    </div>
  );
}
