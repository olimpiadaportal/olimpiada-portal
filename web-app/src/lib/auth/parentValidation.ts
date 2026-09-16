// Parent registration validation — the single source of truth shared by the
// web server action (parentService.registerParent) and the mobile BFF
// register endpoint. Pure/iso (no secrets, no DB, no Next imports) so both
// "use server" modules and route handlers may import it; it must never import
// from them.
//
// Validation returns i18n KEYS (not localized text): the web action localizes
// via getT(); the mobile app translates keys client-side.
//
// A FAILURE NOW CARRIES TWO KEYS, and the split is a WIRE CONTRACT rather than
// a matter of taste:
//
//   errorKey   The HISTORICAL key, unchanged and frozen. The mobile BFF
//              (/api/mobile/v1/auth/register) returns it RAW, and the shipped
//              1.16.0 binary translates it against a catalogue baked into that
//              build — a build that cannot be updated on the same clock as this
//              server. Repurposing or deleting one of these five values makes a
//              live app print a raw key at a parent. Add values; never move one.
//   detailKey  ADDITIVE, and names the ONE rule that actually failed. A client
//              that ships WITH the server (the web form) uses it to say "the
//              password needs a capital letter" instead of "the password is
//              weak"; a client that does not simply never reads the field.
//
// `field` is additive in the same way: it lets a form mark the offending input
// instead of printing one sentence above the whole thing.

import { checkNewPassword, type PasswordProblem } from "@/lib/auth/passwordPolicy";

// R7 security: pragmatic email shape check (local@domain.tld) + hard length
// caps so unbounded strings never reach auth/DB.
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
export const NAME_MAX = 80;
export const EMAIL_MAX = 255;
// Re-exported, not redeclared: the bounds are the password rule's, and a second
// pair of constants here is a pair that can silently drift from the module the
// server actually validates with.
export { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/passwordPolicy";
// Parent phone in E.164 — mirrors the DB check constraint
// chk_profiles_phone_e164 (migration 025) so invalid values never reach the DB.
//
// OPTIONAL since 2026-08-31 (was mandatory in Round 11). Apple rejected the
// iOS build under Guideline 5.1.1(v): an app may not REQUIRE personal
// information that its core functionality does not need, and nothing here
// needs a parent phone (the WhatsApp/tel links read the PLATFORM number from
// system_settings; payments read no phone at all). No migration was needed —
// chk_profiles_phone_e164 already constrains only the SHAPE of a NON-NULL
// value and profiles.phone is a plain nullable column, so mandatoriness only
// ever lived in the application layer.
//
// Optional is NOT unvalidated: a value that IS supplied must still be E.164,
// or the write fails the constraint.
export const PHONE_RE = /^\+[1-9][0-9]{6,14}$/;
export const PHONE_MAX = 16;

export type ParentRegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Optional (Apple 5.1.1(v)). Absent, empty and whitespace all mean "none". */
  phone?: string | null;
};

/** The input a failure belongs to, so a form can mark that one field. */
export type ParentRegistrationField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "password";

/**
 * The precise unmet rule. Every value is either a NEW key or one of the
 * existing keys whose sentence is already exactly this specific — nothing here
 * repurposes an old key (see the header).
 */
export type ParentRegistrationDetailKey =
  | "parent.err.firstNameRequired"
  | "parent.err.lastNameRequired"
  | "parent.err.email"
  | "parent.err.phone"
  | "parent.err.pwTooShort"
  | "parent.err.pwTooLong"
  | "parent.err.pwNeedsUpper"
  | "parent.err.pwNeedsSpecial";

/** One detail key per password rule. The whole point of these keys is that a
 *  parent is told WHICH requirement they missed, not that something is wrong. */
const PASSWORD_DETAIL: Record<PasswordProblem, ParentRegistrationDetailKey> = {
  tooShort: "parent.err.pwTooShort",
  tooLong: "parent.err.pwTooLong",
  needsUpper: "parent.err.pwNeedsUpper",
  needsSpecial: "parent.err.pwNeedsSpecial",
};

/**
 * The detail key for a password problem, for the paths that run
 * `checkNewPassword` on their own rather than through
 * `validateParentRegistration` — today the password-reset action. Exported so
 * there is ONE table: a reset that said "the password is weak" while
 * registration said "it needs a capital letter" would be the same rule
 * explaining itself two different ways.
 */
export function passwordDetailKey(problem: PasswordProblem): ParentRegistrationDetailKey {
  return PASSWORD_DETAIL[problem];
}

export type ParentRegistrationValidation =
  | {
      ok: true;
      /** Normalized values — callers must use these, not their raw inputs. */
      displayName: string;
      firstName: string;
      lastName: string;
      email: string;
      /**
       * NULL when the parent gave no number — never "". The column is nullable
       * and the DB constraint permits NULL, but "" fails the E.164 regex, so an
       * empty string is the one value that would break the write. Callers pass
       * this straight into `profiles.phone`; do not coerce it back to a string.
       */
      phone: string | null;
    }
  | {
      ok: false;
      /** FROZEN wire contract — read the header before touching this union. */
      errorKey:
        | "parent.err.required"
        | "parent.err.email"
        | "parent.err.phone"
        | "parent.err.password"
        | "parent.err.passwordWeak";
      /** Additive: which input to mark. */
      field: ParentRegistrationField;
      /** Additive: the single rule that was not satisfied. */
      detailKey: ParentRegistrationDetailKey;
      /** Additive, password failures only: the raw policy code, so a form can
       *  highlight the matching row of its requirements checklist. */
      passwordProblem?: PasswordProblem;
    };

/**
 * Validates (and normalizes) a parent registration. Rules, order and error
 * keys follow the historical registerParent behavior:
 * required → email → phone → password. Names are trimmed and capped, the
 * email is trimmed + lowercased, the phone is trimmed and collapses to NULL
 * when blank; the password is used as-is (never normalized, never truncated).
 */
export function validateParentRegistration(
  input: ParentRegistrationInput,
): ParentRegistrationValidation {
  const firstName = input.firstName.trim().slice(0, NAME_MAX);
  const lastName = input.lastName.trim().slice(0, NAME_MAX);
  const displayName = `${firstName} ${lastName}`.trim();
  const email = input.email.trim().toLowerCase();
  const phone = (input.phone ?? "").trim();
  const password = input.password;
  // ONE errorKey for both names (it is frozen), but two detail keys: the
  // sentence behind parent.err.required is "enter your email and password",
  // which is actively misleading when what is actually missing is a surname.
  if (!firstName) {
    return {
      ok: false,
      errorKey: "parent.err.required",
      field: "firstName",
      detailKey: "parent.err.firstNameRequired",
    };
  }
  if (!lastName) {
    return {
      ok: false,
      errorKey: "parent.err.required",
      field: "lastName",
      detailKey: "parent.err.lastNameRequired",
    };
  }
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return {
      ok: false,
      errorKey: "parent.err.email",
      field: "email",
      detailKey: "parent.err.email",
    };
  }
  // OPTIONAL phone (Apple 5.1.1(v)) — a blank field is ACCEPTED and becomes
  // NULL below. A phone that is PRESENT is still validated BEFORE any auth user
  // is created: the client composes E.164 (+countrycode + national) and that
  // composition is never trusted, and a malformed string would be refused by
  // chk_profiles_phone_e164 at write time anyway.
  if (phone && (phone.length > PHONE_MAX || !PHONE_RE.test(phone))) {
    return {
      ok: false,
      errorKey: "parent.err.phone",
      field: "phone",
      detailKey: "parent.err.phone",
    };
  }
  // Strength lives in lib/auth/passwordPolicy — the same module the mobile BFF
  // register route reaches through this function, so client and server can
  // never disagree about what is acceptable.
  const weak = checkNewPassword(password);
  if (weak) {
    // Two keys, because a length failure and a missing-symbol failure need
    // different sentences: telling someone whose password is 4 characters long
    // that it needs a capital letter sends them to fix the wrong thing.
    return {
      ok: false,
      errorKey:
        weak === "tooShort" || weak === "tooLong"
          ? "parent.err.password"
          : "parent.err.passwordWeak",
      field: "password",
      detailKey: PASSWORD_DETAIL[weak],
      passwordProblem: weak,
    };
  }
  // `phone || null` — NOT `phone`. Both call sites write this value straight
  // into profiles.phone (`.update({ phone })`); "" would fail the E.164 check
  // constraint, NULL is exactly what the column expects for "no number".
  return { ok: true, displayName, firstName, lastName, email, phone: phone || null };
}
