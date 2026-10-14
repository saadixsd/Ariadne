import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  // The token is in the URL: never send it on as a referrer.
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return <AuthForm mode="reset" />;
}
