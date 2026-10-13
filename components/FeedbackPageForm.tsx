"use client";

import { useRouter } from "next/navigation";
import { FeedbackForm } from "@/components/FeedbackForm";

export function FeedbackPageForm({ projects, projectId }: { projects: { id: string; name: string }[]; projectId: string | null }) {
  const router = useRouter();
  return (
    <div className="mt-6 bg-panel p-4 ring-1 ring-line">
      {projectId ? (
        <p className="mb-3 text-sm text-ink-dim">About: {projects.find((p) => p.id === projectId)?.name}</p>
      ) : null}
      <FeedbackForm projectId={projectId} source="page" onDone={() => router.refresh()} />
    </div>
  );
}
