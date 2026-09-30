/*
  Philosophy, quietly. One short Socratic question at each knot, and now and then a
  Delphic line in an empty state. Deterministic (hashed from an id), so the same
  knot always asks the same question and nothing flickers between polls.
*/

export const SOCRATIC_QUESTIONS = [
  "What would make this wrong?",
  "What is this assuming?",
  "Who is this for, and would they agree?",
  "What evidence would change your mind?",
  "Is this what the brief asked, or only near it?",
  "What would you cut, if you had to cut one thing?",
] as const;

export const DELPHIC_LINES = [
  "Know thyself.",
  "Nothing in excess.",
  "Know the right moment.",
  "Observe the limit.",
] as const;

function hash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) h = Math.imul(h ^ value.charCodeAt(index), 16777619);
  return h >>> 0;
}

/** The question for one knot. `round` moves it on after you ask for changes. */
export function socraticQuestion(taskId: string, round = 0): string {
  return SOCRATIC_QUESTIONS[(hash(taskId) + round) % SOCRATIC_QUESTIONS.length];
}

export function delphicLine(seed: string): string {
  return DELPHIC_LINES[hash(seed) % DELPHIC_LINES.length];
}
