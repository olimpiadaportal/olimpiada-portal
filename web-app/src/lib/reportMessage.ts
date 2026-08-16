// "Report a problem" — the message rule, in one place so the textarea, the
// server action and the SQL cap cannot drift apart.
//
// The 1000-character limit is enforced FOUR times on purpose: `maxLength` on
// the textarea (UX), the counter next to it (UX), the check here (the real
// server-side gate), and `chk_question_reports_message` in the database (the
// last word, so a direct PostgREST insert is bound by the same number).

export const REPORT_MESSAGE_MAX = 1000;

export type NormalizedReportMessage =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "tooLong" };

/**
 * Trim and validate a report body.
 *
 * Trimming happens BEFORE both checks, so a message of nothing but spaces or
 * newlines is "empty" rather than a stored blank row, and a body that is only
 * over the cap because of trailing whitespace is accepted rather than refused.
 * The SQL side trims the same ASCII whitespace set (space, tab, CR, LF) —
 * single-argument `btrim()` would have stripped spaces only.
 */
export function normalizeReportMessage(raw: unknown): NormalizedReportMessage {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") return { ok: false, reason: "empty" };
  if (value.length > REPORT_MESSAGE_MAX) return { ok: false, reason: "tooLong" };
  return { ok: true, value };
}
