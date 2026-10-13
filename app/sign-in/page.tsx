import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Ariadne.",
  alternates: { canonical: "/sign-in" },
  robots: { index: true, follow: true },
  openGraph: { url: "/sign-in", title: "Sign in · Ariadne", description: "Sign in to Ariadne." },
};

// Static: built once at deploy, so the door costs the Worker almost no CPU. A visitor
// who already holds a session cookie is rewritten by proxy.ts to ./session, which
// checks the session and sends a signed-in, verified account to the board as before.
export default function SignInPage() {
  return <AuthForm mode="sign-in" />;
}
