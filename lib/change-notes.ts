import { MAX_ACCUMULATED_INSTRUCTIONS_CHARS } from "@/lib/limits";

// Request-changes records the human note inside the task instructions so the next
// run's prompt includes it. This is Ariadne's own storage format (server-side),
// not UI parsing of event text.
export const CHANGE_MARKER = "Human requested changes:";
const SEPARATOR = `\n\n${CHANGE_MARKER} `;

export function latestChangeNote(instructions: string): string | null {
  const index = instructions.lastIndexOf(CHANGE_MARKER);
  if (index < 0) return null;
  const note = instructions.slice(index + CHANGE_MARKER.length).trim();
  return note.length > 0 ? note : null;
}

/**
 * Appends a change note to instructions without letting them grow forever.
 * When the result would pass `max`, the OLDEST notes are dropped first. The newest
 * note is always kept. Dropped notes are not lost: each one is stored on its
 * "changes requested" event payload and in the prompt of the TaskRun that used it.
 */
export function appendChangeNote(
  instructions: string,
  note: string,
  max = MAX_ACCUMULATED_INSTRUCTIONS_CHARS,
): string {
  const parts = instructions.split(SEPARATOR);
  let base = parts[0] ?? "";
  const notes = [...parts.slice(1), note];
  const join = () => [base, ...notes].join(SEPARATOR);
  let result = join();
  while (result.length > max && notes.length > 1) {
    notes.shift();
    result = join();
  }
  if (result.length > max) {
    // Only a legacy task whose base instructions are already near the cap gets here.
    const room = Math.max(0, max - (SEPARATOR.length + note.length));
    base = base.slice(0, room);
    result = join();
  }
  return result;
}
