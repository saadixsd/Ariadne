import { redirect } from "next/navigation";
import { projectDoor } from "@/lib/project-door";

export const dynamic = "force-dynamic";

// The old Tree view. Gone; old links open the project's Workspace.
export default async function TreePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  redirect(await projectDoor(project));
}
