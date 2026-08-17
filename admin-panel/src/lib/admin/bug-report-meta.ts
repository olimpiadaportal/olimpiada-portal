// Bug-report vocabulary (migration 116) — ONLY what is genuinely new.
//
// The four STATUSES are deliberately NOT redefined here: they are imported from
// question-report-status.ts, which now serves both report features. The two
// Postgres enums (question_report_status / bug_report_status) carry identical
// members on purpose, and sharing one TypeScript module is what keeps the two
// admin sections from drifting into different labels, filters and pill colours.
//
// A PLAIN module (no "use server"): Next.js allows only async function exports
// from a server-action file, so these constants cannot live in
// lib/admin/bugReports.ts alongside the action that uses them — the same reason
// question-report-status.ts exists.

/** public.bug_report_priority. Used for BOTH priority columns (see below). */
export const BUG_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type BugPriority = (typeof BUG_PRIORITIES)[number];

/**
 * public.report_reporter_role — DERIVED by trg_bug_report_derive from
 * profile_roles, never sent by a client. 'unknown' is the honest label for a
 * signed-in profile carrying no role row; it should be impossible, so it is
 * recorded rather than mislabelled as a student.
 */
export const REPORTER_ROLES = [
  "anonymous",
  "student",
  "parent",
  "content_manager",
  "administrator",
  "unknown",
] as const;
export type ReporterRole = (typeof REPORTER_ROLES)[number];

export function isBugPriority(v: string): v is BugPriority {
  return (BUG_PRIORITIES as readonly string[]).includes(v);
}

export function isReporterRole(v: string): v is ReporterRole {
  return (REPORTER_ROLES as readonly string[]).includes(v);
}

/**
 * Triage priority as a pill.
 *
 * 'critical' gets its own colour rather than sharing amber with 'high': the
 * whole point of the column is that an admin can tell those two apart while
 * scanning the list, and a worklist where the top two bands look identical is
 * the worklist nobody sorts by.
 */
export function bugPriorityPill(p: string): string {
  if (p === "critical") return "pill-danger";
  if (p === "high") return "pill-warn";
  if (p === "low") return "pill-ok";
  return "pill-muted"; // normal — the default every report is born with
}
