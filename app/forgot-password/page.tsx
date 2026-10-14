import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Reset the password of your Ariadne account.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" />;
}
