import type { Locale } from "@/i18n";

// Resolver for the curriculum's localized names (migration 114). topics.name
// and subtopics.name stay the AZ source of truth; topic_translations /
// subtopic_translations carry EN and RU only (a DB CHECK forbids an `az` row),
// so reading in Azerbaijani simply finds no row and falls through to the base
// name — no special case here, and none needed at any call site.
//
// KEEP IN SYNC with web-app/src/lib/localizedName.ts (same rule as
// topicStanding/helpers): mobile cannot import from web-app, only i18n crosses
// over through sync-i18n.

export type NameTranslationRow = {
  locale?: string | null;
  name?: string | null;
};

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
