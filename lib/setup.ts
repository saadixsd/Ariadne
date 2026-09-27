import "server-only";

const REQUIRED = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_MODEL", "OPENAI_MODEL"] as const;

export function missingSetup(): string[] {
  return REQUIRED.filter((key) => !process.env[key]?.trim());
}
