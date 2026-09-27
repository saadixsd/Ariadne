import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const user = await currentUser();
  if (user?.emailVerified) redirect("/");
  return <AuthForm mode="sign-up" />;
}
