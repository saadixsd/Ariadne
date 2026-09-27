const CLAUDE_MODEL_ID = /\bclaude-[a-z0-9]+(?:[._-][a-z0-9]+)*/gi;
const GPT_MODEL_ID = /\b(?:chatgpt|gpt)-[a-z0-9]+(?:[._-][a-z0-9]+)*/gi;
const OPENAI_O_SERIES_ID = /\bo[1-9](?:-[a-z0-9]+)+/gi;

function isHuman(value: string): boolean {
  return value === "human" || value === "you";
}

function labelForModelId(model: string): string | null {
  const value = model.trim().toLowerCase();
  if (!value || isHuman(value) || value === "unset") return null;
  if (value.startsWith("claude") || value.includes("anthropic")) return "Claude";
  if (
    value.startsWith("gpt") ||
    value.startsWith("chatgpt") ||
    value.startsWith("openai") ||
    /^o[1-9](?:-|$)/.test(value)
  ) {
    return "GPT";
  }
  return null;
}

export function displayModel(model: string | null | undefined, provider?: string | null): string | null {
  const value = (model ?? "").trim();
  if (!value) return null;
  const prov = (provider ?? "").trim().toLowerCase();
  if (prov === "human" || isHuman(value.toLowerCase())) return null;
  if (prov === "anthropic") return "Claude";
  if (prov === "openai") return "GPT";
  return labelForModelId(value);
}

export function hideModelIds(text: string): string {
  return text
    .replace(CLAUDE_MODEL_ID, "Claude")
    .replace(GPT_MODEL_ID, "GPT")
    .replace(OPENAI_O_SERIES_ID, "GPT");
}
