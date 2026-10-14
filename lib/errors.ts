export class TaskRunError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "TaskRunError";
    this.status = status;
    this.details = details;
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof TaskRunError) {
    const retryAfter = error.details?.retryAfterSeconds;
    return Response.json(
      { error: error.message, ...(error.details ?? {}) },
      {
        status: error.status,
        headers: typeof retryAfter === "number" ? { "Retry-After": String(retryAfter) } : undefined,
      },
    );
  }
  console.error(error);
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Provider request failed";
  // Shown in the workspace: keys redacted, no model or vendor names.
  return raw
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\b(anthropic|openai|claude|chatgpt|gemini)(-[\w.-]+)?\b|\bgpt-?[\w.-]*/gi, "the AI service")
    .slice(0, 500);
}
