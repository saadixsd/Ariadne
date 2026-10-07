/**
 * Structured human interventions (Add context / Challenge a claim / Correct /
 * Change direction). Formats land in the project brief or the knot note — never
 * a chat transcript. Keep markers stable so a later Phase can parse them.
 */
import { MAX_BRIEF_CHARS, MAX_NOTE_CHARS } from "@/lib/limits";

export type InterveneKind = "context" | "challenge" | "correct" | "direction";

export const INTERVENE_ACTIONS: {
  kind: InterveneKind;
  label: string;
  hint: string;
}[] = [
  {
    kind: "context",
    label: "Add context",
    hint: "Facts, constraints or sources every step should read.",
  },
  {
    kind: "challenge",
    label: "Challenge a claim",
    hint: "Raise a problem with the draft — your dispute, not a chat.",
  },
  {
    kind: "correct",
    label: "Correct something",
    hint: "A hard correction: wrong name, number, fact or wording.",
  },
  {
    kind: "direction",
    label: "Change direction",
    hint: "Rewrite the brief so the thread aims at a different answer.",
  },
];

const BRIEF_HEADINGS: Record<Exclude<InterveneKind, "direction">, string> = {
  context: "## Context you added",
  challenge: "## Your challenges",
  correct: "## Corrections",
};

export type ContextFields = { text: string };
export type ChallengeFields = { claim: string; issue: string };
export type CorrectFields = { was: string; shouldBe: string };

function todayStamp(now = new Date()): string {
  // Board clock is America/Toronto; ISO date is enough for a stable marker.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** One bullet destined for the project brief. */
export function formatBriefLine(
  kind: Exclude<InterveneKind, "direction">,
  fields: ContextFields | ChallengeFields | CorrectFields,
  now = new Date(),
): string {
  if (kind === "context") {
    const text = clean((fields as ContextFields).text);
    return `- (${todayStamp(now)}) ${text}`;
  }
  if (kind === "challenge") {
    const { claim, issue } = fields as ChallengeFields;
    return `- Claim: ${clean(claim)} — Issue: ${clean(issue)}`;
  }
  const { was, shouldBe } = fields as CorrectFields;
  return `- Was: ${clean(was)} — Should be: ${clean(shouldBe)}`;
}

/** One line destined for the knot note (Ask for changes path). */
export function formatNoteLine(
  kind: "challenge" | "correct",
  fields: ChallengeFields | CorrectFields,
): string {
  if (kind === "challenge") {
    const { claim, issue } = fields as ChallengeFields;
    return `Challenge I raise: ${clean(claim)} — ${clean(issue)}`;
  }
  const { was, shouldBe } = fields as CorrectFields;
  return `Correction: ${clean(was)} → ${clean(shouldBe)}`;
}

/**
 * Appends a structured bullet under the right ## heading in the brief.
 * Creates the heading if missing. Caps at MAX_BRIEF_CHARS (drops nothing already
 * there; refuses the append if the new block would not fit).
 */
export function appendInterventionToBrief(
  brief: string,
  kind: Exclude<InterveneKind, "direction">,
  line: string,
  max = MAX_BRIEF_CHARS,
): { ok: true; brief: string } | { ok: false; reason: string } {
  const heading = BRIEF_HEADINGS[kind];
  const trimmedLine = line.trim();
  if (!trimmedLine) return { ok: false, reason: "Write something first." };

  const base = brief.trimEnd();
  const block = `${trimmedLine}`;
  let next: string;
  const headingAt = base.indexOf(heading);
  if (headingAt >= 0) {
    // Insert after the heading line (and any existing bullets under it): append
    // at end of file is fine if we treat the section as open-ended; keep it simple —
    // add the bullet immediately after the heading line.
    const afterHeading = headingAt + heading.length;
    const before = base.slice(0, afterHeading);
    const after = base.slice(afterHeading);
    next = `${before}\n${block}${after.startsWith("\n") ? "" : "\n"}${after}`.trimEnd() + "\n";
  } else {
    next = `${base}${base ? "\n\n" : ""}${heading}\n${block}\n`;
  }

  if (next.length > max) {
    return { ok: false, reason: `Brief is full (${max} characters). Shorten it, then try again.` };
  }
  return { ok: true, brief: next };
}

/** Append a note line; respects MAX_NOTE_CHARS. */
export function appendInterventionToNote(
  note: string,
  line: string,
  max = MAX_NOTE_CHARS,
): { ok: true; note: string } | { ok: false; reason: string } {
  const trimmed = line.trim();
  if (!trimmed) return { ok: false, reason: "Write something first." };
  const next = note.trim().length === 0 ? trimmed : `${note.trimEnd()}\n${trimmed}`;
  if (next.length > max) {
    return { ok: false, reason: `Note is full (${max} characters).` };
  }
  return { ok: true, note: next };
}

/**
 * Where a kind should land.
 * - direction → brief drawer
 * - context → always the shared brief
 * - challenge/correct at the knot → knot note
 * - challenge/correct on a model step → that step's next run (then re-run)
 * - otherwise → brief
 */
export function interveneDestination(
  kind: InterveneKind,
  judging: boolean,
  hasModelStep = false,
): "brief" | "note" | "drawer" | "step" {
  if (kind === "direction") return "drawer";
  if (kind === "context") return "brief";
  if (judging) return "note";
  if (hasModelStep) return "step";
  return "brief";
}
