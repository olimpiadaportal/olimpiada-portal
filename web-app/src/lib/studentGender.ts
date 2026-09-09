// The optional, parent-declared gender of a child — the WHITELIST, and the one
// place that decides what a submitted string means.
//
// Pure/iso (no secrets, no DB) so the client forms and the server cores share
// exactly one definition of "a legal value" and one definition of "absent".
//
// MIGRATION 169 LEFT THE COLUMN NULLABLE ON PURPOSE, and the two "empty" states
// are NOT the same thing:
//
//   NULL          — nobody has been asked yet. Every row that predates the
//                   field is in this state, and so is every parent who simply
//                   walked past the control.
//   'unspecified' — a parent WAS asked and declined to answer. That is an
//                   answer, and it has to survive.
//
// Two rules follow, and they are the whole reason this module exists rather
// than an inline `?? null`:
//
//   * ABSENT MEANS "DO NOT WRITE THE COLUMN" (parse → `value: null`). Writing
//     NULL on every save would erase a real answer the next time a parent
//     edited a school name; defaulting to 'unspecified' would invent one for
//     someone who was never shown the question. Both produce numbers that look
//     like data and are not — which is the failure the migration header opens
//     with.
//   * A PRESENT VALUE IS WHITELISTED, NEVER COERCED. Anything outside the enum
//     is refused, because a save that silently drops what was sent reports
//     success for a write that did not happen.
//
// This is a MINOR'S PERSONAL DATA, and nothing about access, content or ranking
// reads it — it exists for aggregate reporting. Keep it out of any payload,
// log, export or screen that does not need it.

export const STUDENT_GENDERS = ["female", "male", "unspecified"] as const;

export type StudentGender = (typeof STUDENT_GENDERS)[number];

export type ParsedGender =
  /** `value: null` = ABSENT. The caller must leave the column alone. */
  | { ok: true; value: StudentGender | null }
  | { ok: false; errorKey: "addchild.err.genderInvalid" };

export function isStudentGender(value: unknown): value is StudentGender {
  return (
    typeof value === "string" && (STUDENT_GENDERS as readonly string[]).includes(value)
  );
}

/**
 * Whitelist a submitted gender.
 *
 * Absent (undefined / null / blank / whitespace) → `{ ok: true, value: null }`,
 * which every caller must read as "no change". One of the three enum values
 * passes through. Anything else is REJECTED with an i18n key the surfaces
 * localize — never coerced to a default and never dropped.
 */
export function parseStudentGender(raw: unknown): ParsedGender {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, errorKey: "addchild.err.genderInvalid" };
  const value = raw.trim();
  if (value === "") return { ok: true, value: null };
  if (isStudentGender(value)) return { ok: true, value };
  return { ok: false, errorKey: "addchild.err.genderInvalid" };
}
