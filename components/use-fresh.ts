"use client";

import { useState } from "react";

/**
 * Keys present on first render are "old"; anything that appears later is "fresh".
 * The thread draws itself only for segments spun while you watch, not for every
 * finished segment each time the page loads.
 */
export function useFresh(initialKeys: readonly string[]): (key: string) => boolean {
  const [initial] = useState(() => new Set(initialKeys));
  return (key) => !initial.has(key);
}
