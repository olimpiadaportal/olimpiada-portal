// "Report a bug" (migration 116) — the field rules, in ONE place so the form
// inputs, the server core, the RPC guard and the column CHECKs cannot drift
// apart. Mirrors lib/reportMessage.ts, which does the same job for the
// question-report message.
//
// A PLAIN module on purpose: NO `import "server-only"`. The dialog is a client
// component and needs these caps for its `maxLength` attributes and character
// counters, so this file has to be importable from both sides. It therefore
// contains constants and pure functions ONLY — never a client, never a secret,
// never an env read.
//
// Each cap is enforced FOUR times: the input's `maxLength` (UX), the check
// here (the real server-side gate, because maxLength is attacker-removable),
// the guard inside submit_bug_report(), and the chk_bug_reports_* column
// constraint (the last word, so a direct insert is bound by the same number).

/**
 * Which contact surface opened the dialog.
 *
 * Lives here rather than next to the component because ContactInfo is a SERVER
 * component: every export of a `"use client"` module becomes a client
 * reference, so a value imported from one cannot be read on the server (a type
 * can, but keeping the pair together is what stops the next edit from moving
 * the wrong one).
 */
export type BugReportSurface = "public" | "parent" | "child";

/**
 * Every i18n key the dialog reads. ContactInfo resolves this list with getT()
 * and hands the result to the client component, which cannot call getT itself.
 */
export const BUG_DIALOG_KEYS = [
  "contact.bugCta",
  "bug.title",
  "bug.intro",
  "bug.f.title.label",
  "bug.f.title.ph",
  "bug.f.description.label",
  "bug.f.description.ph",
  "bug.f.steps.label",
  "bug.f.steps.ph",
  "bug.f.expected.label",
  "bug.f.expected.ph",
  "bug.f.actual.label",
  "bug.f.actual.ph",
  "bug.f.severity.label",
  "bug.sev.low",
  "bug.sev.normal",
  "bug.sev.high",
  "bug.sev.critical",
  "bug.f.email.label",
  "bug.f.email.ph",
  "bug.f.email.help",
  "bug.contextNote",
  "bug.remaining",
  "bug.cancel",
  "bug.submit",
  "bug.sending",
  "bug.close",
  "bug.successTitle",
  "bug.successBody",
  "bug.emptyErr",
  "bug.err.tooLong",
  "bug.err.tooMany",
  "bug.err.duplicate",
  "bug.err.generic",
] as const;

export const BUG_TITLE_MIN = 3;
export const BUG_TITLE_MAX = 160;
export const BUG_DESCRIPTION_MIN = 10;
export const BUG_DESCRIPTION_MAX = 4000;
export const BUG_STEPS_MAX = 2000;
export const BUG_EXPECTED_MAX = 1000;
export const BUG_ACTUAL_MAX = 1000;
export const BUG_EMAIL_MAX = 254;

/** The reporter's severity CLAIM. Never the admin's triage priority. */
export const BUG_SEVERITIES = ["low", "normal", "high", "critical"] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

export function isBugSeverity(v: unknown): v is BugSeverity {
  return typeof v === "string" && (BUG_SEVERITIES as readonly string[]).includes(v);
}

/** What the reporter types. Every other column on the row is server-derived. */
export type BugReportInput = {
  title: string;
  description: string;
  steps: string;
  expected: string;
  actual: string;
  severity: string;
  /** `window.location.pathname` — a path, never a full URL. */
  routePath: string;
  /** Signed-out reporters only; ignored for a resolved session. */
  contactEmail: string;
  /** Anti-bot honeypot; must arrive empty. */
  website: string;
};

export type BugFieldError =
  | "titleEmpty"
  | "titleTooLong"
  | "descriptionEmpty"
  | "descriptionTooLong"
  | "tooLong";

export type NormalizedBugReport =
  | {
      ok: true;
      value: {
        title: string;
        description: string;
        steps: string | null;
        expected: string | null;
        actual: string | null;
        severity: BugSeverity;
        contactEmail: string | null;
      };
    }
  | { ok: false; reason: BugFieldError };

function trim(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** Trim to null so an all-whitespace optional field is stored as NULL, not "". */
function trimToNull(raw: unknown): string | null {
  const v = trim(raw);
  return v === "" ? null : v;
}

/**
 * Trim and validate the whole report.
 *
 * Trimming happens BEFORE every check, so a title of nothing but spaces is
 * "empty" rather than a stored blank, and a body that only exceeds its cap
 * because of trailing newlines is accepted rather than refused. The SQL side
 * trims the same ASCII whitespace set (space, tab, CR, LF) — single-argument
 * `btrim()` would have stripped spaces only.
 *
 * Over-cap fields are REFUSED, never silently truncated: a report cut off
 * mid-sentence is worse than one the reporter is asked to shorten, because
 * nobody can tell afterwards that anything is missing.
 */
export function normalizeBugReport(input: Partial<BugReportInput>): NormalizedBugReport {
  const title = trim(input?.title);
  if (title.length < BUG_TITLE_MIN) return { ok: false, reason: "titleEmpty" };
  if (title.length > BUG_TITLE_MAX) return { ok: false, reason: "titleTooLong" };

  const description = trim(input?.description);
  if (description.length < BUG_DESCRIPTION_MIN) {
    return { ok: false, reason: "descriptionEmpty" };
  }
  if (description.length > BUG_DESCRIPTION_MAX) {
    return { ok: false, reason: "descriptionTooLong" };
  }

  const steps = trimToNull(input?.steps);
  const expected = trimToNull(input?.expected);
  const actual = trimToNull(input?.actual);
  if (
    (steps?.length ?? 0) > BUG_STEPS_MAX ||
    (expected?.length ?? 0) > BUG_EXPECTED_MAX ||
    (actual?.length ?? 0) > BUG_ACTUAL_MAX
  ) {
    return { ok: false, reason: "tooLong" };
  }

  // An unrecognised severity falls back to 'normal' rather than failing: it is
  // the reporter's opinion, and losing a report over a tampered <select> value
  // would trade something that matters for something that does not.
  const severity: BugSeverity = isBugSeverity(input?.severity) ? input.severity : "normal";

  // A malformed address is DROPPED, not rejected — same call. The report is
  // worth having even when we cannot write back about it. The DB CHECK is the
  // last word on shape; this only avoids a pointless round trip.
  const rawEmail = trim(input?.contactEmail);
  const contactEmail =
    rawEmail !== "" && rawEmail.length <= BUG_EMAIL_MAX && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)
      ? rawEmail
      : null;

  return {
    ok: true,
    value: { title, description, steps, expected, actual, severity, contactEmail },
  };
}
