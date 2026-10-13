/*
  Workflow outcomes per account for /admin/feedback. Pure helpers here; the D1 reads are in
  lib/admin.ts (workflowOutcomes). Definitions, shown on the page as well:
  - started: workflows opened (first model run on a project in a UTC day; lib/usage.ts);
  - challenged: projects where Daedalus (GPT) finished at least one Challenge run;
  - approved: projects whose deliverable the person approved;
  - abandoned: workflows still open 48 hours after they started, on an unapproved project;
  - run failures: failed model runs, grouped by error type.
*/
export const ABANDONED_AFTER_MS = 48 * 60 * 60 * 1000;

export type ErrorType = "timeout" | "rate_limit" | "quota" | "provider_5xx" | "auth" | "bad_output" | "network" | "other";

export function errorType(message: string | null | undefined): ErrorType {
  const m = (message ?? "").toLowerCase();
  if (/timed? ?out|timeout|deadline|aborted/.test(m)) return "timeout";
  if (/\b429\b|rate.?limit|too many requests|overloaded/.test(m)) return "rate_limit";
  if (/quota|insufficient|credit|billing|runs (it makes )?in a day|workflows/.test(m)) return "quota";
  if (/\b5\d\d\b|server error|bad gateway|unavailable/.test(m)) return "provider_5xx";
  if (/\b40[13]\b|api key|unauthori[sz]ed|forbidden/.test(m)) return "auth";
  if (/parse|empty (output|response)|invalid json|no text/.test(m)) return "bad_output";
  if (/fetch failed|network|econn|socket|dns/.test(m)) return "network";
  return "other";
}

export type Outcome = {
  userId: string;
  campaign: string | null;
  refCode: string | null;
  feedback: number;
  avgRating: number | null;
  projects: number;
  started: number;
  challenged: number;
  approved: number;
  abandoned: number;
  failures: Partial<Record<ErrorType, number>>;
  lastActive: string | null;
};
