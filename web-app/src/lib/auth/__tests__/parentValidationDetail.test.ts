import { describe, it, expect } from "vitest";
import { validateParentRegistration } from "@/lib/auth/parentValidation";
import { checkNewPassword } from "@/lib/auth/passwordPolicy";

// What this file protects:
//
//   1. THE FROZEN WIRE. `errorKey` is what the mobile BFF
//      (/api/mobile/v1/auth/register) hands back RAW to a shipped binary that
//      translates it from a catalogue baked into that build. The 1.16.0 app in
//      the stores cannot be updated on this server's clock, so the day one of
//      these five values moves, a parent sees a raw key. The granular reporting
//      added alongside it had to be ADDITIVE, and this pins that it was.
//   2. THE GRANULARITY ITSELF. "the password is weak" sends someone hunting for
//      the wrong fix; `detailKey` names the one rule that failed, and `field`
//      names the input it belongs to.

const base = {
  firstName: "Aysel",
  lastName: "Məmmədova",
  email: "aysel@example.com",
  phone: "+994501234567",
  password: "Şəkil!2026",
};

describe("the legacy errorKey contract is unchanged", () => {
  // Written as a table on purpose: the point is the exact historical mapping,
  // so a change to any row has to be made deliberately, row by row.
  const cases: { name: string; input: Partial<typeof base>; errorKey: string }[] = [
    { name: "missing first name", input: { firstName: "  " }, errorKey: "parent.err.required" },
    { name: "missing last name", input: { lastName: "" }, errorKey: "parent.err.required" },
    { name: "malformed email", input: { email: "nope" }, errorKey: "parent.err.email" },
    { name: "malformed phone", input: { phone: "0501234567" }, errorKey: "parent.err.phone" },
    { name: "short password", input: { password: "Ab!" }, errorKey: "parent.err.password" },
    {
      name: "over-long password",
      input: { password: "A!" + "a".repeat(127) },
      errorKey: "parent.err.password",
    },
    {
      name: "no capital letter",
      input: { password: "password1!" },
      errorKey: "parent.err.passwordWeak",
    },
    {
      name: "no special character",
      input: { password: "Password1" },
      errorKey: "parent.err.passwordWeak",
    },
  ];

  for (const c of cases) {
    it(`${c.name} still reports ${c.errorKey}`, () => {
      const res = validateParentRegistration({ ...base, ...c.input });
      expect(res.ok).toBe(false);
      expect(res.ok === false && res.errorKey).toBe(c.errorKey);
    });
  }
});

describe("detailKey names the single unmet rule", () => {
  const cases: { input: Partial<typeof base>; detailKey: string; field: string }[] = [
    {
      input: { firstName: " " },
      detailKey: "parent.err.firstNameRequired",
      field: "firstName",
    },
    { input: { lastName: " " }, detailKey: "parent.err.lastNameRequired", field: "lastName" },
    { input: { email: "nope" }, detailKey: "parent.err.email", field: "email" },
    { input: { phone: "0501234567" }, detailKey: "parent.err.phone", field: "phone" },
    { input: { password: "Ab!" }, detailKey: "parent.err.pwTooShort", field: "password" },
    {
      input: { password: "A!" + "a".repeat(127) },
      detailKey: "parent.err.pwTooLong",
      field: "password",
    },
    {
      input: { password: "password1!" },
      detailKey: "parent.err.pwNeedsUpper",
      field: "password",
    },
    {
      input: { password: "Password1" },
      detailKey: "parent.err.pwNeedsSpecial",
      field: "password",
    },
  ];

  for (const c of cases) {
    it(`${c.field} → ${c.detailKey}`, () => {
      const res = validateParentRegistration({ ...base, ...c.input });
      expect(res.ok).toBe(false);
      expect(res.ok === false && res.detailKey).toBe(c.detailKey);
      expect(res.ok === false && res.field).toBe(c.field);
    });
  }

  it("the two required-name failures share one errorKey but not one detailKey", () => {
    // The whole reason the detail layer exists: parent.err.required reads
    // "enter your email and password", which is wrong for both of these.
    const first = validateParentRegistration({ ...base, firstName: "" });
    const last = validateParentRegistration({ ...base, lastName: "" });
    expect(first.ok === false && first.errorKey).toBe(last.ok === false && last.errorKey);
    expect(first.ok === false && first.detailKey).not.toBe(
      last.ok === false && last.detailKey,
    );
  });
});

describe("passwordProblem mirrors the policy, and only for password failures", () => {
  for (const pw of ["Ab!", "A!" + "a".repeat(127), "password1!", "Password1"]) {
    it(`carries the raw policy code for ${JSON.stringify(pw.slice(0, 12))}`, () => {
      const res = validateParentRegistration({ ...base, password: pw });
      expect(res.ok).toBe(false);
      // The form highlights one row of its requirements checklist from this,
      // so it must be the policy's own answer, not a re-derivation.
      expect(res.ok === false && res.passwordProblem).toBe(checkNewPassword(pw));
    });
  }

  it("is absent when the failure is not about the password", () => {
    const res = validateParentRegistration({ ...base, email: "nope" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.passwordProblem).toBeUndefined();
  });

  it("a valid registration still normalizes and still reports both name parts", () => {
    // registerParent now writes first_name/last_name to profiles alongside
    // display_name (migration 177), so these three must stay consistent.
    const res = validateParentRegistration({
      ...base,
      firstName: "  Aysel ",
      lastName: " Məmmədova  ",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.firstName).toBe("Aysel");
    expect(res.lastName).toBe("Məmmədova");
    expect(res.displayName).toBe("Aysel Məmmədova");
  });
});
