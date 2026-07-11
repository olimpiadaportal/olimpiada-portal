// Parent registration validation — the single source of truth shared by the
// web server action (parentService.registerParent) and the mobile BFF
// register endpoint. Pure/iso (no secrets, no DB, no Next imports) so both
// "use server" modules and route handlers may import it; it must never import
// from them.
//
// Validation returns i18n KEYS (not localized text): the web action localizes
// via getT(); the mobile app translates keys client-side.

// R7 security: pragmatic email shape check (local@domain.tld) + hard length
// caps so unbounded strings never reach auth/DB. bcrypt effectively uses 72
// bytes, so >128-char passwords are rejected rather than silently truncated.
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
export const NAME_MAX = 80;
export const EMAIL_MAX = 255;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
// Round 11: mandatory parent phone in E.164 — mirrors the DB check constraint
// chk_profiles_phone_e164 (migration 025) so invalid values never reach the DB.
export const PHONE_RE = /^\+[1-9][0-9]{6,14}$/;
export const PHONE_MAX = 16;

export type ParentRegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
};

export type ParentRegistrationValidation =
  | {
      ok: true;
      /** Normalized values — callers must use these, not their raw inputs. */
      displayName: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    }
  | {
      ok: false;
      errorKey:
        | "parent.err.required"
        | "parent.err.email"
        | "parent.err.phone"
        | "parent.err.password";
    };

/**
 * Validates (and normalizes) a parent registration. Rules, order and error
 * keys are exactly the historical registerParent behavior:
 * required → email → phone → password. Names are trimmed and capped, the
 * email is trimmed + lowercased, the phone is trimmed; the password is used
 * as-is (never normalized, never truncated).
 */
export function validateParentRegistration(
  input: ParentRegistrationInput,
): ParentRegistrationValidation {
  const firstName = input.firstName.trim().slice(0, NAME_MAX);
  const lastName = input.lastName.trim().slice(0, NAME_MAX);
  const displayName = `${firstName} ${lastName}`.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const password = input.password;
  if (!firstName || !lastName) return { ok: false, errorKey: "parent.err.required" };
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return { ok: false, errorKey: "parent.err.email" };
  }
  // Mandatory phone, validated BEFORE any auth user is created. The client
  // composes E.164 (+countrycode + national); never trust that composition.
  if (!phone || phone.length > PHONE_MAX || !PHONE_RE.test(phone)) {
    return { ok: false, errorKey: "parent.err.phone" };
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return { ok: false, errorKey: "parent.err.password" };
  }
  return { ok: true, displayName, firstName, lastName, email, phone };
}
