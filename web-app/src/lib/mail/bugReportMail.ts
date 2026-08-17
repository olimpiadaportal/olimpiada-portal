import "server-only";

// The operator notification for a filed bug report (migration 116).
//
// LANGUAGE NOTE — deliberate, not an oversight: the labels below are
// Azerbaijani-only. This is an OPS email to our own inbox, not a user-facing
// UI surface, so the trilingual rule (which governs what a parent, child or
// administrator reads in the product) does not apply. Everything the REPORTER
// sees — the dialog, its errors, the admin panel — ships az/en/ru.
//
// The body is assembled from user-supplied free text and sent as PLAIN TEXT
// only. That is what makes it safe without an escaping pass: there is no
// markup to break out of, and a mail client cannot execute it.
import { sendTransactionalEmail } from "@/lib/mail/brevo";
import { formatLongDate } from "@/lib/formatDate";

const notifyList = (process.env.BUG_REPORT_NOTIFY_EMAIL ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// Server-only, and the ONLY source of the admin origin. Never built from a
// request header: a Host header is attacker-controlled, and this link is what
// an administrator clicks.
const adminPanelUrl = (process.env.ADMIN_PANEL_URL ?? "").trim().replace(/\/+$/, "");

const SUBJECT_PREFIX = "[OlympIQ Bug Report] ";
const SUBJECT_MAX = 200;
const DASH = "—";

export type BugReportNotification = {
  id: string;
  title: string;
  description: string;
  steps: string | null;
  expected: string | null;
  actual: string | null;
  severity: string;
  routePath: string | null;
  userAgent: string | null;
  locale: string;
  platform: string;
  appVersion: string | null;
  /** null for an anonymous reporter who left the field blank. */
  reporterEmail: string | null;
  /** false = a typed address from the public form, i.e. NOT an identity. */
  reporterEmailVerified: boolean;
  /** 'anonymous' | 'parent' | 'student' | … — derived by the DB trigger. */
  reporterRole: string;
};

function block(label: string, value: string | null): string {
  return `${label}:\n${value && value.trim() !== "" ? value : DASH}\n`;
}

/**
 * Notify the operators about one new report. Best effort by design.
 *
 * Returns nothing and throws nothing the caller must handle: the report is
 * already committed by the time this runs, and a provider outage must never
 * turn a saved report into a failed submission.
 */
export async function notifyBugReport(r: BugReportNotification): Promise<void> {
  if (notifyList.length === 0) {
    console.error("[bugreport] notification skipped", "not_configured");
    return;
  }

  const subject = (SUBJECT_PREFIX + r.title.replace(/[\r\n]+/g, " ")).slice(0, SUBJECT_MAX);

  // An anonymous reporter's address is whatever they typed. Marking it inline
  // is what stops an operator from reading it as a verified identity.
  const who =
    r.reporterEmail === null
      ? r.reporterRole
      : `${r.reporterRole} · ${r.reporterEmail}${r.reporterEmailVerified ? "" : " (təsdiqlənməyib)"}`;

  const lines = [
    `Status:      new`,
    `Prioritet:   normal   (bildirənin qiymətləndirməsi: ${r.severity})`,
    `Bildirən:    ${who}`,
    `Dil:         ${r.locale}        Platforma: ${r.platform}${
      r.appVersion ? ` (build ${r.appVersion})` : ""
    }`,
    `Səhifə:      ${r.routePath ?? DASH}`,
    `Brauzer:     ${r.userAgent ?? DASH}`,
    // Asia/Baku, the product's home timezone — the same helper every date in
    // the app renders through, so an operator reads one clock everywhere.
    `Tarix:       ${formatLongDate(new Date(), "az", true)}`,
    "",
    block("Başlıq", r.title),
    block("Təsvir", r.description),
    block("Addımlar", r.steps),
    block("Gözlənilən", r.expected),
    block("Baş verən", r.actual),
  ];

  // Omitted rather than emitted broken when the origin is unconfigured — a
  // dead link in an ops mail costs more than a missing one.
  if (adminPanelUrl) lines.push(`Admin paneldə aç: ${adminPanelUrl}/bug-reports/${r.id}`);
  lines.push(`Report id: ${r.id}`);

  const res = await sendTransactionalEmail({
    to: notifyList,
    subject,
    text: lines.join("\n"),
    // Reply goes to the reporter when we have an address — the whole point of
    // collecting one. Built from the row, never from anything else the client
    // sent alongside it.
    replyTo: r.reporterEmail ?? undefined,
  });

  if (!res.ok) {
    // The SHORT machine reason only. Never the provider payload, never the
    // report body: this is a log line, and the body is unvetted user text.
    console.error("[bugreport] notification failed", res.error);
  }
}
