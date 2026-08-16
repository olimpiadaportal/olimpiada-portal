// Question-report status vocabulary, shared by the list page (searchParam
// whitelist + stat cards), the detail page and the client status controls.
//
// A PLAIN module (no "use server"): Next.js allows only async function exports
// from a server-action file, so these constants cannot live in
// lib/admin/questionReports.ts alongside the action that uses them.

export const REPORT_STATUSES = ["new", "in_review", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Actions the UI may request, mapped to enum values SERVER-side in the action. */
export const REPORT_ACTIONS = ["in_review", "resolve", "dismiss", "reopen"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export function isReportStatus(v: string): v is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(v);
}

/** Same pill vocabulary as the news list: warn = needs attention, ok = done. */
export function reportStatusPill(s: string): string {
  if (s === "resolved") return "pill-ok";
  if (s === "new") return "pill-warn";
  return "pill-muted"; // in_review, dismissed
}
