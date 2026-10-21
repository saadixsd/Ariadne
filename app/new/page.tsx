import { redirect } from "next/navigation";
import { NewProjectFlow } from "@/components/NewProjectFlow";
import { currentUser } from "@/lib/auth";
import { quotaFor } from "@/lib/usage";

export const dynamic = "force-dynamic";

// No onboarding popup here any more (fix plan U9): the limits and a short explanation are inline.
export default async function NewProjectPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const q = await quotaFor(user.id);
  return <NewProjectFlow quota={{ runsLeft: q.runsLeft, runsPerDay: q.runsPerDay, resetsAt: q.resetsAt, rerunsPerRun: q.rerunsPerRun }} />;
}
