// THE ONE PLACE THIS PANEL TURNS A `subjects` ROW INTO A NAME A HUMAN READS.
//
// A subject has TWO names since migration 171 and they are not interchangeable:
//
//   * `subjects.name` is the frozen INTERNAL IMPORT KEY. Three bulk-import RPCs
//     resolve a subject with `where name = (meta ->> 'subject')`, so
//     `updateSubject` deliberately never rewrites it — renaming it would break
//     every import file naming the old string, invisibly and days later.
//   * `subject_translations` holds the DISPLAY name, one row per locale. That is
//     what the website, the parent tabs and the student arena print.
//
// THE RULE, and it is the whole reason this module exists: every human-facing
// admin surface shows the DISPLAY name in the admin's own locale, falling back
// to az. An admin reasons about the subject a parent can see and quote back to
// them, so a screen that prints the import key is showing them a name nobody
// else in the product uses. The key is rendered ONLY where it IS the subject —
// the edit form's `subj.importNameHint`, which says in three languages that it
// is the import key and that a rename does not move it — and nowhere else.
//
// Before this existed, roughly ten admin reads still selected `id, name` and
// printed it raw, so the Subjects screen showed the new name while Curriculum,
// Questions, Olympiads, Notifications, Question reports, Free access, App Store
// products and Subscriptions all showed the old one. Two names for one subject,
// on ten screens, is worse than either name alone.
//
// Kept free of `server-only`: the manage/Subjects loader, the list pages and
// their client trees all resolve a label through here, and one path is the
// point.

/** One `subject_translations` row as PostgREST returns it. */
export type SubjectTranslationRow = {
  locale: string | null;
  name: string | null;
};

/**
 * Whatever a query gave back for one subject. Every field is optional because
 * this consumes both shapes the panel reads: a top-level `subjects` row and an
 * embedded `subjects(...)` join, which may be null on a nullable FK.
 */
export type SubjectDisplayRow = {
  name?: string | null;
  code?: string | null;
  subject_translations?: SubjectTranslationRow[] | null;
} | null | undefined;

/** The three display names, `az` always populated (see `subjectNamesFor`). */
export type SubjectNames = { az: string; en: string; ru: string };

/**
 * The PostgREST projection for a TOP-LEVEL subjects query.
 *
 * `code` is in it on purpose even where nothing renders it: it is the last
 * resort below and the stable handle a rename cannot move, and a query that
 * omits it can only fall back to the import key.
 */
export const SUBJECT_DISPLAY_SELECT =
  "id, name, code, status, subject_translations(locale, name)";

/**
 * The same thing as an EMBEDDED join — `questions(... subjects(...) ...)` and
 * friends. Two levels deep is fine: `subject_translations` is public-read
 * (`for select using (true)`), so no admin session can be refused the rows.
 *
 * `status` rides along because one caller (Free access) filters on it and a
 * second embed shape is exactly how the two names drifted apart in the first
 * place; the columns cost nothing on a table with a dozen rows.
 */
export const SUBJECT_DISPLAY_EMBED =
  "subjects(name, code, status, subject_translations(locale, name))";

/** The trimmed name for one locale, or "" when there is none. */
function translated(rows: SubjectTranslationRow[], locale: string): string {
  for (const r of rows) {
    if (String(r?.locale ?? "") !== locale) continue;
    const name = String(r?.name ?? "").trim();
    if (name) return name;
  }
  return "";
}

/**
 * What the panel CALLS this subject to the admin looking at it.
 *
 * Reader's locale → az → the import key → the code → "". A BLANK translation
 * falls through rather than blanking the label: `ck_subject_tr_name_not_blank`
 * makes that unreachable from the database, and this keeps it harmless if it
 * ever becomes reachable. The import key is a fallback here, not a choice —
 * it is what a database without migration 171 still renders, which is the
 * pre-171 screen rather than a broken one.
 *
 * Callers supply their own em dash for "no subject at all"; this returns "" so
 * a caller can tell an unnamed subject from a missing one.
 */
export function subjectDisplayName(
  row: SubjectDisplayRow,
  locale: string,
): string {
  const rows = row?.subject_translations ?? [];
  return (
    translated(rows, locale) ||
    translated(rows, "az") ||
    String(row?.name ?? "").trim() ||
    String(row?.code ?? "").trim()
  );
}

/**
 * The per-locale names for one subject, `az` backfilled from `subjects.name`.
 *
 * A MISSING ROW IS NOT AN ERROR. The table arrives in a migration and the panel
 * has to keep working on a database where it has not been applied — so an
 * absent az row means "use the column", and an absent en/ru row means the edit
 * form shows an empty optional field, which is exactly what the admin fills in.
 */
export function subjectNamesFor(
  fallbackAz: string,
  rows: SubjectTranslationRow[],
): SubjectNames {
  const out: SubjectNames = { az: "", en: "", ru: "" };
  for (const r of rows) {
    const loc = String(r?.locale ?? "");
    if (loc !== "az" && loc !== "en" && loc !== "ru") continue;
    out[loc] = String(r?.name ?? "").trim();
  }
  if (!out.az) out.az = fallbackAz;
  return out;
}

// ---------------------------------------------------------------------------
// ORDERING A LIST OF ADMIN DISPLAY LABELS (2026-09-10)
// ---------------------------------------------------------------------------
// Every list above turns a row into a string a human reads, and a list of those
// strings has to be put in the reader's alphabet — not the runtime's.
//
// THE DEFECT THIS REPLACES: `labels.sort((a, b) => a.label.localeCompare(b.label))`
// and its quieter twin `labels.sort()`. The first collates in whatever the
// SERVER's default locale is (a deploy detail, identical for every admin); the
// second compares UTF-16 code units, which puts "10-cu sinif" above "3-cü sinif"
// and every Azerbaijani letter outside A–Z after every letter inside it. Both
// look sorted, which is why they survive review.
//
// Azerbaijani is not the Latin alphabet with accents: q sorts BEFORE l, x
// before i, and ə directly after e. A list ordered correctly for an az reader is
// therefore genuinely WRONG for a ru one, so the comparator is keyed on the
// ACTIVE locale rather than hard-coded.
//
// FULL BCP-47 TAGS, not bare "az": a bare tag resolves to the CLDR root locale
// on a runtime shipped without Azerbaijani data, which is the same trap that
// once produced "2026 M08 22" dates. `numeric` so "3-cü sinif" precedes
// "10-cu sinif" — what an admin means by alphabetical when labels carry numbers.
//
// Building a collator is the expensive part; comparing with one is not, and an
// Intl.Collator is immutable, so the three of them are cached across requests.
const COLLATOR_TAGS: Record<string, string> = {
  az: "az-Latn-AZ",
  en: "en-GB",
  ru: "ru-RU",
};

type LabelCompare = (a: string, b: string) => number;

/** Last resort: deterministic and locale-blind, but never a crash. */
const CODE_UNIT_ORDER: LabelCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const comparators = new Map<string, LabelCompare>();

/**
 * The comparator an admin-facing list of DISPLAY LABELS must be ordered with.
 *
 * Not subject-specific: a grade name, a package title and a subject name are
 * all strings this panel resolved for one reader, and they all need that
 * reader's collation. It lives in this module because this module is where the
 * panel decides what a row is CALLED, and the order has to be decided in the
 * same language as the name.
 */
export function displayLabelComparator(locale: string): LabelCompare {
  const cached = comparators.get(locale);
  if (cached) return cached;
  let compare: LabelCompare;
  try {
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

/** `rows` in reading order, by the string `label(row)` resolves to. */
export function sortByDisplayLabel<T>(
  rows: readonly T[],
  locale: string,
  label: (row: T) => string,
): T[] {
  const compare = displayLabelComparator(locale);
  return [...rows].sort((a, b) => compare(label(a), label(b)));
}
