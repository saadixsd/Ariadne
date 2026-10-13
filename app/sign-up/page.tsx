import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create an Ariadne account. One model drafts, another challenges, you judge.",
  alternates: { canonical: "/sign-up" },
  robots: { index: true, follow: true },
  openGraph: { url: "/sign-up", title: "Create an account · Ariadne", description: "Create an Ariadne account. One model drafts, another challenges, you judge." },
};

// Static: built once at deploy, so the door costs the Worker almost no CPU. A visitor
// who already holds a session cookie is rewritten by proxy.ts to ./session, which
// checks the session and sends a signed-in, verified account to the board as before.
export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
