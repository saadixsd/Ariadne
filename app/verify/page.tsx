import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const user = await currentUser();
  if (user?.emailVerified) redirect("/");
  const { email } = await searchParams;
  return <AuthForm mode="verify" email={email ?? ""} />;
}
