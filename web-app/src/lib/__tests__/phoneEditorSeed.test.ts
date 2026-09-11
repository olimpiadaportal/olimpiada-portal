// OPENING THE PROFILE PHONE EDITOR AND PRESSING SAVE MUST NOT DELETE THE NUMBER.
//
// THE DEFECT (2026-09-10, data loss, WEB rail). `PhoneField` seeded itself with
// a bare `splitE164(initialE164 ?? "")`. When libphonenumber-js could not read a
// stored value, that split came back with an EMPTY national part — so the
// editor opened blank over a number that was on file. An empty submit is a
// deliberate CLEAR (the phone became OPTIONAL on 2026-08-31 for Apple Guideline
// 5.1.1(v), and the server writes NULL), so a parent who opened the editor to
// CHECK their number and pressed Save lost it, silently, with a success message.
//
// The identical defect was found and fixed on the MOBILE rail in the same round
// (`phoneEditorSeed`); the fix was not carried across. Web is the rail that
// charges cards, so it is the one where a wrong number costs money.
//
// WHY THE EXISTING SUITE COULD NOT CATCH IT. `phoneE164.test.ts` asserts
// "saving without an edit writes back the identical string" by iterating
// PHONE_MATRIX — which is, by construction, a list of numbers the library reads
// correctly. Every row round-trips, so the assertion passes on the broken seed
// too. A test that can only be fed inputs on the happy path cannot fail for the
// reason it exists.
//
// SO THIS FILE FEEDS IT THE OTHER KIND. The cases below are stored values that
// libphonenumber-js CANNOT read, cannot round-trip, or reads as a different
// number — including the real shape found in production (one AZ row of 15
// digits that parses but fails isPossible()). The invariant is a PROPERTY, not
// a table: whatever the split does, the field must never be blank over a stored
// value, and the pair must always agree. That holds under any metadata revision,
// which a hard-coded "Russia falls back to a draft" would not.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { composeE164, countryFor, applyPhoneEdit } from "@/lib/phoneE164";
import { phoneEditorSeed } from "@/lib/phoneEditor";

/** Exactly what PhoneField composes on the next keystroke. */
const recompose = (v: { iso2: string; national: string }) =>
  composeE164(countryFor(v.iso2).dial, v.national);

// Stored values chosen so the library is NOT on its happy path. Each is a
// plausible `profiles.phone` written by an older build of this app.
const UNREADABLE = [
  // The real production shape: AZ, 15 characters, parses but isPossible() false.
  // One row on production carried this on 2026-09-10.
  "+994501234567890",
  // Too short to be any plan's national number, but E164_RE-shaped.
  "+9945012345",
  // A plan the metadata knows with a length it does not.
  "+3900000000000",
];

// OUT OF CONTRACT, ON PURPOSE. `phoneEditorSeed` documents `stored` as
// "profiles.phone as the profile reports it: an E.164 string, or null", and
// chk_profiles_phone_e164 makes a value without a leading "+" unreachable. Such
// an input cannot satisfy BOTH invariants at once — preserving every digit means
// showing "+994…", which recomposes to "+994…" and so cannot equal a stored
// "994…". The safety half (never blank, no digit lost) must still hold, because
// that is what stops a Save from deleting the number; the agreement half is only
// promised for values the column can actually hold.
const OUT_OF_CONTRACT = ["994501234567"];

describe("the web phone editor never opens blank over a stored number", () => {
  // The safety property, held for EVERY stored shape including the ones the
  // column could not hold. This is the one that stops Save deleting a number.
  //
  // "Not blank" is asserted on the NATIONAL part alone, deliberately. Digits
  // legitimately live in two places — the country chip holds the dial code and
  // the input holds the rest — so a seed for "+3900000000000" shows Italy in
  // the chip and "00000000000" in the field, and no digit is lost. Comparing
  // the field's digits against the whole stored number would fail that correct
  // behaviour. Digit preservation is what the recompose test below proves; what
  // matters HERE is only that the input is never empty over a stored value,
  // because an empty submit is the delete.
  it.each([...UNREADABLE, ...OUT_OF_CONTRACT])("keeps %s on screen", (stored) => {
    expect(phoneEditorSeed(stored).value.national).not.toBe("");
  });

  it.each([...UNREADABLE, ...OUT_OF_CONTRACT])(
    "submits %s verbatim when nothing is edited",
    (stored) => {
      expect(phoneEditorSeed(stored).e164).toBe(stored.trim());
    },
  );

  it.each(UNREADABLE)("keeps both halves of the seed in agreement for %s", (stored) => {
    // The whole point of returning a pair: what the parent sees must recompose
    // into what the section submits. If these ever diverge, saving without an
    // edit rewrites the number to a different one.
    const seed = phoneEditorSeed(stored);
    expect(recompose(seed.value)).toBe(seed.e164);
  });
});

describe("the optional-phone contract still works both ways", () => {
  it("opens empty only when there is genuinely no number", () => {
    for (const empty of [null, undefined, "", "   "]) {
      const seed = phoneEditorSeed(empty);
      expect(seed.value.national).toBe("");
      expect(seed.e164).toBe("");
    }
  });

  it("lets the parent clear a seeded field by hand", () => {
    // 5.1.1(v): the field is optional, so emptying it deliberately must submit
    // "" and reach the server as NULL.
    const seed = phoneEditorSeed("+994501234567");
    const cleared = applyPhoneEdit({ raw: "", prev: seed.value, focused: true });
    expect(cleared.national).toBe("");
    expect(recompose(cleared)).toBe("");
  });

  it("refuses an empty write the parent did not make", () => {
    // A browser autofill writes into an UNFOCUSED input when a dataset is picked
    // in a sibling field. That write carries no information, so the only thing
    // it can do is destroy some.
    const seed = phoneEditorSeed("+994501234567");
    const written = applyPhoneEdit({ raw: "", prev: seed.value, focused: false });
    expect(written.national).toBe(seed.value.national);
  });
});

describe("the two rails cannot drift apart", () => {
  it("uses the verified seed, not a bare splitE164", () => {
    // Source-level, because the defect was a one-line call site: a future edit
    // that reverts to splitE164 reintroduces the data loss with every test green.
    const src = readSource("src/components/PhoneField.tsx");
    expect(src).toContain("phoneEditorSeed(initialE164)");
    expect(src).not.toMatch(/const seed = useMemo\(\(\) => splitE164\(/);
  });
});

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
    .split("\r\n")
    .join("\n");
}
