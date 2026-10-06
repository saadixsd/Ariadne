/**
 * Cloudflare Turnstile site key for the sign-up form. Public by design (it ships in the
 * page). The widget's allowed hostnames are set in the Cloudflare dashboard; they must
 * include every host the sign-up page is served from (ariadneagents.si, www, and
 * app.ariadneagents.si while testing there). Local dev and tests build with Cloudflare's
 * always-pass test key instead: NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA.
 * The matching secret is the Worker secret TURNSTILE_SECRET (lib/signup-guard.ts).
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "0x4AAAAAAFNAmvf4QVghMro0";

export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
