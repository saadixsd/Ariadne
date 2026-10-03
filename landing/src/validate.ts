/*
  Pure helpers for /api/early-access: no bindings, no I/O, so they are unit-tested
  directly (tests/validate.test.ts) and cost next to nothing per request.
  null always means "not answered", so an update never blanks a stored answer.
*/

export const MAX_BODY_BYTES = 4096;
export const TOOLS = ["claude", "gpt", "cursor", "codex", "gemini", "copilot", "other"] as const;
export const SWITCHING = ["several_daily", "daily", "weekly", "rarely"] as const;

const EMAIL = /^[^\s@"<>(),;:\\[\]]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/;

/** Trimmed, lowercased email, or null if it does not look deliverable. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  const at = email.lastIndexOf("@");
  if (at < 1 || at > 64) return null;
  if (email.includes("..")) return null;
  return EMAIL.test(email) ? email : null;
}

/** Free text: control characters out, whitespace collapsed, capped. Unicode is kept. */
export function text(input: unknown, max: number): string | null {
  if (typeof input !== "string") return null;
  const value = input.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return value || null;
}

/** Known tool ids only, deduplicated, in a fixed order. */
export function tools(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const picked = new Set(input.filter((item): item is string => typeof item === "string"));
  return TOOLS.filter((tool) => picked.has(tool));
}

export function switching(input: unknown): string | null {
  return typeof input === "string" && (SWITCHING as readonly string[]).includes(input) ? input : null;
}

/** Host only (no path, no query) of a referrer URL, or null. Our own hosts are dropped. */
export function referrerHost(input: unknown, ownHosts: string[]): string | null {
  if (typeof input !== "string" || !input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().slice(0, 120);
    return ownHosts.includes(host) ? null : host;
  } catch {
    return null;
  }
}

export type Answers = {
  usesAiFor: string | null;
  tools: string | null;
  toolsOther: string | null;
  switching: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

/** Form posts (no-JS fallback) arrive as URL-encoded fields; map them onto the JSON shape. */
export function fromForm(form: URLSearchParams): Record<string, unknown> {
  return {
    email: form.get("email") ?? "",
    usesAiFor: form.get("usesAiFor") ?? "",
    tools: form.getAll("tools"),
    toolsOther: form.get("toolsOther") ?? "",
    switching: form.get("switching") ?? "",
    turnstileToken: form.get("cf-turnstile-response") ?? "",
    done: true,
  };
}

export function answers(body: Record<string, unknown>, ownHosts: string[]): Answers {
  const picked = tools(body.tools);
  const utm = (body.utm && typeof body.utm === "object" ? body.utm : {}) as Record<string, unknown>;
  return {
    usesAiFor: text(body.usesAiFor, 280),
    tools: picked.length ? picked.join(",") : null,
    toolsOther: picked.includes("other") ? text(body.toolsOther, 80) : null,
    switching: switching(body.switching),
    referrer: referrerHost(body.referrer, ownHosts),
    utmSource: text(utm.source, 80),
    utmMedium: text(utm.medium, 80),
    utmCampaign: text(utm.campaign, 80),
  };
}

/** Comma-separated var -> trimmed, non-empty list. */
export function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
