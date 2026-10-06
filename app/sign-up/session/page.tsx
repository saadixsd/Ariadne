import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Reached only through proxy.ts, for /sign-up requests that carry a session cookie.
export default async function SignUpPageWithSession() {
  const user = await currentUser();
  if (user?.emailVerified) redirect("/dashboard");
  return <AuthForm mode="sign-up" />;
}
