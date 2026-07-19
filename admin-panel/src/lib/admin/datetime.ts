import type { Locale } from "@/i18n/config";

// -----------------------------------------------------------------------------
// Admin datetime convention (olympiad event date + sale window, and any future
// admin-entered schedule timestamp):
//
//   ENTRY   — <input type="datetime-local"> holds a WALL-CLOCK value in the
//             admin's BROWSER timezone (the team works in Asia/Baku, UTC+4).
//             The client converts it to a UTC ISO string with
//             `new Date(value).toISOString()` and submits that via a hidden
//             field (see DateTimeLocalField), so the server never guesses a
//             timezone from a bare wall-clock string.
//   STORAGE — PostgreSQL `timestamptz`, always UTC (parseIsoTimestamp below
//             re-normalizes whatever arrives into a canonical UTC ISO string).
//   DISPLAY — SERVER-rendered pages format the stored UTC instant back into
//             Azerbaijan wall-clock time with `formatBakuDateTime` (explicit
//             `timeZone: "Asia/Baku"`), so what the admin reads matches what
//             they typed regardless of the server's clock/timezone. Client
//             form inputs do the reverse of the entry step instead (ISO →
//             browser-local wall clock inside DateTimeLocalField).
// -----------------------------------------------------------------------------

// Sane bounds for admin-entered schedule timestamps: reject obvious typos
// (year 0206, 20260, …) that would otherwise be stored as "valid" absurd dates.
const TS_MIN = Date.parse("2020-01-01T00:00:00Z");
const TS_MAX = Date.parse("2100-01-01T00:00:00Z");

// Parses an ISO timestamp submitted via a form's hidden field into a canonical
// UTC ISO string. Returns:
//   null      — the field was empty (admin cleared the date → store NULL)
//   undefined — malformed or outside the sane bounds (caller shows an error)
//   string    — normalized UTC ISO ready for a timestamptz column
export function parseIsoTimestamp(raw: string): string | null | undefined {
  if (raw === "") return null;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts) || ts < TS_MIN || ts > TS_MAX) return undefined;
  return new Date(ts).toISOString();
}

// Formats a stored UTC timestamptz for owner-facing admin pages: Azerbaijan
// wall-clock time (Asia/Baku), localized month names. Returns "" on bad input.
// Same Intl pattern as the giveaway window on /settings.
export function formatBakuDateTime(
  iso: string | null | undefined,
  locale: Locale,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baku",
  }).format(d);
}
