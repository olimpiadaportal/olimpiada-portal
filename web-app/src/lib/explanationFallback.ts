import { defaultLocale, type Locale } from "@/i18n/config";

// HONEST EXPLANATION FALLBACK.
//
// get_test_review resolves an explanation as coalesce(<reader locale>, <az>)
// (011, the `qe` / `qe_az` joins). question_explanations is trilingual by shape
// but today holds az rows only — every question has az, none has en or ru — so
// an English or Russian reader is served Azerbaijani text. That is the
// documented fallback doing its job on absent content, NOT a retrieval bug; the
// bug is that it arrives unlabelled and reads like one.
//
// This is the pure half of the labelling: given the (question_id, locale) rows
// the caller could actually read, decide which questions are showing the az
// fallback. The impure half (the query) stays at the call site.

export type ExplanationLocaleRow = {
  question_id?: string | null;
  locale?: string | null;
};

/**
 * Of `candidates` (questions whose review payload carries an explanation), the
 * ones whose explanation is the Azerbaijani fallback rather than `locale`.
 *
 * `rows` must be the question_explanations rows for BOTH `az` and `locale`.
 * Requiring a visible az row is what keeps the label honest in the other
 * direction: RLS (qexpl_select) hides the explanations of an ARCHIVED question
 * from a student, and "no rows came back" must never be read as "no translation
 * exists" — that would stamp "Azerbaijani only" onto text that may well be
 * translated. When we cannot see the az row we say nothing.
 */
export function fallbackExplanationIds(
  rows: readonly ExplanationLocaleRow[] | null | undefined,
  locale: Locale,
  candidates: readonly string[],
): Set<string> {
  const out = new Set<string>();
  // Reading in Azerbaijani, the fallback and the requested text are the same
  // thing — there is nothing to disclose.
  if (locale === defaultLocale) return out;

  const haveAz = new Set<string>();
  const haveLocale = new Set<string>();
  for (const r of rows ?? []) {
    const id = typeof r?.question_id === "string" ? r.question_id : "";
    if (!id) continue;
    if (r.locale === defaultLocale) haveAz.add(id);
    else if (r.locale === locale) haveLocale.add(id);
  }

  for (const id of candidates) {
    if (haveAz.has(id) && !haveLocale.has(id)) out.add(id);
  }
  return out;
}
