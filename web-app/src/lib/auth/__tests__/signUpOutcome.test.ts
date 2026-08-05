import { describe, it, expect } from "vitest";
import { isExistingAccountSignUp } from "@/lib/auth/signUpOutcome";

// The asymmetry these tests protect:
//   false negative -> one wasted confirmation email
//   false positive -> a real person cannot register at all
// So every ambiguous shape must resolve to FALSE.
describe("isExistingAccountSignUp", () => {
  it("detects GoTrue's obfuscated duplicate (identities: [])", () => {
    expect(
      isExistingAccountSignUp({
        user: { identities: [], id: "00000000-0000-0000-0000-000000000000" },
      } as never),
    ).toBe(true);
  });

  it("treats a genuine sign-up as new", () => {
    expect(
      isExistingAccountSignUp({
        user: { identities: [{ provider: "email" }] },
      } as never),
    ).toBe(false);
  });

  it("does NOT treat a missing identities field as a duplicate", () => {
    // An older or future GoTrue could omit the field. Reading an omission as
    // "already registered" would block legitimate registrations outright.
    expect(isExistingAccountSignUp({ user: {} } as never)).toBe(false);
    expect(isExistingAccountSignUp({ user: { identities: undefined } } as never)).toBe(
      false,
    );
    expect(isExistingAccountSignUp({ user: { identities: null } } as never)).toBe(false);
  });

  it("does NOT treat a non-array identities value as a duplicate", () => {
    expect(isExistingAccountSignUp({ user: { identities: {} } } as never)).toBe(false);
    expect(isExistingAccountSignUp({ user: { identities: "" } } as never)).toBe(false);
    expect(isExistingAccountSignUp({ user: { identities: 0 } } as never)).toBe(false);
  });

  it("is safe on absent/empty responses", () => {
    expect(isExistingAccountSignUp(null)).toBe(false);
    expect(isExistingAccountSignUp({} as never)).toBe(false);
    expect(isExistingAccountSignUp({ user: null })).toBe(false);
  });
});
