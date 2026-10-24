/**
 * Cloudflare Turnstile site key for the sign-up form. Public by design (it ships in the
 * page). Defaults to Cloudflare's always-pass test key for local / open-source use.
 * Set NEXT_PUBLIC_TURNSTILE_SITE_KEY (and TURNSTILE_SECRET) for a real deploy; allowed
 * hostnames are configured in the Cloudflare Turnstile dashboard.
 * The matching secret is TURNSTILE_SECRET (lib/signup-guard.ts).
 */
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "1x00000000000000000000AA";

export const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
