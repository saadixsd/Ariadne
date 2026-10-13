import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { currentUser } from "@/lib/auth";
import { loadWorkspace } from "@/lib/workspace-server";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (!user.emailVerified) redirect("/verify");
  const { id } = await params;
  const data = await loadWorkspace(id, user.id);
  if (!data) notFound();
  return <Workspace initial={data} />;
}
