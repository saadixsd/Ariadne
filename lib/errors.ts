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
    return Response.json(
      { error: error.message, ...(error.details ?? {}) },
      { status: error.status },
    );
  }
  console.error(error);
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Provider request failed";
  return raw.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
}
