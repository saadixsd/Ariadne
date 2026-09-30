"use client";

import { useSyncExternalStore } from "react";
import { clock, clockShort } from "@/lib/thread";

// One shared 1s clock for every ticking label. The server snapshot is 0, so timers render
// nothing until the client has hydrated (no hydration mismatch, no setState in effects).
let now = 0;
let timer: number | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      for (const item of listeners) item();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}

function subscribeNever() {
  return () => {};
}

/** False while server-rendering and hydrating, true once the client has taken over. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/**
 * Wall-clock formatters that render nothing until hydration. The server (a Worker runs in
 * UTC) and the browser format times in different zones, so printing them during SSR would
 * cause a hydration mismatch.
 */
export function useClocks(): { clock: typeof clock; clockShort: typeof clockShort } {
  const hydrated = useHydrated();
  return hydrated ? { clock, clockShort } : { clock: () => null, clockShort: () => null };
}
