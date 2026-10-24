/** Where Help goes. Prefer CONTACT_EMAIL when set; otherwise GitHub Issues. */
const CONTACT = typeof process !== "undefined" ? process.env.CONTACT_EMAIL?.trim() : undefined;
export const HELP_LABEL = CONTACT || "GitHub Issues";
export const HELP_HREF = CONTACT
  ? `mailto:${CONTACT}?subject=${encodeURIComponent("Ariadne help")}`
  : "https://github.com/saadixsd/Ariadne/issues";
/** @deprecated Use HELP_HREF / HELP_LABEL. Kept for call sites that expect an email string. */
export const HELP_EMAIL = HELP_LABEL;
/** @deprecated Use HELP_HREF. */
export const HELP_MAILTO = HELP_HREF;
