"use client";

import { useState } from "react";

export type SharedFeedback = { id: string; createdAt: string; project: string | null; allowProjectView: boolean };

/** Settings: every feedback item tied to a project, with its "team may view" switch. */
export function FeedbackConsent({ items }: { items: SharedFeedback[] }) {
  const [rows, setRows] = useState(items);
  const [error, setError] = useState<string | null>(null);
  async function toggle(id: string, next: boolean) {
    setError(null);
    const res = await fetch(`/api/feedback/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowProjectView: next }) });
    if (!res.ok) return setError("Could not save. Try again.");
    setRows((r) => r.map((x) => (x.id === id ? { ...x, allowProjectView: next } : x)));
  }
  if (rows.length === 0) return <p className="mt-2 text-[13px] text-ink-dim">You have not sent feedback about a project.</p>;
  return (
    <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm">{r.project ?? "Deleted project"}</p>
            <p className="text-xs text-ink-dim">Sent {r.createdAt.slice(0, 10)}</p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs">
            <input type="checkbox" checked={r.allowProjectView} onChange={(e) => void toggle(r.id, e.target.checked)} />
            Team may view this project
          </label>
        </li>
      ))}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </ul>
  );
}
