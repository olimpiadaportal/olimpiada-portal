// ONE reusable, locale-aware subject label resolver.
//
// -----------------------------------------------------------------------------
// THE BUG THIS SHAPE EXISTS TO FIX (2026-09-10, migration 171)
// -----------------------------------------------------------------------------
// This function used to resolve a label as `subj.<code>` from the shipped i18n
// catalog, falling back to the DB `subjects.name` only for an UNKNOWN code. The
// catalog WON. Every seeded subject has a `subj.<code>` key, so an admin who
// renamed one saved the row, got an audit entry and a green tick — and the web
// app, the parent tabs and the student arena all kept printing the old name, in
// all three languages. Creating a subject worked (unknown code, no key), which
// is exactly why nobody caught it.
//
// A subject name is CONTENT, and this product is trilingual, so the fix cannot
// be "prefer subjects.name": one column cannot hold Riyaziyyat, Mathematics and
// Математика at once. The names now live per-locale in `subject_translations`
// (migration 171) — the repository's standard shape for translated content.
//
// -----------------------------------------------------------------------------
// HOW THE DATABASE NAME REACHES A PURE FUNCTION
// -----------------------------------------------------------------------------
// Through the SAME `t()` every caller already passes, under its own key
// namespace `subj.db.<code>` (see subjectNameKey below). The i18n layer of each
// app merges the current locale's `subject_translations` rows into its
// dictionary at the one place it is built — `getT()` plus the root layout's
// client dictionary on web, `useT()` on mobile — so all ~50 call sites got the
// fix without a single one of them changing, and a call site added tomorrow
// cannot forget to opt in. Threading the translation through instead would have
// meant editing every screen AND widening several `returns table` SQL functions
// that hand back a flat `subject_name` (the olympiad catalog, the round
// readiness reader, the attempt meta), which is a far larger blast radius than
// the defect, and one where a single missed call site silently restores the bug.
//
// The DB layer keeps its OWN namespace rather than overwriting `subj.<code>`:
// the two stay independently readable, so a failed/absent DB read falls back to
// the shipped catalog instead of blanking it, and each branch below is testable
// on its own.
//
// Resolution order, in full:
//   1. `subj.db.<code>`  — the admin-editable per-locale name (DB, wins)
//   2. `subj.<code>`     — the built-in az/en/ru catalog, reached ONLY when
//                          step 1 found nothing: no `subject_translations` row
//                          for this locale, an unreadable DB, or a deploy that
//                          landed before migration 171. Once 171 is applied and
//                          the seed has run, every KNOWN subject resolves at
//                          step 1 and never gets here.
//   3. `subjects.name`   — the raw DB column; the internal/az fallback
//   4. the code itself, then "—"
//
// Pure/iso (no server deps, never async, never fetches) so both server
// components (with getT()) and client components (with useT()/dict-based t) can
// share it. Both t() implementations return the KEY STRING itself for unknown
// keys — that is how "no translation" is detected.

/**
 * The dictionary key under which a subject's per-locale DATABASE name is
 * published by the i18n layer.
 *
 * Exported so the merge layer and this resolver can never disagree about the
 * spelling: the layer writes exactly what subjectLabel reads.
 */
export function subjectNameKey(code: string): string {
  return `subj.db.${code}`;
}

/**
 * What subjectLabel returns when a row carries NEITHER a code nor a name —
 * i.e. there is genuinely nothing to display. Exported as a constant so
 * subjectLabelOrNull below cannot drift from the string it has to recognise.
 */
export const NO_SUBJECT_LABEL = "—";

/**
 * Locale-aware subject label: az "Riyaziyyat", en "Mathematics",
 * ru "Математика" — or whatever an administrator has renamed the subject to in
 * the reader's language. Unknown/missing code falls back to the raw DB subject
 * name — never to a raw i18n key.
 */
export function subjectLabel(
  t: (key: string) => string,
  code: string | null | undefined,
  name: string | null | undefined,
): string {
  const raw = (name ?? "").trim();
  const c = (code ?? "").trim();
  if (!c) return raw || NO_SUBJECT_LABEL;

  // 1. The admin-managed per-locale name from subject_translations.
  const dbKey = subjectNameKey(c);
  const db = t(dbKey);
  if (db !== dbKey && db.trim()) return db;

  // 2. The shipped catalog for a code the app knows about.
  const catKey = `subj.${c}`;
  const cat = t(catKey);
  if (cat !== catKey && cat.trim()) return cat;

  // 3./4. The raw column, then the code.
  return raw || c;
}

/**
 * subjectLabel(), or `null` when there is nothing worth printing.
 *
 * -----------------------------------------------------------------------------
 * THE BUG THIS EXISTS TO FIX (2026-09-10)
 * -----------------------------------------------------------------------------
 * Several screens guarded on the RAW column before resolving the label:
 *
 *     subjects?.name ? subjectLabel(t, subjects.code, subjects.name) : ""
 *
 * `subjects.name` has been the frozen bulk-import match key since migration
 * 171, and nothing requires it to stay human-readable — or non-empty. A subject
 * whose name is blank but whose `subject_translations` rows are perfectly good
 * therefore rendered as NOTHING: the guard rejected the row before the resolver
 * ever got the chance to find the translation that would have named it. A test
 * header simply lost its subject, in all three languages at once.
 *
 * The guard belongs on the RESOLVED label, which is what this returns. It folds
 * away both the empty string and the `—` placeholder, so each caller says what
 * an absent subject should look like in ITS layout (`?? ""` inside a composed
 * sentence, `?? "—"` in a table cell) instead of re-deriving the emptiness test
 * from a column that no longer answers the question.
 */
export function subjectLabelOrNull(
  t: (key: string) => string,
  code: string | null | undefined,
  name: string | null | undefined,
): string | null {
  const label = subjectLabel(t, code, name).trim();
  return label && label !== NO_SUBJECT_LABEL ? label : null;
}

// -----------------------------------------------------------------------------
// ORDERING A SUBJECT LIST BY WHAT THE READER ACTUALLY SEES (2026-09-10)
// -----------------------------------------------------------------------------
// Sorting a subject list on `subjects.name` while RENDERING subjectLabel() puts
// it in an order that matches nothing on screen. The two agreed only by
// coincidence — migration 171 seeded subject_translations from those same
// strings — so the defect was invisible until the first rename, and permanent
// after it: `subjects.name` is the frozen import key and deliberately stops
// following a rename. It is also ONE Azerbaijani string for every reader, so
// even with no rename it ordered an English or Russian list by a name that
// reader never sees.
//
// A bare `localeCompare()` is not the fix either. With no locale argument it
// collates in the RUNTIME's default — the server's, on a server-rendered page —
// and Azerbaijani's alphabet is genuinely different, not merely accented:
// q sorts before l, x before i, ə directly after e. A list ordered correctly
// for an az reader is therefore WRONG for a ru one, so the comparator has to be
// keyed on the ACTIVE locale rather than on a hard-coded "az".
//
// Full BCP-47 tags, mirroring lib/formatDate.ts and lib/formatPercent.ts: a
// bare "az" tag resolves to the CLDR root locale on a runtime shipped without
// Azerbaijani data — the same trap that produced the "2026 M08 22" date bug.
// Both fallbacks below are deliberate rather than defensive habit: Hermes
// builds Intl from the platform (android.icu / NSLocale), so on a device whose
// data is missing this must degrade to a usable order, never throw.
const COLLATOR_TAGS: Record<string, string> = {
  az: "az-Latn-AZ",
  en: "en-GB",
  ru: "ru-RU",
};

type LabelCompare = (a: string, b: string) => number;

/** Last resort: deterministic and locale-blind, but never a crash. */
const CODE_UNIT_ORDER: LabelCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Building a collator is the expensive part; comparing with one is not. The map
// is bounded by the three supported locales and an Intl.Collator is immutable,
// so it is safe to hold across requests on the server as well as across renders.
const comparators = new Map<string, LabelCompare>();

/**
 * The comparator a subject list must be ordered with, for a reader of `locale`.
 * Exported so a caller that already holds resolved labels uses exactly the same
 * collation as sortSubjectsByLabel below.
 */
export function subjectComparator(locale: string): LabelCompare {
  const cached = comparators.get(locale);
  if (cached) return cached;
  let compare: LabelCompare;
  try {
    // `numeric` so "Riyaziyyat 2" precedes "Riyaziyyat 10" instead of following
    // it, which is what a reader means by alphabetical.
    compare = new Intl.Collator(COLLATOR_TAGS[locale] ?? COLLATOR_TAGS.en, {
      numeric: true,
    }).compare;
  } catch {
    try {
      compare = new Intl.Collator(COLLATOR_TAGS.en, { numeric: true }).compare;
    } catch {
      compare = CODE_UNIT_ORDER;
    }
  }
  comparators.set(locale, compare);
  return compare;
}

/**
 * Resolve every row's display label, then order the list by it.
 *
 * The label is resolved ONCE per row and carried on the result rather than
 * recomputed inside the comparator, which would resolve it O(n log n) times —
 * and a caller almost always renders the same string it sorted by, so handing
 * it back removes the second resolve as well.
 *
 * A caller that must not widen a serialized payload can drop the field again
 * (`.map(({ label: _label, ...rest }) => rest)`); the ORDER is the product.
 */
export function sortSubjectsByLabel<
  T extends { code?: string | null; name?: string | null },
>(
  t: (key: string) => string,
  locale: string,
  rows: readonly T[],
): (T & { label: string })[] {
  const compare = subjectComparator(locale);
  return rows
    .map(
      (row) =>
        ({ ...row, label: subjectLabel(t, row.code, row.name) }) as T & {
          label: string;
        },
    )
    .sort((a, b) => compare(a.label, b.label));
}
