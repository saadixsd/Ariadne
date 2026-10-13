import { redirect } from "next/navigation";
import { projectDoor } from "@/lib/project-door";

export const dynamic = "force-dynamic";

// The old Board lived here. It is gone; /dashboard (and ?project=, ?new=1) now only sends
// people to the Workspace or the new-project flow.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ project?: string; new?: string }> }) {
  const { project, new: startNew } = await searchParams;
  if (startNew === "1") redirect("/new");
  redirect(await projectDoor(project));
}
