/*
  Estimated cost of one model run, from the provider's reported token usage and list prices
  (USD per million tokens; web searches per call). Prices are list prices checked Oct 14 2026;
  unknown models get no estimate rather than a guess.
*/
import type { CallUsage } from "@/lib/agents";

type Price = { input: number; output: number; cacheRead: number; perSearch: number };
const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, perSearch: 0.01 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1, perSearch: 0.01 },
  "gpt-6.1-sol": { input: 2, output: 10, cacheRead: 0.2, perSearch: 0.01 },
  "gpt-6-luna": { input: 0.1, output: 0.5, cacheRead: 0.01, perSearch: 0.01 },
};

export function estimateCostUsd(model: string, u: Pick<CallUsage, "inputTokens" | "outputTokens" | "cacheReadTokens" | "searches">): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const usd = (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead) / 1e6 + u.searches * p.perSearch;
  return Math.round(usd * 10000) / 10000;
}
