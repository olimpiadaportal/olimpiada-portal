import { describe, it, expect } from "vitest";
import {
  PASSWORD_MAX,
  checkNewPassword,
  hasUpper,
} from "@/lib/auth/passwordPolicy";
import { validateChildLogin, validateChildPassword } from "@/lib/auth/children";
import { validateParentRegistration } from "@/lib/auth/parentValidation";
import { messages } from "@/i18n/messages";
import { locales } from "@/i18n/config";

// What these tests are actually protecting:
//
//   1. The uppercase check must be Azerbaijani-correct. `/[A-Z]/` would reject
//      a password whose only capital is Ş/Ə/Ğ/Ç/Ü/Ö/İ — on a product whose
//      DEFAULT locale is Azerbaijani that is not an edge case, it is the
//      typical password.
//   2. The rule must never reach a LOGIN. Every account created before the
//      policy shipped has a password that violates it; the day a sign-in path
//      calls checkNewPassword, every one of those users is locked out.
describe("checkNewPassword", () => {
  it("accepts an Azerbaijani password whose only capital is Ş", () => {
    // The exact case /[A-Z]/ gets wrong. `Ş`.toLowerCase() === `ş`, so the
    // lowercase-comparison rule sees it; a Latin-only class would not.
    expect(hasUpper("Şəkil!2026")).toBe(true);
    expect(checkNewPassword("Şəkil!2026")).toBe(null);
  });

  it("accepts a plain ASCII password that meets every rule", () => {
    expect(checkNewPassword("Passw0rd!")).toBe(null);
  });

  it("rejects a password with no capital letter", () => {
    expect(checkNewPassword("password1")).toBe("needsUpper");
  });

  it("rejects a password with no special character", () => {
    // All-caps still has no symbol; uppercase is checked first, so this must
    // fall through to needsSpecial rather than stopping at needsUpper.
    expect(checkNewPassword("PASSWORD1")).toBe("needsSpecial");
    expect(checkNewPassword("Password1")).toBe("needsSpecial");
  });

  it("rejects a too-short password before asking for a symbol", () => {
    // Length first on purpose: telling someone whose password is 4 characters
    // long to add a capital sends them to fix the wrong thing.
    expect(checkNewPassword("Ab!")).toBe("tooShort");
  });

  it("rejects a password longer than the bcrypt-safe cap", () => {
    // 129 chars. Rejected rather than silently truncated at bcrypt's 72 bytes.
    expect(checkNewPassword("A!" + "a".repeat(127))).toBe("tooLong");
    expect(PASSWORD_MAX).toBe(128);
  });

  it("does not count an Azerbaijani letter as a special character", () => {
    // `ə` is a LETTER. Counting it would let `ələmə` through the symbol rule.
    expect(checkNewPassword("Ələməələ")).toBe("needsSpecial");
  });
});

// The regression guard. If someone later "tidies up" by pointing the login
// validators at checkNewPassword, this test fails — and that failure is the
// only thing standing between that refactor and every existing family being
// locked out of an account whose password predates the rule.
describe("login paths never enforce the new-password rule", () => {
  it("validateChildLogin accepts a weak existing password", () => {
    expect(validateChildLogin("12345678", "weak")).toEqual({ ok: true });
  });

  it("validateChildLogin still rejects a malformed ID and an empty password", () => {
    const bad = validateChildLogin("1234", "");
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.errors).toEqual([
      "auth.child.err.idFormat",
      "auth.child.err.passwordRequired",
    ]);
  });
});

describe("validateChildPassword", () => {
  it("accepts a compliant Azerbaijani password", () => {
    expect(validateChildPassword("Şəkil!2026")).toEqual({ ok: true });
  });

  it("reports the strength key when the password is long enough but weak", () => {
    const res = validateChildPassword("password1");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toEqual(["auth.child.err.passwordWeak"]);
  });

  it("keeps the length key for a short password", () => {
    const res = validateChildPassword("Ab!");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toEqual(["auth.child.err.passwordTooShort"]);
  });

  it("still rejects a password equal to the 8-digit login ID", () => {
    // "12345678" fails strength AND equals the ID: both errors, and the
    // equals-ID rule must survive the strength check being added in front of it.
    const res = validateChildPassword("12345678", { childUniqueId: "12345678" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toContain("auth.child.err.passwordEqualsId");
  });
});

describe("validateParentRegistration password mapping", () => {
  const base = {
    firstName: "Aysel",
    lastName: "Məmmədova",
    email: "aysel@example.com",
    phone: "+994501234567",
  };

  it("accepts a compliant password", () => {
    expect(validateParentRegistration({ ...base, password: "Şəkil!2026" }).ok).toBe(true);
  });

  it("maps a weak-but-long password to the strength key", () => {
    const res = validateParentRegistration({ ...base, password: "password1" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errorKey).toBe("parent.err.passwordWeak");
  });

  it("maps both length failures to the length key", () => {
    const short = validateParentRegistration({ ...base, password: "Ab!" });
    expect(short.ok === false && short.errorKey).toBe("parent.err.password");
    const long = validateParentRegistration({
      ...base,
      password: "A!" + "a".repeat(127),
    });
    expect(long.ok === false && long.errorKey).toBe("parent.err.password");
  });
});

// A validator that returns a key nobody translated shows the parent the literal
// string "parent.err.passwordWeak" — tsc cannot see that, and neither can a
// build. These three keys are the ones this change introduced.
const NEW_KEYS = [
  "parent.err.passwordWeak",
  "profile.err.passwordWeak",
  "auth.child.err.passwordWeak",
] as const;

describe("password-policy i18n", () => {
  for (const locale of locales) {
    it(`${locale}: every new strength key resolves to real text`, () => {
      const dict = messages[locale] as Record<string, string | undefined>;
      const missing = NEW_KEYS.filter((k) => {
        const v = dict[k];
        return typeof v !== "string" || v.trim() === "";
      });
      expect(missing).toEqual([]);
    });
  }
});
