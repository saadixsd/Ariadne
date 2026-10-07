/*
  Tie Off writeup sections. Pure and deterministic: no model call, nothing stored.
  The starter prompt asks Odysseus for Answer / Sources / Disagreements / Attention
  required; this parses those headings so the board can show four cards instead of
  a wall of prose. Missing headings fall back to the full text under Answer.
*/

export type FinalArtifact = {
  answer: string;
  sources: string | null;
  disagreements: string | null;
  attention: string | null;
  /** True when at least one of the four section headings was found. */
  structured: boolean;
  prose: string;
};

const HEADING =
  /^\s{0,3}#{1,6}\s*(answer|sources?|disagreements?|attention(?:\s+required)?)\s*$/i;
const BOLD_HEADING =
  /^\s*(?:\*\*|__)(answer|sources?|disagreements?|attention(?:\s+required)?)(?:\*\*|__)\s*:?\s*$/i;

function bucket(label: string): keyof Pick<FinalArtifact, "answer" | "sources" | "disagreements" | "attention"> {
  const key = label.toLowerCase();
  if (key.startsWith("source")) return "sources";
  if (key.startsWith("disagreement")) return "disagreements";
  if (key.startsWith("attention")) return "attention";
  return "answer";
}

export const MAX_ARTIFACT_CHARS = 60_000;

/**
 * Splits a tied-off writeup into Answer / Sources / Disagreements / Attention.
 * Unrecognised prose before the first heading becomes Answer when no Answer
 * heading exists.
 */
export function parseFinalArtifact(text: string | null | undefined): FinalArtifact {
  const prose = (text ?? "").replace(/\r\n?/g, "\n").trim();
  const empty: FinalArtifact = {
    answer: prose,
    sources: null,
    disagreements: null,
    attention: null,
    structured: false,
    prose,
  };
  if (!prose) return empty;

  const lines = prose.slice(0, MAX_ARTIFACT_CHARS).split("\n");
  const buckets: Record<"answer" | "sources" | "disagreements" | "attention", string[]> = {
    answer: [],
    sources: [],
    disagreements: [],
    attention: [],
  };
  let current: keyof typeof buckets | null = null;
  let found = false;
  const prelude: string[] = [];

  for (const line of lines) {
    const match = line.match(HEADING) ?? line.match(BOLD_HEADING);
    if (match) {
      found = true;
      current = bucket(match[1]);
      continue;
    }
    if (current) buckets[current].push(line);
    else prelude.push(line);
  }

  if (!found) return empty;

  const tidy = (rows: string[]) => rows.join("\n").trim() || null;
  const answer = tidy(buckets.answer) ?? tidy(prelude) ?? "";
  return {
    answer,
    sources: tidy(buckets.sources),
    disagreements: tidy(buckets.disagreements),
    attention: tidy(buckets.attention),
    structured: true,
    prose,
  };
}

const artifactCache = new Map<string, FinalArtifact>();

export function finalArtifactOf(text: string): FinalArtifact {
  const hit = artifactCache.get(text);
  if (hit) return hit;
  const value = parseFinalArtifact(text);
  if (artifactCache.size >= 8) artifactCache.delete(artifactCache.keys().next().value as string);
  artifactCache.set(text, value);
  return value;
}
