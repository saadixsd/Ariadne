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

export function isDemoAccount(templates: readonly string[]): boolean {
  return templates.length > 0 && templates.every((template) => template === "landing" || template === "market");
}

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
