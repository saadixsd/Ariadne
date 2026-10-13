"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** False during SSR and hydration, true afterwards: the server has no idea of the viewer's time zone. */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export type TimeFormat = "time" | "dateTime" | "date" | "short" | "relative";

export function formatLocal(iso: string, format: TimeFormat): string {
  const d = new Date(iso);
  switch (format) {
    case "time":
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    case "date":
      return d.toLocaleDateString();
    case "short":
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    case "relative": {
      const today = new Date().toDateString() === d.toDateString();
      return `${today ? "Today" : d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    default:
      return d.toLocaleString();
  }
}

/**
 * A time in the viewer's zone. Rendered empty on the server and filled in after hydration,
 * so server (UTC) and browser text never disagree (React error #418).
 */
export function LocalTime({ iso, format = "dateTime", className }: { iso: string; format?: TimeFormat; className?: string }) {
  const hydrated = useHydrated();
  return (
    <time dateTime={iso} className={className}>
      {hydrated ? formatLocal(iso, format) : ""}
    </time>
  );
}
