// Hermes-safe long-date formatting (Round 42). Hermes ships a partial ICU
// without Azerbaijani month names, so Intl.DateTimeFormat renders the raw
// pattern placeholder on device ("2026 M08 6"). formatLongDate prefers the
// real Intl output and falls back to MANUAL month names whenever the ICU
// placeholder leaks through (/M\d\d/) or Intl itself throws. This helper is
// the ONLY place month names may be mapped by hand — UI components must call
// it (directly or via commerce.fmtDate/fmtBakuDate), never map months
// themselves. Dates render in the product's home timezone: Asia/Baku, fixed
// UTC+4 year-round (no DST) — the fallback simply shifts the UTC timestamp
// by +4h and reads UTC fields (no library).
import type { Locale } from "@/i18n";

const INTL_TAGS: Record<Locale, string> = {
  az: "az-Latn-AZ",
  en: "en-GB",
  ru: "ru-RU",
};

// ru month names are GENITIVE (used after a day number: "6 августа").
const MONTHS: Record<Locale, string[]> = {
  az: [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avqust",
    "sentyabr",
    "oktyabr",
    "noyabr",
    "dekabr",
  ],
  ru: [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

const MONTHS_SHORT: Record<Locale, string[]> = {
  az: ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"],
  ru: ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const BAKU_OFFSET_MS = 4 * 3_600_000;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The placeholder ICU leaks when the resolved locale has no month data. */
const ICU_MONTH_PLACEHOLDER = /M\d\d/;

/** Baku-shifted parts, read via UTC getters (fixed +4, no DST). */
function bakuParts(ts: number) {
  const d = new Date(ts + BAKU_OFFSET_MS);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}

/** Intl attempt that REJECTS root-locale output instead of trusting it. */
function intlFormat(
  ts: number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): string | null {
  try {
    const out = new Intl.DateTimeFormat(INTL_TAGS[locale] ?? locale, {
      timeZone: "Asia/Baku",
      ...options,
    }).format(new Date(ts));
    return out && !ICU_MONTH_PLACEHOLDER.test(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * "6 avqust 2026" / "6 августа 2026" / "6 August 2026" (+ time when asked)
 * in Asia/Baku. Null/invalid input → "—" (commerce.fmtDate parity).
 */
export function formatLongDate(
  iso: string | null | undefined,
  locale: Locale,
  withTime = false,
): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";

  try {
    const out = new Intl.DateTimeFormat(INTL_TAGS[locale] ?? locale, {
      timeZone: "Asia/Baku",
      day: "numeric",
      month: "long",
      year: "numeric",
      ...(withTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
    }).format(new Date(ts));
    // "M08"-style output = ICU month data missing (Hermes az) → fall back.
    if (out && !/M\d\d/.test(out)) return out;
  } catch {
    // Missing locale/timezone data → manual fallback below.
  }

  // Manual fallback: shift into Baku (fixed UTC+4) and read UTC fields.
  const d = new Date(ts + BAKU_OFFSET_MS);
  const month = (MONTHS[locale] ?? MONTHS.en)[d.getUTCMonth()];
  const date = `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  return withTime ? `${date} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}` : date;
}

/**
 * Compact date for dense lists (news cards): "6 avq 2026" / "6 авг. 2026" /
 * "6 Aug 2026". Null/invalid → "" (news surfaces render nothing, not a dash).
 */
export function formatShortDate(
  iso: string | null | undefined,
  locale: Locale,
): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";

  const viaIntl = intlFormat(ts, locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (viaIntl) return viaIntl;

  const p = bakuParts(ts);
  return `${p.day} ${(MONTHS_SHORT[locale] ?? MONTHS_SHORT.en)[p.month]} ${p.year}`;
}

/**
 * Day + long month, with the year only when it differs from the current one —
 * the notification-inbox section heading ("6 avqust" / "6 avqust 2025").
 * Null/invalid → "".
 */
export function formatDayMonth(
  iso: string | null | undefined,
  locale: Locale,
  withYear: boolean,
): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";

  const viaIntl = intlFormat(ts, locale, {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
  if (viaIntl) return viaIntl;

  const p = bakuParts(ts);
  const base = `${p.day} ${(MONTHS[locale] ?? MONTHS.en)[p.month]}`;
  return withYear ? `${base} ${p.year}` : base;
}
