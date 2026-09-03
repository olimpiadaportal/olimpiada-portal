// Parent registration validation — the single source of truth shared by the
// web server action (parentService.registerParent) and the mobile BFF
// register endpoint. Pure/iso (no secrets, no DB, no Next imports) so both
// "use server" modules and route handlers may import it; it must never import
// from them.
//
// Validation returns i18n KEYS (not localized text): the web action localizes
// via getT(); the mobile app translates keys client-side.

import { checkNewPassword } from "@/lib/auth/passwordPolicy";

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
      errorKey:
        | "parent.err.required"
        | "parent.err.email"
        | "parent.err.phone"
        | "parent.err.password"
        | "parent.err.passwordWeak";
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
  if (!firstName || !lastName) return { ok: false, errorKey: "parent.err.required" };
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return { ok: false, errorKey: "parent.err.email" };
  }
  // OPTIONAL phone (Apple 5.1.1(v)) — a blank field is ACCEPTED and becomes
  // NULL below. A phone that is PRESENT is still validated BEFORE any auth user
  // is created: the client composes E.164 (+countrycode + national) and that
  // composition is never trusted, and a malformed string would be refused by
  // chk_profiles_phone_e164 at write time anyway.
  if (phone && (phone.length > PHONE_MAX || !PHONE_RE.test(phone))) {
    return { ok: false, errorKey: "parent.err.phone" };
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
    };
  }
  // `phone || null` — NOT `phone`. Both call sites write this value straight
  // into profiles.phone (`.update({ phone })`); "" would fail the E.164 check
  // constraint, NULL is exactly what the column expects for "no number".
  return { ok: true, displayName, firstName, lastName, email, phone: phone || null };
}
