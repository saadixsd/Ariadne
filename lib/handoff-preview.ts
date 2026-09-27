export function previewChips(output: string, limit = 3): string[] {
  const lines = output
    .split(/\n+/)
    .map((line) => line.replace(/^[#>*\-\d.)\s]+/, "").trim())
    .filter((line) => line.length > 0);
  const parts = lines.length >= 2 ? lines : output.split(/(?<=[.!?])\s+/).map((part) => part.trim());
  return parts
    .filter((part) => part.length > 0)
    .slice(0, limit)
    .map((part) => (part.length > 90 ? `${part.slice(0, 87)}…` : part));
}

export function parseHandoffMessage(message: string): { from: string; title: string; to: string } | null {
  const match = message.match(/^Handoff: (.+) handed "(.+)" to (.+)$/);
  if (!match) return null;
  return { from: match[1], title: match[2], to: match[3] };
}
