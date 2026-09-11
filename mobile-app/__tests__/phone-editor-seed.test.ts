// OPENING THE PHONE EDITOR AND PRESSING SAVE MUST NOT DELETE THE NUMBER.
//
// THE DEFECT (2026-09-10, data loss). `PhoneSection` opened its editor from
// `usePhoneValue()` with no argument and `useState("")` for the composed value,
// so the field was EMPTY however long the parent's number had been on file.
// That was harmless right up until 2026-08-31, when the phone became OPTIONAL
// for Apple Guideline 5.1.1(v) and an empty submit stopped meaning "no change"
// and started meaning "delete it" (the BFF writes NULL). From that day on, a
// parent who opened the editor to CHECK their number and pressed Save lost it —
// silently, with the success message shown.
//
// WHAT THIS FILE PINS, in the order the parent meets it:
//   1. the editor opens on the STORED number, so Save-with-no-edit resubmits
//      exactly what was already there;
//   2. the seed's two halves agree — the field the parent sees and the string
//      the section submits are the same number — for every numbering plan,
//      including the ones whose trunk-prefix rules are wrong today;
//   3. clearing the field BY HAND still submits "", because the optional field
//      has to stay two-way (5.1.1(v) again);
//   4. an empty write the parent did NOT make (platform autofill) leaves the
//      stored number alone.
//
// AND IT PINS A PROPERTY, NOT A TABLE. Point 2 is checked by recomposing the
// split and comparing — never by asserting which branch a given country takes.
// Which digits survive into E.164 is libphonenumber-js's decision now, and the
// metadata behind it is revised continuously; a test that hard-coded "Russia
// falls back to a draft" would start failing the day the answer improved, which
// is exactly backwards. The invariant holds under any split that is correct and
// under any split that is not.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// No component is imported and nothing is mocked: the seed and everything it
// leans on are PURE and live in @/lib/phoneE164, which is where the numbering
// -plan rules went when they became the library's job. Reaching through
// @/components/PhoneField instead would drag in untranspiled lucide ESM and the
// locale catalogue's Supabase client for no gain.
import {
  applyPhoneEdit,
  composeE164,
  countryFor,
  E164_RE,
  EMPTY_PHONE,
  type PhoneValue,
} from "@/lib/phoneE164";
import { phoneEditorSeed } from "@/features/profile/phoneEditor";

/** Repo file as text, newline-normalised (this is a Windows checkout). */
const read = (p: string): string =>
  readFileSync(resolve(__dirname, "..", p), "utf8").split("\r\n").join("\n");

/** What the section submits for a given field value — its `phone` state. */
const compose = (v: PhoneValue): string => composeE164(countryFor(v.iso2).dial, v.national);

/**
 * Real numbers from plans that disagree about trunk prefixes — the axis every
 * previous attempt at this code got wrong. Italy and San Marino keep a leading
 * zero that IS part of the number; Russia's trunk digit is "8" and collides
 * with the St Petersburg area code 812; the NANP's is "1"; Hungary dials "06".
 */
const STORED = [
  "+994501234567", // AZ mobile
  "+994124987654", // AZ, Baku landline
  "+905321112233", // TR mobile
  "+390612345678", // IT, Rome — the leading 0 belongs to the number
  "+3780549886377", // SM — likewise
  "+79261234567", // RU mobile
  "+78121234567", // RU, St Petersburg — area code 812 under a trunk digit of 8
  "+14155551234", // US
  "+442079460958", // GB, London
  "+36201234567", // HU mobile
  "+2250712345678", // CI — 10 digits, written with their leading 0
];

describe("opening the editor and saving without an edit", () => {
  it("resubmits the stored number instead of clearing it", () => {
    // THE REPORTED BUG, at its narrowest. Before the fix this was "".
    const seed = phoneEditorSeed("+994501234567");
    expect(seed.e164).toBe("+994501234567");
    expect(seed.value.national).not.toBe("");
    expect(E164_RE.test(seed.e164)).toBe(true);
  });

  it("shows the parent their own number, not a default country and a blank", () => {
    const seed = phoneEditorSeed("+994501234567");
    expect(seed.value.iso2).toBe("AZ");
    expect(seed.value.national).toBe("501234567");
  });

  it("submits the stored number verbatim for every plan", () => {
    for (const stored of STORED) {
      expect(`${stored} -> ${phoneEditorSeed(stored).e164}`).toBe(`${stored} -> ${stored}`);
    }
  });

  it("keeps the field and the submitted value in agreement", () => {
    // The half that makes the assertion above true rather than lucky: whatever
    // the parent sees must recompose into what the section sends. A seed that
    // displayed one number and submitted another would be the worse bug — a
    // well-formed, silently DIFFERENT number, which nothing downstream rejects.
    for (const stored of STORED) {
      const seed = phoneEditorSeed(stored);
      expect(`${stored} -> ${compose(seed.value)}`).toBe(`${stored} -> ${seed.e164}`);
    }
  });

  it("keeps the whole number on screen when no split survives", () => {
    // The fallback, exercised on a value nothing can parse. It has to leave the
    // parent looking at their own digits — an EMPTY field over a stored number
    // is the data loss this file is about, and `splitE164` answers EMPTY_PHONE
    // for anything it cannot read. Recomposing a draft returns it verbatim, so
    // the no-op survives even here.
    const unreadable = "+99999999999999";
    const seed = phoneEditorSeed(unreadable);
    expect(seed.e164).toBe(unreadable);
    expect(seed.value.national).toContain("99999999999999");
    expect(compose(seed.value)).toBe(unreadable);
  });

  it("still opens empty when the account has no number at all", () => {
    // The add-phone path is untouched: nothing to mirror, nothing submitted,
    // and the server keeps reading "" as the deliberate clear it always did.
    for (const nothing of [null, undefined, "", "   "]) {
      const seed = phoneEditorSeed(nothing);
      expect(seed.e164).toBe("");
      expect(seed.value).toEqual(EMPTY_PHONE);
      expect(compose(seed.value)).toBe("");
    }
  });
});

describe("the clear stays possible, because the phone is optional", () => {
  it("lets the parent empty a seeded field by hand", () => {
    // Apple Guideline 5.1.1(v): a parent who once gave a number must be able to
    // take it back. Seeding the editor must not turn the field one-way — so the
    // clear is exercised FROM a seeded value, which is the state this change
    // introduces.
    const seed = phoneEditorSeed("+994501234567");
    const cleared = applyPhoneEdit({ raw: "", prev: seed.value, focused: true });
    expect(cleared.national).toBe("");
    expect(compose(cleared)).toBe("");
  });

  it("refuses an empty write the parent did not make", () => {
    // The other side of the same coin, and newly protective: before the seed an
    // autofill blank landed on an already-empty field and did nothing visible.
    // Now the field holds the stored number, so the refusal inside
    // applyPhoneEdit is what keeps it there.
    const seed = phoneEditorSeed("+994501234567");
    const written = applyPhoneEdit({ raw: "", prev: seed.value, focused: false });
    expect(written).toEqual(seed.value);
    expect(compose(written)).toBe("+994501234567");
  });
});

describe("the profile section is wired to the seed", () => {
  const src = read("src/features/profile/sections.tsx");

  it("seeds the editor from the stored number", () => {
    expect(src).toMatch(/phoneEditorSeed\(current\)/);
    expect(src).toMatch(/usePhoneValue\(seed\.value\)/);
    expect(src).toMatch(/useState\(seed\.e164\)/);
  });

  it("no longer starts the editor from nothing", () => {
    // The two initialisers that were the defect.
    expect(src).not.toMatch(/usePhoneValue\(\)/);
    expect(src).not.toMatch(/const \[phone, setPhone\] = useState\(""\)/);
  });

  it("keeps mirroring the stored value until the parent edits", () => {
    // The guard flag is what stops the mirror from landing on top of typing —
    // and what makes Cancel restore the stored number.
    expect(src).toMatch(/if \(edited\) return;/);
    expect(src).toMatch(/setEdited\(true\)/);
  });

  it("describes what the code does now, in the section's own header", () => {
    // The header that stood here asserted a mandatory phone and no way to clear
    // — both false since 2026-08-31 — and that is what made an empty editor
    // read as intentional for as long as it did. Matched on the old sentence's
    // own words, not on the claims themselves: the new header QUOTES both
    // claims in order to say they are wrong, and a test that grepped for the
    // claim would forbid the correction along with the error.
    expect(src).not.toMatch(/so this exists to fill legacy nulls/);
    expect(src).toMatch(/THE PHONE IS OPTIONAL \(Apple Guideline 5\.1\.1\(v\)/);
    expect(src).toMatch(/still submits "" and still deletes it/);
  });
});
