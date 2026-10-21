import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { currentUser } from "@/lib/auth";
import { loadWorkspace } from "@/lib/workspace-server";

export const dynamic = "force-dynamic";

// No onboarding popup (fix plan U9): the empty answer explains the four stages inline.
export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ start?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const { id } = await params;
  const { start } = await searchParams;
  const data = await loadWorkspace(id, user.id);
  if (!data) notFound();
  return <Workspace initial={data} autoStart={start === "1"} />;
}
