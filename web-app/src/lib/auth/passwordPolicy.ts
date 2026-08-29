// The password strength rule, in ONE place.
//
// Pure/iso by the same contract as parentValidation.ts: no secrets, no DB, no
// Next imports, so both `"use server"` modules and route handlers may import
// it. It returns a CODE, not a message — each caller maps the code onto its own
// i18n keys, because the three apps have three different key namespaces.
//
// APPLIES TO NEWLY CHOSEN PASSWORDS ONLY. Never call this from a sign-in path.
// Every account created before this shipped has a password that predates the
// rule and must keep working; the moment a login checks strength, every one of
// those users is locked out of their own account. The separation is structural,
// not a convention: `validateChildLogin` and `checkNewPassword` are different
// functions and neither calls the other. Keep it that way.
//
// For the same reason this is NOT a Supabase `password_verification_attempt`
// Auth Hook. That hook fires at SIGN-IN — it is the obvious-looking primitive
// and it is the wrong one. GoTrue has no hook for validating a password at the
// moment it is chosen, which is why the rule lives here in application code.
//
// THIS FILE IS TRIPLICATED, deliberately. web-app, admin-panel and mobile-app
// are three separate deployables with no shared package and no cross-imports
// (mobile-app/tsconfig.json maps only `@/* -> ./src/*`). The twins are
// `admin-panel/src/lib/admin/passwordPolicy.ts` and
// `mobile-app/src/lib/passwordPolicy.ts`, and a parity test asserts all three
// stay byte-identical from the RULE marker down. Edit one, edit all three.

// ---- RULE (keep byte-identical across all three copies) ----------------------

export const PASSWORD_MIN = 8;
// bcrypt effectively uses 72 bytes; reject longer rather than silently truncate.
export const PASSWORD_MAX = 128;

/** ASCII punctuation and symbols — what a keyboard actually offers, and what
 *  every "special character" hint in the world means. An Azerbaijani letter is
 *  NOT special: `ə` is a letter, and counting it would let `ələmə` pass. */
export const PASSWORD_SPECIAL_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/**
 * True when the password contains at least one uppercase letter.
 *
 * Deliberately NOT `/[A-Z]/`, and deliberately not `/\p{Lu}/u` either:
 *
 *  - `[A-Z]` rejects a valid Azerbaijani password whose only capital is Ş, Ə,
 *    Ğ, Ç, Ü, Ö or İ. On a product whose default locale IS Azerbaijani, that
 *    turns the rule into a trap.
 *  - `\p{Lu}` is correct but relies on Unicode property escapes, which are
 *    unproven on Hermes (Expo SDK 54) — and the mobile twin must behave
 *    identically to the server or the client shows "OK" and the server refuses.
 *
 * A string contains an uppercase letter exactly when lowercasing it changes
 * something. That holds for Latin, Azerbaijani and Cyrillic alike, needs no
 * Unicode tables, and behaves the same on every JS engine.
 */
export function hasUpper(pw: string): boolean {
  return pw !== pw.toLowerCase();
}

export type PasswordProblem = "tooShort" | "tooLong" | "needsUpper" | "needsSpecial";

/**
 * Validate a NEWLY CHOSEN password. `null` means acceptable.
 *
 * Order matters: length first, so a user typing a short password is told to
 * lengthen it rather than being sent to hunt for a symbol they would then have
 * to re-enter anyway.
 */
export function checkNewPassword(pw: string): PasswordProblem | null {
  if (pw.length < PASSWORD_MIN) return "tooShort";
  if (pw.length > PASSWORD_MAX) return "tooLong";
  if (!hasUpper(pw)) return "needsUpper";
  if (!PASSWORD_SPECIAL_RE.test(pw)) return "needsSpecial";
  return null;
}
