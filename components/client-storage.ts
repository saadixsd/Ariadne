"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    return;
  }
  emit();
}

const checkSnapshots = new Map<string, { raw: string; value: boolean[] }>();
const EMPTY_CHECKS = [false, false, false];

export function readChecks(key: string): boolean[] {
  let raw = "[]";
  try {
    raw = localStorage.getItem(key) ?? "[]";
  } catch {
    raw = "[]";
  }
  const cached = checkSnapshots.get(key);
  if (cached && cached.raw === raw) return cached.value;
  let value = EMPTY_CHECKS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      value = [0, 1, 2].map((index) => parsed[index] === true);
    }
  } catch {
    value = EMPTY_CHECKS;
  }
  checkSnapshots.set(key, { raw, value });
  return value;
}

export function writeChecks(key: string, checks: boolean[]) {
  try {
    localStorage.setItem(key, JSON.stringify(checks));
  } catch {
    return;
  }
  emit();
}

export function useFlag(key: string, serverValue = false) {
  return useSyncExternalStore(
    subscribe,
    () => readFlag(key),
    () => serverValue,
  );
}

export function useChecks(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => readChecks(key),
    () => EMPTY_CHECKS,
  );
}
