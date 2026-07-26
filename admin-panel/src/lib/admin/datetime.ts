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

// -----------------------------------------------------------------------------
// Hardened display formatting — the "2026 M08 22" bug (CLDR root fallback):
//
//   Intl.DateTimeFormat("az", …) with a BARE language tag resolves to the CLDR
//   ROOT locale on any runtime whose ICU build ships without Azerbaijani date
//   data, and root renders a month as its raw pattern placeholder ("M08").
//   Mirror of web-app/src/lib/formatDate.ts (kept separate — no cross-app
//   imports): full BCP-47 tags, detect a leaked /M\d\d/ placeholder in the
//   formatter output, and fall back to hand-mapped month names computed from
//   the fixed Asia/Baku offset (UTC+4, no DST).
//
// This module is the ONLY place in the admin panel that may construct
// Intl.DateTimeFormat or map month names by hand — components call
// formatBakuDateTime / formatBakuDate instead.
// -----------------------------------------------------------------------------

/** Full BCP-47 tags. The bare "az" tag is precisely what produces "M08". */
const INTL_TAGS: Record<Locale, string> = {
  az: "az-Latn-AZ",
  en: "en-GB",
  ru: "ru-RU",
};

// Abbreviated month names for the manual fallback (matches dateStyle:"medium").
// ru forms are the ones used after a day number ("22 авг.").
const MONTHS_SHORT: Record<Locale, string[]> = {
  az: ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"],
  ru: ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const BAKU_OFFSET_MS = 4 * 3_600_000;

/** Placeholder that leaks when the resolved locale has no month data. */
const ICU_MONTH_PLACEHOLDER = /M\d\d/;

const pad2 = (n: number) => String(n).padStart(2, "0");

function tagFor(locale: string): string {
  return (INTL_TAGS as Record<string, string>)[locale] ?? INTL_TAGS.az;
}

function monthsFor(locale: string): string[] {
  return (MONTHS_SHORT as Record<string, string[]>)[locale] ?? MONTHS_SHORT.az;
}

/** Millisecond timestamp for any accepted input shape, or null when invalid. */
function parseTs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const ts =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

/** Baku-shifted date parts, read via UTC getters (fixed +4, no DST). */
function bakuParts(ts: number) {
  const d = new Date(ts + BAKU_OFFSET_MS);
  return {
    day: d.getUTCDate(),
    month: d.getUTCMonth(),
    year: d.getUTCFullYear(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

// Intl attempt: full tag + pinned zone; null when the runtime throws (missing
// locale/tz data) or leaks the root-locale month placeholder ("2026 M08 22").
function intlFormat(
  ts: number,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string | null {
  try {
    const out = new Intl.DateTimeFormat(tagFor(locale), {
      timeZone: "Asia/Baku",
      ...options,
    }).format(new Date(ts));
    return out && !ICU_MONTH_PLACEHOLDER.test(out) ? out : null;
  } catch {
    return null;
  }
}

// Formats a stored UTC timestamptz for owner-facing admin pages: Azerbaijan
// wall-clock time (Asia/Baku), localized month names, date + time.
// Returns "" on bad input (existing contract — callers render it as-is).
export function formatBakuDateTime(
  iso: string | number | Date | null | undefined,
  locale: Locale | string,
): string {
  const ts = parseTs(iso);
  if (ts === null) return "";

  const viaIntl = intlFormat(ts, locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (viaIntl) return viaIntl;

  const p = bakuParts(ts);
  return `${p.day} ${monthsFor(locale)[p.month]} ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)}`;
}

// Date-only variant (no time) for list columns where the clock is noise.
// Same hardening + Asia/Baku pinning; "" on bad input.
export function formatBakuDate(
  iso: string | number | Date | null | undefined,
  locale: Locale | string,
): string {
  const ts = parseTs(iso);
  if (ts === null) return "";

  const viaIntl = intlFormat(ts, locale, { dateStyle: "medium" });
  if (viaIntl) return viaIntl;

  const p = bakuParts(ts);
  return `${p.day} ${monthsFor(locale)[p.month]} ${p.year}`;
}
