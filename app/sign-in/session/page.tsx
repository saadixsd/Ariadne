import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Reached only through proxy.ts, for /sign-in requests that carry a session cookie.
export default async function SignInPageWithSession() {
  const user = await currentUser();
  if (user?.emailVerified) redirect("/");
  return <AuthForm mode="sign-in" />;
}
