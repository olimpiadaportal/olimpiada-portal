// The parent phone is OPTIONAL on mobile too (Apple rejection, 2026-08-31,
// Guideline 5.1.1(v): an app may not REQUIRE personal information that its core
// functionality does not need).
//
// THE BUG THIS PINS. `composeE164` used to return `+${dial}${digits}`
// unconditionally, so an untouched field emitted "" but a field the user typed
// into and then CLEARED emitted a bare "+994". Register's client check then saw
// a non-empty string that fails E164_RE and reported "enter a valid phone
// number" — an optional field that becomes un-leavable the moment it is
// touched, which is the rejection all over again. Emptiness has to be
// representable.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Two stubs, both so a PURE function can be reached without booting the app:
//  - `lucide-react-native` ships untranspiled ESM and is NOT in jest-expo's
//    transformIgnorePatterns, so requiring the component tree would die on its
//    `export` syntax before a single assertion ran;
//  - PhoneField reads the locale catalogue (the "(optional)" label suffix),
//    which reaches the Supabase client at module load — same stub api.test.ts
//    uses. Nothing here renders; only `composeE164` is exercised.
jest.mock("lucide-react-native", () => ({}), { virtual: true });
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { composeE164, E164_RE } from "@/components/PhoneField";

describe("composeE164", () => {
  it("returns the empty string when there is no national number", () => {
    expect(composeE164("994", "")).toBe("");
  });

  it("returns the empty string for separators-only input, not a bare dial code", () => {
    expect(composeE164("994", "   ")).toBe("");
    expect(composeE164("994", "0")).toBe("");
  });

  it("still composes a real number", () => {
    expect(composeE164("994", "50 123 45 67")).toBe("+994501234567");
  });

  it("still strips the national trunk zero", () => {
    expect(composeE164("994", "050 123 45 67")).toBe("+994501234567");
  });

  it("emits something E164_RE accepts, so a filled field still passes", () => {
    expect(E164_RE.test(composeE164("994", "501234567"))).toBe(true);
  });

  it("emits something E164_RE REJECTS for a partial number", () => {
    // Optional is not unvalidated — a half-typed number must still be caught.
    expect(E164_RE.test(composeE164("994", "50"))).toBe(false);
  });
});

const REGISTER = readFileSync(
  resolve(__dirname, "..", "src", "app", "(public)", "register.tsx"),
  "utf8",
);

describe("register screen", () => {
  it("only validates the phone when one was actually entered", () => {
    // The regression is a one-character edit away: dropping the `phone &&`
    // guard restores a mandatory field and re-earns the rejection.
    expect(REGISTER).toContain("if (phone && !E164_RE.test(phone))");
    expect(REGISTER).not.toContain("if (!E164_RE.test(phone))");
  });
});
