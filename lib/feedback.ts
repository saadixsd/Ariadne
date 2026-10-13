/*
  Feedback input, validated in one place. Two shapes share the Feedback table:
  - the original quick note: kind bug | idea | confusing + message
  - the structured answer (popup after the first approved deliverable, or /feedback):
    kind "rating", rating 1–5, and three optional short answers.
  Feedback older than FEEDBACK_RETENTION_DAYS is anonymised (lib/feedback-retention via
  the admin page): the person and project links are dropped, the words are kept.
*/

export const FEEDBACK_KINDS = ["bug", "idea", "confusing", "rating"] as const;
export const MAX_FEEDBACK_FIELD_CHARS = 2_000;
export const MAX_FEEDBACK_MESSAGE_CHARS = 4_000;
export const FEEDBACK_RETENTION_DAYS = 365;
export const TRIAGE = ["new", "bug", "ux", "accuracy", "feature", "noise", "done"] as const;

export type FeedbackInput = {
  kind: (typeof FEEDBACK_KINDS)[number];
  message: string;
  rating: number | null;
  worked: string | null;
  wrong: string | null;
  changeFirst: string | null;
  projectId: string | null;
  allowProjectView: boolean;
  source: "popup" | "page" | "header";
};

function text(value: unknown, label: string, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new Error(`${label} is too long`);
  return trimmed;
}

/** Throws Error with a user-facing message; returns clean input otherwise. */
export function parseFeedback(body: Record<string, unknown> | null): FeedbackInput {
  if (!body) throw new Error("Expected a JSON body");
  const kind = (typeof body.kind === "string" ? body.kind : "rating") as FeedbackInput["kind"];
  if (!FEEDBACK_KINDS.includes(kind)) throw new Error("Kind must be bug, idea, confusing, or rating");
  const message = text(body.message, "Message", MAX_FEEDBACK_MESSAGE_CHARS) ?? "";
  let rating: number | null = null;
  if (body.rating !== undefined && body.rating !== null) {
    if (typeof body.rating !== "number" || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      throw new Error("Rating must be a whole number from 1 to 5");
    }
    rating = body.rating;
  }
  const worked = text(body.worked, "What worked", MAX_FEEDBACK_FIELD_CHARS);
  const wrong = text(body.wrong, "What was wrong", MAX_FEEDBACK_FIELD_CHARS);
  const changeFirst = text(body.changeFirst, "What to change first", MAX_FEEDBACK_FIELD_CHARS);
  if (kind === "rating") {
    if (rating === null && !worked && !wrong && !changeFirst && !message) {
      throw new Error("Pick a rating or write something first");
    }
  } else if (!message) {
    throw new Error("Message is required");
  }
  const projectId = typeof body.projectId === "string" && body.projectId.length <= 64 ? body.projectId : null;
  const source = body.source === "popup" || body.source === "page" ? body.source : "header";
  return {
    kind,
    message,
    rating,
    worked,
    wrong,
    changeFirst,
    projectId,
    allowProjectView: projectId !== null && body.allowProjectView === true,
    source,
  };
}

/** Should the opt-in "Want to share feedback?" prompt show? Once per account, after an approved deliverable. It never opens the form by itself. */
export function shouldPromptFeedback(user: { feedbackPromptAt: Date | string | null }, approvedAt: Date | string | null) {
  return Boolean(approvedAt) && !user.feedbackPromptAt;
}
