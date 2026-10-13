/*
  Campaign attribution (first touch). An outreach link looks like
    https://ariadneagents.si/?ref=r-k7m2q9-3fa91c0e&utm_source=email&utm_campaign=researchers-w1
  proxy.ts keeps these in a first-party cookie for 30 days; sign-up saves them on the User.
  A ref code carries no name or email: which person got which code lives only in the
  outreach sheet, outside the app.

  A ref code is "signed" when its last part is an HMAC of the rest under REF_SECRET
  (scripts/ref-codes.mjs makes them). Only a signed code earns the invite-level run
  allowance; anything else is still recorded for attribution but changes nothing.
*/

export const CAMPAIGN_COOKIE = "ariadne_ref";
export const CAMPAIGN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export type Campaign = { ref: string | null; source: string | null; campaign: string | null };

const TOKEN = /^[A-Za-z0-9._-]{1,64}$/;

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return TOKEN.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function campaignFromParams(params: URLSearchParams): Campaign | null {
  const found = {
    ref: clean(params.get("ref")),
    source: clean(params.get("utm_source")),
    campaign: clean(params.get("utm_campaign")),
  };
  return found.ref || found.source || found.campaign ? found : null;
}

export function encodeCampaign(c: Campaign): string {
  return [c.ref ?? "", c.source ?? "", c.campaign ?? ""].join("|");
}

export function decodeCampaign(value: string | null | undefined): Campaign | null {
  if (!value) return null;
  const [ref, source, campaign] = decodeURIComponent(value).split("|");
  const out = { ref: clean(ref), source: clean(source), campaign: clean(campaign) };
  return out.ref || out.source || out.campaign ? out : null;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** "r-<id>-<first 8 hex of HMAC(r-<id>)>". */
export async function signRef(id: string, secret: string): Promise<string> {
  const base = `r-${id.toLowerCase()}`;
  return `${base}-${(await hmacHex(secret, base)).slice(0, 8)}`;
}

export async function isSignedRef(ref: string | null | undefined, secret: string | undefined): Promise<boolean> {
  if (!ref || !secret) return false;
  const match = /^(r-[a-z0-9]{3,24})-([0-9a-f]{8})$/.exec(ref);
  if (!match) return false;
  const expected = (await hmacHex(secret, match[1])).slice(0, 8);
  return expected === match[2];
}
