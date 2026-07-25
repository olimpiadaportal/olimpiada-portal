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

const BAKU_OFFSET_MS = 4 * 3_600_000;

const pad2 = (n: number) => String(n).padStart(2, "0");

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
