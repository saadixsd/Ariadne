"use client";

import { useEffect, useRef } from "react";
import { nextPollDelay } from "@/lib/poll-schedule";
import type { ProjectDTO } from "@/lib/types";

// Last ETag seen per project, shared by every fetch in this tab, so a poll right
// after an action's refresh can already come back as 304.
const etags = new Map<string, string>();

export type ProjectFetch =
  | { kind: "changed"; project: ProjectDTO }
  | { kind: "unchanged" }
  | { kind: "error"; status: number };

/** GET the project; with `conditional`, echo the last ETag and accept a 304. */
export async function fetchProject(projectId: string, conditional = false): Promise<ProjectFetch> {
  const headers: Record<string, string> = {};
  const known = etags.get(projectId);
  if (conditional && known) headers["If-None-Match"] = known;
  const response = await fetch(`/api/projects/${projectId}`, { headers, cache: "no-store" });
  if (response.status === 304) return { kind: "unchanged" };
  if (!response.ok) return { kind: "error", status: response.status };
  const etag = response.headers.get("etag");
  if (etag) etags.set(projectId, etag);
  return { kind: "changed", project: (await response.json()) as ProjectDTO };
}

/**
 * Polls one project on the lib/poll-schedule ladder: fast while something spins,
 * backing off while idle, paused while the tab is hidden. Returns `kick`, which
 * resets the back-off (call it after any user action).
 */
export function useProjectPoll({
  projectId,
  spinning,
  onChange,
}: {
  projectId: string;
  spinning: boolean;
  onChange: (project: ProjectDTO, requestedId: string) => void;
}) {
  const quiet = useRef(0);
  const onChangeRef = useRef(onChange);
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let inFlight = false;

    function schedule() {
      window.clearTimeout(timer);
      if (cancelled) return;
      const delay = nextPollDelay({ spinning, hidden: document.visibilityState === "hidden", quietPolls: quiet.current });
      if (delay !== null) timer = window.setTimeout(() => void tick(), delay);
    }

    async function tick() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const result = await fetchProject(projectId, true);
        if (cancelled) return;
        if (result.kind === "changed") {
          quiet.current = 0;
          onChangeRef.current(result.project, projectId);
        } else if (result.kind === "unchanged" && !spinning) {
          quiet.current += 1;
        }
      } catch {
        // Offline or the server restarted: keep backing off, try again later.
        if (!spinning) quiet.current += 1;
      } finally {
        inFlight = false;
        schedule();
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        quiet.current = 0;
        void tick();
      } else {
        window.clearTimeout(timer);
      }
    }

    kickRef.current = () => {
      quiet.current = 0;
      schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [projectId, spinning]);

  return { kick: () => kickRef.current() };
}
