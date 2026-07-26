// Shared date formatting for the web app (Round 46) — the single place any
// user-visible date is rendered. Mirrors mobile-app/src/lib/formatDate.ts so
// the two platforms can never drift.
//
// WHY THIS EXISTS — the "2026 M08 22" bug:
//   Intl.DateTimeFormat("az", { month: "long" }) resolves to the CLDR ROOT
//   locale on any runtime that ships without Azerbaijani date data, and root
//   renders a month as its raw pattern placeholder — "M08". The bare "az" tag
//   is the trigger; a full BCP-47 tag ("az-Latn-AZ") resolves correctly on
//   runtimes that DO have the data. Because we cannot guarantee the ICU build
//   of every browser and of the Node/Vercel runtime that server-renders the
//   first paint, the tag alone is not enough: we detect the leaked placeholder
//   (/M\d\d/) and fall back to hand-mapped month names.
//
// This module is the ONLY place month names may be mapped by hand. Components
// must call these helpers rather than constructing Intl.DateTimeFormat.
//
// All dates render in the product's home timezone, Asia/Baku (fixed UTC+4,
// no DST) — so a renewal date never shifts because the reader is travelling.
import type { Locale } from "@/i18n/config";

/** Full BCP-47 tags. The bare "az" tag is precisely what produces "M08". */
const INTL_TAGS: Record<Locale, string> = {
  az: "az-Latn-AZ",
  en: "en-GB",
  ru: "ru-RU",
};

// ru month names are GENITIVE — the form used after a day number
// ("22 августа"), not the nominative "август".
const MONTHS_LONG: Record<Locale, string[]> = {
  az: [
    "yanvar", "fevral", "mart", "aprel", "may", "iyun",
    "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr",
  ],
  ru: [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

const MONTHS_SHORT: Record<Locale, string[]> = {
  az: ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"],
  ru: ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const BAKU_OFFSET_MS = 4 * 3_600_000;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Placeholder that leaks when the resolved locale has no month data. */
const ICU_MONTH_PLACEHOLDER = /M\d\d/;

function tagFor(locale: Locale): string {
  return INTL_TAGS[locale] ?? INTL_TAGS.en;
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

function parse(iso: string | number | Date | null | undefined): number | null {
  if (iso === null || iso === undefined || iso === "") return null;
  const ts = iso instanceof Date ? iso.getTime() : typeof iso === "number" ? iso : Date.parse(iso);
  return Number.isFinite(ts) ? ts : null;
}

function intlFormat(
  ts: number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
): string | null {
  try {
    const out = new Intl.DateTimeFormat(tagFor(locale), {
      timeZone: "Asia/Baku",
      ...options,
    }).format(new Date(ts));
    // Reject root-locale output ("2026 M08 22") and fall back to hand-mapped
    // month names below.
    return out && !ICU_MONTH_PLACEHOLDER.test(out) ? out : null;
  } catch {
    // Missing locale or timezone data in this runtime's ICU build.
    return null;
  }
}

/**
 * Long, human date in Asia/Baku: "22 avqust 2026" / "22 августа 2026" /
 * "22 August 2026". Pass `withTime` for "… 14:30". Null/invalid → "—".
 */
export function formatLongDate(
  iso: string | number | Date | null | undefined,
  locale: Locale,
  withTime = false,
): string {
  const ts = parse(iso);
  if (ts === null) return "—";

  const viaIntl = intlFormat(ts, locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  });
  if (viaIntl) return viaIntl;

  const p = bakuParts(ts);
  const month = (MONTHS_LONG[locale] ?? MONTHS_LONG.en)[p.month];
  const date = `${p.day} ${month} ${p.year}`;
  return withTime ? `${date} ${pad2(p.hour)}:${pad2(p.minute)}` : date;
}

/**
 * Compact date for dense lists (news cards): "22 avq 2026" / "22 авг. 2026" /
 * "22 Aug 2026". Null/invalid → "—".
 */
export function formatShortDate(
  iso: string | number | Date | null | undefined,
  locale: Locale,
): string {
  const ts = parse(iso);
  if (ts === null) return "—";

  const viaIntl = intlFormat(ts, locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (viaIntl) return viaIntl;

  const p = bakuParts(ts);
  const month = (MONTHS_SHORT[locale] ?? MONTHS_SHORT.en)[p.month];
  return `${p.day} ${month} ${p.year}`;
}

/**
 * All-numeric date, identical in every locale: "22.08.2026". Used where a date
 * sits inline in dense UI and month names would wrap.
 */
export function formatNumericDate(
  iso: string | number | Date | null | undefined,
): string {
  const ts = parse(iso);
  if (ts === null) return "—";
  const p = bakuParts(ts);
  return `${pad2(p.day)}.${pad2(p.month + 1)}.${p.year}`;
}
