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
  | { kind: "error"; status: number; message: string | null };

/** The server's `{ error }` text when the body is JSON; null for an HTML error page or an empty body. */
export async function serverError(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" && body.error.trim() ? body.error.trim() : null;
}

/** Plain wording for a failed request, with the server's own error when it sent one. */
export function failureText(what: string, status: number, message: string | null): string {
  if (!message) return `${what} (the server answered ${status}).`;
  return /[.!?]$/.test(message) ? `${what}: ${message}` : `${what}: ${message}.`;
}

/**
 * The board cannot continue without a session or without its project, so these send
 * the browser somewhere that can: sign-in when the session expired, verify when the
 * email is unconfirmed, and the user's next project when this one was deleted. A full
 * reload, because every piece of client state belongs to what just went away.
 */
function leaveIfGone(status: number) {
  if (typeof window === "undefined") return;
  if (status === 401) window.location.replace("/sign-in");
  else if (status === 403) window.location.replace("/verify");
  else if (status === 404) window.location.replace(window.location.pathname.startsWith("/tree") ? "/tree" : "/dashboard");
}

/**
 * The headline for a failed Run/Rerun. A 502 means the model provider failed; its raw
 * error (often a JSON body) stays on the frayed step, next to Copy error, not in the toast.
 */
export function runFailureText(what: string, status: number, message: string | null): string {
  if (status === 502) return `${what}: the AI service returned an error instead of an answer.`;
  return failureText(what, status, message);
}

/** What to tell the user after a Run/Rerun request failed, beyond the headline. */
export function runFailureNext(status: number): string {
  if (status === 429) return "Your daily allowance resets at 00:00 UTC. Everything so far is saved.";
  // 503 from Run is the site-wide daily ceiling (lib/usage.ts), not this account's quota.
  if (status === 503) return "Your own daily project is untouched: Ariadne has reached its daily limit across all accounts. It resets at 00:00 UTC, and everything so far is saved.";
  if (status === 409) return "The board has refreshed, so check the step and try again.";
  if (status === 502) return "This attempt did not use a daily run. Open the step to copy the error, or press Respin when you want another attempt.";
  return "Open the step to copy the error, or press Respin when you want another attempt.";
}

/** GET the project; with `conditional`, echo the last ETag and accept a 304. */
export async function fetchProject(projectId: string, conditional = false): Promise<ProjectFetch> {
  const headers: Record<string, string> = {};
  const known = etags.get(projectId);
  if (conditional && known) headers["If-None-Match"] = known;
  const response = await fetch(`/api/projects/${projectId}`, { headers, cache: "no-store" });
  if (response.status === 304) return { kind: "unchanged" };
  if (!response.ok) {
    leaveIfGone(response.status);
    return { kind: "error", status: response.status, message: await serverError(response) };
  }
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

    // Back online: ask right away instead of waiting out the idle back-off.
    function onOnline() {
      quiet.current = 0;
      void tick();
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
    window.addEventListener("online", onOnline);
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [projectId, spinning]);

  return { kick: () => kickRef.current() };
}
