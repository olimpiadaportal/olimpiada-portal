// The PURE half of the admin-managed subject-name layer (migration 171).
//
// `subject_translations` holds one display name per (subject, locale). The apps
// publish the current locale's names into their i18n dictionary under
// `subj.db.<code>` — the key subjectLabel() reads first — so every surface that
// already resolves a label through subjectLabel picks up a rename with no call
// site change. This module owns the SHAPE of that dictionary; the fetching
// lives in each app's own data layer (lib/flags.ts on web, lib/configQueries.ts
// on mobile), because those differ and this must not.
//
// Kept free of server-only imports so the i18n layer, the root layout and the
// tests can all use it. THIS FILE IS BYTE-IDENTICAL in web-app/src/lib and
// mobile-app/src/lib, header included — subjectRename.test.ts asserts the whole
// file, so edit both or neither. It used to claim that while the two headers
// differed, which is how a "keep these in sync" pair starts drifting.
import { subjectNameKey } from "./subjectLabel";

/** One subject as read from the database: its code and its translated names. */
export type SubjectNameRow = {
  code: string | null;
  subject_translations?: { locale: string | null; name: string | null }[] | null;
};

/**
 * `{ "subj.db.math": "Mathematics", … }` for one locale.
 *
 * Defensive by design — this consumes whatever PostgREST returned, and a
 * malformed or half-applied row must degrade to "no override" (the caller then
 * falls through to the shipped catalog) rather than publishing an empty label.
 * A blank name is therefore DROPPED, not published: the database's
 * ck_subject_tr_name_not_blank makes that unreachable, and this makes it
 * harmless if it ever becomes reachable.
 */
export function buildSubjectNameDict(
  rows: SubjectNameRow[] | null | undefined,
  locale: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows ?? []) {
    const code = (row?.code ?? "").trim();
    if (!code) continue;
    for (const tr of row?.subject_translations ?? []) {
      if ((tr?.locale ?? "").trim() !== locale) continue;
      const name = (tr?.name ?? "").trim();
      if (!name) continue;
      out[subjectNameKey(code)] = name;
    }
  }
  return out;
}

/** The PostgREST projection both apps use — one place so they cannot drift. */
export const SUBJECT_NAMES_SELECT = "code, subject_translations(locale, name)";
