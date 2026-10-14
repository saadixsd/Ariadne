import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Ariadne handles your projects, files and account.",
  alternates: { canonical: "/privacy" },
};

// Static. Only states what the app does today.
export default function Privacy() {
  return (
    <div className="lp">
      <main className="lp-section" style={{ borderTop: 0 }}>
        <div className="lp-wrap lp-faq">
          <p className="lp-eyebrow">
            <Link href="/">Ariadne</Link> · Privacy
          </p>
          <h2>Privacy</h2>
          <div style={{ display: "grid", gap: 14, color: "var(--color-ink-dim)" }}>
            <p>Your projects are private to your account. The Ariadne team cannot open them unless you choose to share a project with us when you send feedback. You can withdraw that in Settings.</p>
            <p>Original files you upload are kept for 3 days and then deleted. The text read from them stays with your project, so the draft and the check can use it, until you delete the project.</p>
            <p>To write and check answers, your brief, the text of your sources and the drafts are sent to the AI providers that run Odysseus and Daedalus, and the checks may search the web.</p>
            <p>You can delete any project, and everything in it, from Settings.</p>
            <p>
              Questions: <a href="mailto:saad@ariadneagents.si">saad@ariadneagents.si</a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
