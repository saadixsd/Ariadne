/** Where Help goes: an email to the Ariadne team. Override with CONTACT_EMAIL. */
export const HELP_EMAIL =
  (typeof process !== "undefined" && process.env.CONTACT_EMAIL?.trim()) ||
  "team@ariadneagents.si";
export const HELP_MAILTO = `mailto:${HELP_EMAIL}?subject=${encodeURIComponent("Ariadne help")}`;
