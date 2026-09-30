/** When a long output folds behind "Read more", and what the button says. */
export const FOLD_MIN_CHARS = 1200;
export const FOLD_MIN_LINES = 18;

export function foldPlan(text: string): { fold: boolean; label: string } {
  const lines = text.split(/\n/).filter((line) => line.trim().length > 0).length;
  const fold = text.length > FOLD_MIN_CHARS || lines > FOLD_MIN_LINES;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 230));
  return { fold, label: `${words.toLocaleString("en-US")} words · ${minutes} min read` };
}
