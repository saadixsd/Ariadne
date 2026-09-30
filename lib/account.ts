export type AccountIdentity = {
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export type AccountDisplay = {
  initial: string;
  name: string;
  firstName: string;
  lastName: string;
};

export function accountDisplay(account: AccountIdentity): AccountDisplay {
  const firstName = account.firstName?.trim() ?? "";
  const lastName = account.lastName?.trim() ?? "";
  if (firstName || lastName) {
    const named = firstName || lastName;
    return {
      initial: named.charAt(0).toUpperCase(),
      name: [firstName, lastName].filter(Boolean).join(" "),
      firstName,
      lastName,
    };
  }

  const local = account.email.split("@")[0] ?? "";
  const letter = local.charAt(0);
  return {
    initial: letter ? letter.toUpperCase() : "?",
    name: account.email,
    firstName: "",
    lastName: "",
  };
}

export const MAX_PERSON_NAME_CHARS = 60;

/**
 * A first or last name from a request body: trimmed, inner whitespace collapsed,
 * control characters refused. Empty (or null) clears the name and returns null.
 * Returns undefined when the value is unusable (not text, or too long).
 */
export function readPersonName(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length > MAX_PERSON_NAME_CHARS) return undefined;
  return name || null;
}
