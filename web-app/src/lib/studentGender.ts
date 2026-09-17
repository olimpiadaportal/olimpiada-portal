// The parent-declared gender of a child — the WHITELIST, and the one place
// that decides what a submitted string means.
//
// Pure/iso (no secrets, no DB) so the client forms and the server cores share
// exactly one definition of "a legal value" and one definition of "absent".
//
// TWO PARSE MODES, AND THE DIFFERENCE IS A PRODUCT DECISION RATHER THAN A TYPE
// DETAIL:
//
//   parseStudentGender          OPTIONAL — absent parses to `value: null`,
//                               which the caller must read as "do not write
//                               the column". This was the ONLY mode from
//                               migration 169 until 2026-09-16.
//   parseStudentGenderRequired  REQUIRED — absent is an ERROR, and the only
//                               answers it accepts are the two a parent is
//                               actually offered. Every parent- and
//                               admin-facing create/edit path uses this one.
//
// MANDATORY SINCE 2026-09-16 (owner), AND THE COLUMN IS STILL NULLABLE. Those
// are not in tension: "mandatory" is a rule about what this application accepts
// from a human today, not a claim about rows written before the rule existed.
// Production holds 51 children whose gender is NULL, and there is no honest
// backfill for a minor's personal data — a NOT NULL would have to invent one,
// which is the single thing this module has refused since it was written.
//
// So the three "empty-ish" states still mean three different things, and any
// reader that collapses them is reporting numbers that look like data and are
// not:
//
//   NULL          — nobody was ever asked. Every row that predates the field,
//                   plus every child created while the field was optional and
//                   the parent walked past it.
//   'unspecified' — a parent WAS asked and declined. RETIRED as an ANSWER on
//                   2026-09-16 (see below) but never deleted: Postgres cannot
//                   drop an enum label, and more importantly the rows holding
//                   it recorded something true.
//   absent        — nothing was submitted. Only the optional parser still has
//                   a meaning for it.
//
// THREE ENUM LABELS, THREE COLLECTABLE ANSWERS — AND THE THIRD ONE IS LOAD-BEARING.
// The parent must ANSWER the question (there is no silent skip and no blank
// placeholder that submits), but one of the answers is "prefer not to say".
//
// WHY, AND DO NOT QUIETLY REMOVE IT AGAIN. Apple Guideline 5.1.1(v) forbids
// REQUIRING personal information that is not directly relevant to core
// functionality, and this field drives nothing — not access, not content, not
// ranking. This app has ALREADY taken a 5.1.1(v) finding once, answered on
// 2026-08-31 by making the parent phone optional; a two-value forced choice
// about a MINOR would run that same fix backwards on the same guideline, and
// Apple has a published rejection specifically about the absence of an opt-out
// path. Keeping a non-answer satisfies the guideline in substance while the
// control stays mandatory in the UI, which is what the owner asked for.
//
// So `COLLECTED_STUDENT_GENDERS` and `STUDENT_GENDERS` agree today. They are
// still two names because they answer two different questions — what a row may
// HOLD versus what a form may SEND — and the day those diverge again the
// distinction is the thing that keeps a retired answer out of a form.
//
// A PRESENT VALUE IS WHITELISTED, NEVER COERCED. Anything outside the enum is
// refused, because a save that silently drops what was sent reports success for
// a write that did not happen.
//
// This is a MINOR'S PERSONAL DATA, and nothing about access, content or ranking
// reads it — it exists for aggregate reporting. Keep it out of any payload,
// log, export or screen that does not need it.

/** Every label the DB enum holds — what a STORED row may say. */
export const STUDENT_GENDERS = ["female", "male", "unspecified"] as const;

/** What a parent may ANSWER today. Includes the deliberate non-answer — see above. */
export const COLLECTED_STUDENT_GENDERS = ["female", "male", "unspecified"] as const;

export type StudentGender = (typeof STUDENT_GENDERS)[number];
export type CollectedStudentGender = (typeof COLLECTED_STUDENT_GENDERS)[number];

export type ParsedGender =
  /** `value: null` = ABSENT. The caller must leave the column alone. */
  | { ok: true; value: StudentGender | null }
  | { ok: false; errorKey: "addchild.err.genderInvalid" };

export type RequiredParsedGender =
  /** Always a real, collectable answer — never null, so the caller cannot
   *  accidentally write "no answer" while believing it wrote one. */
  | { ok: true; value: CollectedStudentGender }
  | {
      ok: false;
      errorKey: "addchild.err.genderRequired" | "addchild.err.genderInvalid";
    };

export function isStudentGender(value: unknown): value is StudentGender {
  return (
    typeof value === "string" && (STUDENT_GENDERS as readonly string[]).includes(value)
  );
}

/** Is this one of the two answers a parent is offered? `'unspecified'` is a
 *  legal STORED value and deliberately NOT one of these. */
export function isCollectedStudentGender(
  value: unknown,
): value is CollectedStudentGender {
  return (
    typeof value === "string" &&
    (COLLECTED_STUDENT_GENDERS as readonly string[]).includes(value)
  );
}

/**
 * Whitelist a submitted gender, OPTIONALLY.
 *
 * Absent (undefined / null / blank / whitespace) → `{ ok: true, value: null }`,
 * which every caller must read as "no change". One of the three enum values
 * passes through. Anything else is REJECTED with an i18n key the surfaces
 * localize — never coerced to a default and never dropped.
 *
 * KEPT, THOUGH EVERY PARENT-FACING PATH NOW USES THE REQUIRED PARSER BELOW.
 * "Absent" is still a state this codebase has to be able to express: a
 * migration, a repair script or a future surface that edits something else
 * about a child must be able to say "I am not answering this question" without
 * being forced to invent an answer for a minor.
 */
export function parseStudentGender(raw: unknown): ParsedGender {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, errorKey: "addchild.err.genderInvalid" };
  const value = raw.trim();
  if (value === "") return { ok: true, value: null };
  if (isStudentGender(value)) return { ok: true, value };
  return { ok: false, errorKey: "addchild.err.genderInvalid" };
}

/**
 * Whitelist a submitted gender, REQUIRED (owner, 2026-09-16).
 *
 * Absent → `addchild.err.genderRequired`. A value outside the enum →
 * `addchild.err.genderInvalid`, the same refusal as before so a forged string
 * keeps its own message. And `'unspecified'` → `addchild.err.genderRequired`:
 * it is a legal thing for a ROW to say and no longer a legal thing for a FORM
 * to send, so the honest message is "choose one", not "that value is invalid".
 *
 * THE SUCCESS TYPE CARRIES NO `null`. That is the point of the second parser:
 * a caller writing the column can spread `value` unconditionally and cannot
 * reintroduce the conditional that used to drop the field on its way to the
 * database.
 */
export function parseStudentGenderRequired(raw: unknown): RequiredParsedGender {
  const parsed = parseStudentGender(raw);
  if (!parsed.ok) return parsed;
  // ABSENT is the only refusal. "unspecified" is a real answer a parent chose,
  // not a missing one: the requirement is that the question is ANSWERED, never
  // that the parent must disclose. Refusing it here is what would re-create the
  // 5.1.1(v) exposure the comment at the top of this file describes.
  if (parsed.value === null) return { ok: false, errorKey: "addchild.err.genderRequired" };
  if (!isCollectedStudentGender(parsed.value)) {
    return { ok: false, errorKey: "addchild.err.genderInvalid" };
  }
  return { ok: true, value: parsed.value };
}
