import { redirect } from "next/navigation";
import { NewProjectFlow } from "@/components/NewProjectFlow";
import { currentUser } from "@/lib/auth";
import { WORKFLOWS_PER_DAY } from "@/lib/limits";
import { workflowsLeft } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const limit = WORKFLOWS_PER_DAY;
  const left = await workflowsLeft(user.id);
  return <NewProjectFlow runsLeft={left} runsLimit={limit} />;
}
