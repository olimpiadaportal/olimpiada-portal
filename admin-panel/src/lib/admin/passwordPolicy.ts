// The password strength rule, in ONE place — admin-panel copy.
//
// APPLIES TO NEWLY CHOSEN PASSWORDS ONLY. Never call this from a sign-in path:
// every account created before this shipped has a password that predates the
// rule, and the moment a login checks strength those users lose their own
// accounts.
//
// THIS FILE IS A TWIN of `web-app/src/lib/auth/passwordPolicy.ts`. admin-panel is a separate
// deployable and cannot import from web-app.
// Everything from the RULE marker down is byte-identical across the three
// copies and a parity test asserts it. Edit one, edit all three.

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
