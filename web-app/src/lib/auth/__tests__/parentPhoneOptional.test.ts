// The parent phone is OPTIONAL — and the shape of "no phone" is NULL, not "".
//
// WHY THIS EXISTS. Apple rejected the iOS build on 2026-08-31 under Guideline
// 5.1.1(v): an app may not REQUIRE personal information that its core
// functionality does not need. Making the field optional is a one-word change
// in four places, which is exactly why it is easy to half-do:
//
//  1. "Optional" is not "unvalidated". A number that IS supplied must still be
//     E.164 — chk_profiles_phone_e164 constrains the SHAPE of a non-null value,
//     so a malformed string is refused by the database, not accepted as junk.
//  2. Empty must normalize to NULL. The column is nullable and the constraint
//     permits NULL, but "" FAILS the regex. Both registration call sites write
//     the validator's value straight into profiles.phone, so returning "" would
//     turn "I left it blank" into a constraint violation at write time — a bug
//     no click-through finds, because it only fires on the empty path.
//  3. Clearing has to work too. A parent who gave a number before the rule
//     changed must be able to remove it, or the field is optional only for
//     accounts created after the fix — which is not what the guideline says.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateParentRegistration } from "@/lib/auth/parentValidation";

// `server-only` is a BUILD-TIME guard with no runtime behaviour and no package
// to resolve under Vite. Stubbing the marker keeps the guard in the production
// file instead of tempting anyone to delete it to make a test pass.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: async () => {} }));

const { updateOwnPhoneCore } = await import("@/lib/auth/phoneCore");

const PROFILE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const VALID = "+994501234567";

const base = {
  firstName: "Aysel",
  lastName: "Məmmədova",
  email: "aysel@example.com",
  password: "Şəkil!2026",
};

describe("validateParentRegistration — the phone is optional", () => {
  it("accepts an EMPTY phone and returns null (never the empty string)", () => {
    const res = validateParentRegistration({ ...base, phone: "" });
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.phone).toBeNull();
  });

  it("accepts an OMITTED phone", () => {
    const res = validateParentRegistration(base);
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.phone).toBeNull();
  });

  it("normalizes a whitespace-only phone to null, not to \"\"", () => {
    // The failure this pins: `"   ".trim()` is "", and "" fails
    // chk_profiles_phone_e164. Only null is a legal "no number".
    const res = validateParentRegistration({ ...base, phone: "   \t \n " });
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.phone).toBeNull();
    expect(res.ok === true && res.phone).not.toBe("");
  });

  it("still accepts a valid E.164 number, unchanged", () => {
    const res = validateParentRegistration({ ...base, phone: ` ${VALID} ` });
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.phone).toBe(VALID);
  });

  it("still REJECTS a phone that is present but malformed", () => {
    // Optional does not mean unvalidated: every one of these would violate the
    // DB check constraint and fail the write.
    for (const bad of [
      "0501234567", // no country code
      "+0501234567", // leading zero after the +
      "994501234567", // missing the +
      "+994 50 123 45 67", // registration composes E.164; separators are not stripped here
      "+99450abc567", // letters
      "+12345", // too short for the pattern
      "+99450123456789012", // over PHONE_MAX
    ]) {
      const res = validateParentRegistration({ ...base, phone: bad });
      expect(res.ok, `expected "${bad}" to be rejected`).toBe(false);
      expect(res.ok === false && res.errorKey).toBe("parent.err.phone");
    }
  });

  it("does not let an optional phone mask the other required fields", () => {
    expect(
      validateParentRegistration({ ...base, firstName: " ", phone: "" }).ok,
    ).toBe(false);
    expect(
      validateParentRegistration({ ...base, email: "nope", phone: "" }).ok,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------

type Patch = Record<string, unknown>;
const patches: Patch[] = [];
let updateError: { code?: string } | null = null;

function fakeClient() {
  return {
    from: () => ({
      update: (patch: Patch) => {
        patches.push(patch);
        return { eq: async () => ({ error: updateError }) };
      },
    }),
  } as never;
}

describe("updateOwnPhoneCore — a parent can clear a number they gave", () => {
  beforeEach(() => {
    patches.length = 0;
    updateError = null;
  });

  it("writes NULL for an empty submission instead of rejecting it", async () => {
    const res = await updateOwnPhoneCore(fakeClient(), PROFILE, "");
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.phone).toBeNull();
    expect(patches).toEqual([{ phone: null }]);
  });

  it("treats a whitespace-only submission as a clear, not as \"\"", async () => {
    const res = await updateOwnPhoneCore(fakeClient(), PROFILE, "   ");
    expect(res.ok).toBe(true);
    expect(patches[0]).toEqual({ phone: null });
    expect(patches[0].phone).not.toBe("");
  });

  it("still stores a valid number, separators and all", async () => {
    const res = await updateOwnPhoneCore(fakeClient(), PROFILE, "+994 50 123-45-67");
    expect(res.ok === true && res.phone).toBe(VALID);
    expect(patches).toEqual([{ phone: VALID }]);
  });

  it("still refuses a malformed number and writes nothing", async () => {
    const res = await updateOwnPhoneCore(fakeClient(), PROFILE, "0501234567");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errorKey).toBe("parent.err.phone");
    expect(patches).toEqual([]);
  });

  it("returns the generic key (never a Postgres message) when the write fails", async () => {
    updateError = { code: "23514" };
    const res = await updateOwnPhoneCore(fakeClient(), PROFILE, VALID);
    expect(res.ok === false && res.errorKey).toBe("profile.err.updateFailed");
  });
});

// The label suffix the optional field renders. A key nobody translated shows
// the parent the literal string "field.optional"; tsc cannot see that.
describe("i18n", () => {
  it("ships field.optional in all three locales", async () => {
    const { messages } = await import("@/i18n/messages");
    for (const locale of ["az", "en", "ru"] as const) {
      const v = messages[locale]["field.optional"];
      expect(typeof v, `${locale} field.optional`).toBe("string");
      expect(v.trim().length, `${locale} field.optional`).toBeGreaterThan(0);
    }
  });
});
