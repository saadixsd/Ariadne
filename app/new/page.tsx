import { redirect } from "next/navigation";
import { NewProjectFlow } from "@/components/NewProjectFlow";
import { currentUser } from "@/lib/auth";
import { dailyRunLimit, modelRunsToday } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const limit = dailyRunLimit(user);
  const left = Math.max(0, limit - (await modelRunsToday(user.id)));
  return <NewProjectFlow runsLeft={left} runsLimit={limit} />;
}
