/*
  The opaque token step 1 hands back, so later answers update the same row without
  ever naming the email:  base64url("<row id>.<expiry ms>") + "." + base64url(HMAC-SHA256).
  Signed with the TOKEN_SECRET secret; valid for two hours.
*/

export const TOKEN_TTL_MS = 2 * 3_600_000;
const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(secret: string, id: number, now = Date.now()): Promise<string> {
  const payload = encoder.encode(`${id}.${now + TOKEN_TTL_MS}`);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), payload));
  return `${b64url(payload)}.${b64url(signature)}`;
}

/** Row id if the token is genuine and unexpired, else null. HMAC verify is constant-time. */
export async function readToken(secret: string, token: unknown, now = Date.now()): Promise<number | null> {
  if (typeof token !== "string" || token.length > 200) return null;
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra !== undefined) return null;
  const payload = unb64url(payloadPart);
  const signature = unb64url(signaturePart);
  if (!payload || !signature) return null;
  if (!(await crypto.subtle.verify("HMAC", await key(secret), signature, payload))) return null;
  const match = /^(\d{1,12})\.(\d{13})$/.exec(new TextDecoder().decode(payload));
  if (!match || Number(match[2]) < now) return null;
  return Number(match[1]);
}
