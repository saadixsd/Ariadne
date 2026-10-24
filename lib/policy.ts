/** The privacy policy in force (app/privacy). Bump the version when the policy changes materially. */
export const PRIVACY_POLICY_VERSION = "2026-10-14";
export const PRIVACY_POLICY_EFFECTIVE = "October 14, 2026";

/** Prefer CONTACT_EMAIL when set; otherwise GitHub Issues for self-hosted / open-source. */
const CONTACT = typeof process !== "undefined" ? process.env.CONTACT_EMAIL?.trim() : undefined;
export const PRIVACY_CONTACT_LABEL = CONTACT || "GitHub Issues";
export const PRIVACY_CONTACT_HREF = CONTACT
  ? `mailto:${CONTACT}`
  : "https://github.com/saadixsd/Ariadne/issues";
/** Display string used by the privacy page (email or "GitHub Issues"). */
export const PRIVACY_CONTACT = PRIVACY_CONTACT_LABEL;
