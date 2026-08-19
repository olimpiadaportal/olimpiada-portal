// The reply an administrator sends a student when their question report is
// resolved or dismissed (migration 122).
//
// THIS FILE IS A PORT, NOT A SOURCE. The message is assembled by the DATABASE —
// public.question_report_reply_text(), called by
// trg_notify_question_report_status — because the transition is what notifies,
// and a notifier that lives in one client is a notifier every other write path
// silently skips. What lives here is the same assembly rule in TypeScript, and
// it exists for exactly one reason: the composer shows the admin a LIVE PREVIEW
// of the finished message while they type, and a preview cannot be fetched per
// keystroke.
//
// A preview that disagreed with the send would be worse than no preview at all —
// the admin would approve one message and the student would read another. So the
// two copies are pinned to each other by __tests__/question-report-reply.test.ts,
// which reads the SQL (the migration AND the canonical 011 backport) and asserts
// every literal, the blank-line joins, the Asia/Baku formats and the locale
// fallback against the constants below. Change one side and that test fails.
//
// PLAIN module (no "use server"): imported by a client component for the
// preview and by the server action for validation.

/** Trimmed length bounds. Mirrored by chk_question_reports_resolution_message. */
export const REPLY_MIN_LENGTH = 10;
export const REPLY_MAX_LENGTH = 1000;

export type ReportLocale = "az" | "en" | "ru";

const REPORT_LOCALES: readonly ReportLocale[] = ["az", "en", "ru"];

/**
 * The language of the REPORT, not of the admin's interface — question_reports.
 * locale, i.e. the UI the student was reading when they filed. Anything else
 * falls back to az, matching the SQL's `case when p_locale in ('en','ru')`.
 */
export function normalizeReportLocale(raw: unknown): ReportLocale {
  return typeof raw === "string" && (REPORT_LOCALES as readonly string[]).includes(raw)
    ? (raw as ReportLocale)
    : "az";
}

/**
 * The SQL side trims with `btrim(body, ' ' || chr(9) || chr(10) || chr(13))`.
 * String.prototype.trim() removes a wider set (every Unicode space, plus \v and
 * \f), which would let a body pass validation here at a length the database
 * measures differently. Same four characters, same result.
 */
export function trimReplyBody(raw: string): string {
  return raw.replace(/^[ \t\n\r]+/, "").replace(/[ \t\n\r]+$/, "");
}

/**
 * Opening line. `{date}` and `{time}` are the moment the report was FILED
 * (question_reports.created_at), in Asia/Baku.
 */
export const REPLY_OPENING: Record<ReportLocale, string> = {
  az: "{date} tarixində saat {time}-də ünvanladığınız sorğu araşdırılmışdır.",
  en: "Your report submitted on {date} at {time} has been reviewed.",
  ru: "Ваше обращение, направленное {date} в {time}, было рассмотрено.",
};

/** Closing line. No placeholders. */
export const REPLY_CLOSING: Record<ReportLocale, string> = {
  az: "Diqqətiniz və anlayışınız üçün təşəkkür edirik.",
  en: "Thank you for your attention and understanding.",
  ru: "Благодарим за внимание и понимание.",
};

/** The three parts are joined by BLANK lines, so a paragraph break each way. */
export const REPLY_JOIN = "\n\n";

// Azerbaijan is UTC+4 year-round (DST was abolished in 2016), so the offset is
// arithmetic rather than an Intl lookup: deterministic on every runtime, in
// every server timezone, and identical to what `at time zone 'Asia/Baku'`
// returns for any instant this platform will ever stamp. lib/admin/datetime.ts
// makes the same call for its own fallback path.
const BAKU_OFFSET_MS = 4 * 3_600_000;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * `dd.MM.yyyy` + `HH:mm` at Baku wall-clock time — the SQL's 'DD.MM.YYYY' and
 * 'HH24:MI'. null when the timestamp cannot be parsed.
 */
export function bakuFilingStamp(
  value: string | number | Date | null | undefined,
): { date: string; time: string } | null {
  if (value === null || value === undefined || value === "") return null;
  const ts =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  const d = new Date(ts + BAKU_OFFSET_MS);
  return {
    date: `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`,
    time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
  };
}

/** The opening line alone — the composer renders it as read-only text. */
export function reportReplyOpening(
  locale: ReportLocale,
  createdAt: string | number | Date | null | undefined,
): string | null {
  const stamp = bakuFilingStamp(createdAt);
  if (!stamp) return null;
  // split/join, never String.replace with a literal: a replacement string
  // containing "$" is re-interpreted by replace() ($&, $1, $$ …). Neither the
  // date nor the time can contain one today, and that is not a reason to leave
  // the sharp edge in place.
  return REPLY_OPENING[locale].split("{date}").join(stamp.date).split("{time}").join(stamp.time);
}

/** The closing line alone. */
export function reportReplyClosing(locale: ReportLocale): string {
  return REPLY_CLOSING[locale];
}

/**
 * The whole message exactly as the student receives it: opening, blank line,
 * the admin's body, blank line, closing. null when created_at is unusable —
 * the caller shows no preview rather than a wrong one.
 */
export function buildReportReply(input: {
  locale: ReportLocale;
  createdAt: string | number | Date | null | undefined;
  body: string;
}): string | null {
  const opening = reportReplyOpening(input.locale, input.createdAt);
  if (opening === null) return null;
  return [opening, trimReplyBody(input.body), reportReplyClosing(input.locale)].join(
    REPLY_JOIN,
  );
}

/**
 * Length in CODE POINTS, which is what the database counts.
 *
 * JS `.length` counts UTF-16 code units, so anything outside the BMP — an
 * emoji, a rarely-used CJK glyph — counts twice in the browser and once in
 * `char_length()`. A six-emoji reply reads as 12 to the button and 6 to
 * chk_question_reports_resolution_message: the composer says send, the server
 * agrees, and the DB rejects it as the opaque generic failure. Counting the
 * same units on both sides is the only way the three gates can agree.
 */
export function replyLength(body: string): number {
  return [...body].length;
}

export type ReplyValidation =
  | { ok: true; body: string }
  | { ok: false; reason: "too_short" | "too_long" };

/**
 * The one validator, used by the composer (to keep the button disabled and
 * explain why) and by the server action (where it is the real gate — the
 * browser's copy is UX). The database holds the same bounds a third time, in
 * chk_question_reports_resolution_message.
 */
export function validateReplyBody(raw: unknown): ReplyValidation {
  const body = trimReplyBody(typeof raw === "string" ? raw : "");
  const n = replyLength(body);
  if (n < REPLY_MIN_LENGTH) return { ok: false, reason: "too_short" };
  if (n > REPLY_MAX_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true, body };
}

/**
 * Result of the reply composer's submit — returned by the server action
 * (lib/admin/questionReports.ts → replyQuestionReport) and rendered by the
 * dialog. It lives HERE, not there, for two reasons: a "use server" module may
 * only export async functions, and the dialog needs the shape without pulling
 * the action's module graph. Same split as lib/admin/deletion-hints.ts.
 *
 * The error is a stable CODE, never a sentence and never a Postgres message:
 * the dialog already holds the three translations it needs, and the server has
 * no business deciding which language an admin reads (nor leaking
 * `error.message` to a browser).
 */
export type ReportReplyState =
  | { ok: true }
  | { ok: false; error: "too_short" | "too_long" | "already" | "failed" }
  | null;
