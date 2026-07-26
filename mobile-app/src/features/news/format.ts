// Locale-aware date formatting for news surfaces (web NewsBrowser /
// NewsArticleView parity: short month on cards, long month in the article).
//
// Round 46: this delegates to the shared Hermes-safe helper. It used to build
// its own Intl.DateTimeFormat with an "az-AZ" tag and only a try/catch — but
// Hermes does NOT throw when Azerbaijani month data is missing, it silently
// returns the CLDR root pattern ("2026 M08 22"), so the catch never fired and
// the placeholder reached the UI.
import type { Locale } from "@/i18n";
import { formatLongDate, formatShortDate } from "@/lib/formatDate";

export function formatNewsDate(
  iso: string | null,
  locale: Locale,
  style: "short" | "long" = "short",
): string {
  if (!iso) return "";
  // formatLongDate returns "—" for unset/invalid input; news surfaces render
  // an empty meta slot instead.
  if (style === "long") {
    const out = formatLongDate(iso, locale);
    return out === "—" ? "" : out;
  }
  return formatShortDate(iso, locale);
}
