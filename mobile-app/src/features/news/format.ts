// Locale-aware date formatting for news surfaces (web NewsBrowser /
// NewsArticleView parity: short month on cards, long month in the article).
import type { Locale } from "@/i18n";

const LOCALE_TAGS: Record<Locale, string> = {
  az: "az-AZ",
  en: "en-GB",
  ru: "ru-RU",
};

export function formatNewsDate(
  iso: string | null,
  locale: Locale,
  style: "short" | "long" = "short",
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(LOCALE_TAGS[locale] ?? locale, {
      year: "numeric",
      month: style === "long" ? "long" : "short",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
