/*
  Uploaded sources: text extracted in the browser (lib/ingest-client.ts). The original file
  never reaches the server and is not kept. Reading a file is not checking it: the text
  goes into every step's shared context, and Daedalus can challenge claims against it.
*/
export const MAX_SOURCE_FILES = 5;
export const MAX_SOURCE_CHARS = 40_000;
export const MAX_SOURCES_TOTAL_CHARS = 80_000;
export const MAX_SOURCE_NAME_CHARS = 160;

export type SourceInput = { name: string; mime: string | null; bytes: number | null; text: string };

export function parseSources(value: unknown, existingChars = 0, existingCount = 0): SourceInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("Sources must be a list");
  if (value.length + existingCount > MAX_SOURCE_FILES) throw new Error(`Up to ${MAX_SOURCE_FILES} files per project`);
  let total = existingChars;
  return value.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, MAX_SOURCE_NAME_CHARS) : "";
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!name) throw new Error("Each file needs a name");
    if (!text) throw new Error(`No text was read from ${name}`);
    if (text.length > MAX_SOURCE_CHARS) throw new Error(`${name} is too long (over ${MAX_SOURCE_CHARS.toLocaleString("en-US")} characters)`);
    total += text.length;
    if (total > MAX_SOURCES_TOTAL_CHARS) throw new Error(`Files together are over ${MAX_SOURCES_TOTAL_CHARS.toLocaleString("en-US")} characters`);
    const mime = typeof item.mime === "string" ? item.mime.slice(0, 100) : null;
    const bytes = typeof item.bytes === "number" && Number.isFinite(item.bytes) ? Math.round(item.bytes) : null;
    return { name, mime, bytes, text };
  });
}

/** The shared context a step sees: the brief, then each source's text, clearly labelled. */
export function briefWithSources(brief: string, sources: { name: string; text: string }[]): string {
  if (sources.length === 0) return brief;
  const blocks = sources.map((s) => `### Source: ${s.name}\n${s.text}`);
  return `${brief}\n\n## Sources the user added (text extracted from their files; not checked)\n\n${blocks.join("\n\n")}`;
}

/** No-model summary for the left panel: words and the opening lines. */
export function sourceDigest(text: string): { words: number; opening: string } {
  // A char loop, not split(): no big array per request (Worker CPU on large files).
  let words = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const space = text.charCodeAt(i) <= 32;
    if (!space && !inWord) words++;
    inWord = !space;
  }
  const opening = text.slice(0, 2000).replace(/\s+/g, " ").trim().slice(0, 240);
  return { words, opening };
}
