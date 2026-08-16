import { defaultLocale, type Locale } from "@/i18n/config";

// Resolver for the curriculum's localized names (migration 114). topics.name
// and subtopics.name stay the AZ source of truth; topic_translations /
// subtopic_translations carry EN and RU only (a DB CHECK forbids an `az` row),
// so reading in Azerbaijani simply finds no row and falls through to the base
// name — no special case here, and none needed at any call site.
//
// One implementation for every PostgREST embed, so no page grows its own inline
// picker that drifts (the olympiad and news pages each carried their own copy
// of the same three lines before this file existed).

export type NameTranslationRow = {
  locale?: string | null;
  name?: string | null;
};

/** Any `*_translations` embed: the rows carry a locale plus their own fields. */
export type TranslationRow = { locale?: string | null };

/**
 * The row for `locale`, falling back to the Azerbaijani row.
 *
 * For the tables that DO store `az` (news_translations,
 * olympiad_package_translations) this is the whole resolution. For the
 * curriculum tables — which store en/ru only — the az lookup finds nothing and
 * the caller falls back to the base column instead; that is what `pickName`
 * below does.
 */
export function pickTranslation<T extends TranslationRow>(
  rows: readonly T[] | null | undefined,
  locale: Locale,
): T | null {
  const list = rows ?? [];
  return (
    list.find((r) => r?.locale === locale) ??
    list.find((r) => r?.locale === defaultLocale) ??
    null
  );
}

/**
 * The name in `locale`, falling back to the row's own AZ `name`.
 *
 * Never returns an empty string for a non-empty fallback: a blank translation
 * is rejected by ck_*_name_not_blank in the database, but a legacy or partially
 * written row must still never render as an empty topic label.
 */
export function pickName(
  rows: readonly NameTranslationRow[] | null | undefined,
  locale: Locale,
  fallback: string,
): string {
  const hit = (rows ?? []).find((r) => r?.locale === locale);
  const name = typeof hit?.name === "string" ? hit.name.trim() : "";
  return name || fallback;
}
