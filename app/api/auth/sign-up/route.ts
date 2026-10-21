import { cookies } from "next/headers";
import { CAMPAIGN_COOKIE, decodeCampaign, isSignedRef } from "@/lib/campaign";
import { checkSignUpInput, signUp, isTesterCode } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { checkInvite, requireHuman } from "@/lib/signup-guard";
import { TaskRunError } from "@/lib/errors";
import { PRIVACY_POLICY_VERSION } from "@/lib/policy";

export const runtime = "nodejs";

// Order: per-IP rate limit (every attempt counts) -> body -> email/password shape ->
// Turnstile -> invite switch -> create the account. Nothing touches the User table until
// the visitor has passed Turnstile, so a bot cannot even learn whether an email exists.
export async function POST(request: Request) {
  try {
    await enforceRateLimit(request, "signup");
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
      turnstileToken?: unknown;
      inviteCode?: unknown;
      privacyConsent?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    checkSignUpInput(email, password);
    if (body?.privacyConsent !== true) throw new TaskRunError("Please agree to the Privacy Policy to create an account.", 400);
    await requireHuman(typeof body?.turnstileToken === "string" ? body.turnstileToken : "", clientIp(request));
    const rawInvite = typeof body?.inviteCode === "string" ? body.inviteCode : "";
    // While sign-up is open checkInvite keeps no code; a tester code (TESTER_INVITE_CODES) is still kept.
    const inviteCode = checkInvite(rawInvite) ?? (isTesterCode(rawInvite) ? rawInvite.trim().toLowerCase().slice(0, 64) : null);
    const campaign = decodeCampaign((await cookies()).get(CAMPAIGN_COOKIE)?.value);
    // Only a signed outreach code is kept as refCode (it lifts the trial cap); an unsigned
    // one is still attributed through utm_* but is not trusted for anything.
    const signed = await isSignedRef(campaign?.ref, process.env.REF_SECRET);
    const result = await signUp(email, password, {
      inviteCode,
      refCode: signed ? campaign?.ref : null,
      utmSource: campaign?.source ?? null,
      utmCampaign: campaign?.campaign ?? (campaign?.ref && !signed ? `unsigned:${campaign.ref}`.slice(0, 64) : null),
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
