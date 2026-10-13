"use client";

import { useState } from "react";
import { TRIAGE } from "@/lib/feedback";

export function TriageSelect({ id, value }: { id: string; value: string | null }) {
  const [current, setCurrent] = useState(value ?? "new");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  return (
    <label className="text-xs text-ink-dim">
      Triage{" "}
      <select
        value={current}
        onChange={async (event) => {
          const next = event.target.value;
          setCurrent(next);
          setState("saving");
          const res = await fetch(`/api/admin/feedback/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ triage: next }),
          }).catch(() => null);
          setState(res?.ok ? "idle" : "error");
        }}
        className="bg-canvas px-1 py-0.5 text-xs text-ink ring-1 ring-line"
      >
        {TRIAGE.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {state === "saving" ? " saving…" : state === "error" ? " not saved" : ""}
    </label>
  );
}
