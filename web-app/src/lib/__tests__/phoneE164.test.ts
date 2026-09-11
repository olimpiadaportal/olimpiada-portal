// THE WEB RAIL IS THE ONE THAT CHARGES CARDS.
//
// Until 2026-09-10 this component composed a parent's phone number with its own
// `sanitizeNational`, whose `replace(/^0+/, "")` stripped every leading zero
// from every country. The mobile app had already moved past that, so the same
// parent entering the same number got a DIFFERENT stored number depending on
// which surface they used — and the surface that takes payment was the one
// still guessing.
//
// This suite pins three things:
//
//   1. the shared input matrix, row by row, against the real parser. The same
//      table is run by mobile-app/__tests__/phone-e164.test.ts, so "the two
//      rails agree" is a fact about one expectation rather than two lists
//      somebody has to keep in step;
//   2. the twin files — src/lib/phoneE164.ts, src/lib/countries.ts and the
//      matrix itself — are BYTE-IDENTICAL to the mobile copies. Assertion (1)
//      only proves the two rails agree if they are running the same code;
//   3. that no hand-rolled numbering plan has crept back into either app.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  E164_RE,
  EMPTY_PHONE,
  PHONE_MAX_DIGITS,
  applyPhoneEdit,
  capPhoneDigits,
  composeE164,
  countryFor,
  parseToE164,
  splitE164,
  type PhoneValue,
} from "@/lib/phoneE164";
import { PHONE_MATRIX } from "./phoneMatrix";

const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), "utf8");

/** What the hidden `phone` input would carry after one edit lands. */
function submitted(raw: string, prev: PhoneValue): string {
  const next = applyPhoneEdit({ raw, prev, focused: false });
  return composeE164(countryFor(next.iso2).dial, next.national);
}

/** A field whose chip already shows `dial` and whose number is empty. */
const COUNTRY_BY_DIAL: Record<string, string> = {
  "1": "US",
  "7": "RU",
  "36": "HU",
  "39": "IT",
  "44": "GB",
  "49": "DE",
  "90": "TR",
  "225": "CI",
  "229": "BJ",
  "370": "LT",
  "375": "BY",
  "378": "SM",
  "994": "AZ",
};
function seedCountry(dial: string): PhoneValue {
  const iso2 = COUNTRY_BY_DIAL[dial];
  if (!iso2) throw new Error(`no country in the picker dials +${dial}`);
  return { iso2, national: "" };
}

// ---------------------------------------------------------------------------
// 1. The matrix
// ---------------------------------------------------------------------------

describe("parseToE164 over the shared input matrix", () => {
  for (const row of PHONE_MATRIX) {
    it(`${JSON.stringify(row.input)} (+${row.dial}) — ${row.why}`, () => {
      expect(`${row.input} -> ${parseToE164(row.input, row.dial)}`).toBe(
        `${row.input} -> ${row.e164}`,
      );
    });
  }

  it("composes what it parses, for every row that is a number", () => {
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      expect(`${row.input} -> ${composeE164(row.dial, row.input)}`).toBe(
        `${row.input} -> ${row.e164}`,
      );
    }
  });

  it("is idempotent: feeding the output back in changes nothing", () => {
    // The composed value is recomputed on every keystroke, so a rule that
    // fires twice is a rule that eats a digit the second time.
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      expect(`${row.e164} -> ${parseToE164(row.e164, row.dial)}`).toBe(`${row.e164} -> ${row.e164}`);
      expect(`${row.e164} -> ${composeE164(row.dial, row.e164)}`).toBe(`${row.e164} -> ${row.e164}`);
    }
  });

  it("emits E.164 that parentValidation and chk_profiles_phone_e164 accept", () => {
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      expect(`${row.input} valid=${E164_RE.test(row.e164)}`).toBe(`${row.input} valid=true`);
    }
  });

  it("never emits an E164_RE-shaped string for a number it could not read", () => {
    // A draft is non-empty — a number on screen must never be read as "no
    // number given", which is what makes an OPTIONAL field leavable — but it
    // never passes for finished, so the browser's validity check, the server's
    // PHONE_RE and the DB constraint all refuse it alike.
    for (const row of PHONE_MATRIX) {
      if (row.e164 !== null) continue;
      const composed = composeE164(row.dial, row.input);
      expect(`${JSON.stringify(row.input)} -> ${E164_RE.test(composed)}`).toBe(
        `${JSON.stringify(row.input)} -> false`,
      );
      expect(`${JSON.stringify(row.input)} -> ${parseToE164(composed, row.dial)}`).toBe(
        `${JSON.stringify(row.input)} -> null`,
      );
    }
  });

  it("reaches the hidden input through the field's own sanitiser", () => {
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      expect(`${row.input} -> ${submitted(row.input, seedCountry(row.dial))}`).toBe(
        `${row.input} -> ${row.e164}`,
      );
    }
  });

  it("round-trips a stored number back into the edit form and out again", () => {
    // The profile card opens on `initialE164`; saving without an edit must
    // write back the identical string, not a re-guessed one.
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      const value = splitE164(row.e164);
      expect(`${row.e164} -> ${composeE164(countryFor(value.iso2).dial, value.national)}`).toBe(
        `${row.e164} -> ${row.e164}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The rows the old web sanitiser got wrong
// ---------------------------------------------------------------------------

describe("the numbers replace(/^0+/, '') destroyed", () => {
  it("Italy keeps the zero that IS its area code", () => {
    expect(submitted("06 1234 5678", seedCountry("39"))).toBe("+390612345678");
    expect(submitted("+39 02 1234 5678", seedCountry("39"))).toBe("+390212345678");
  });

  it("San Marino, Benin and Côte d'Ivoire keep theirs", () => {
    expect(submitted("0549 886377", seedCountry("378"))).toBe("+3780549886377");
    expect(submitted("01 23 45 67", seedCountry("229"))).toBe("+22901234567");
    expect(submitted("07 12 34 56 78", seedCountry("225"))).toBe("+2250712345678");
  });

  it("and a plan whose trunk digit is not zero still loses it", () => {
    expect(submitted("8 926 123 45 67", seedCountry("7"))).toBe("+79261234567");
    expect(submitted("8 612 34567", seedCountry("370"))).toBe("+37061234567");
    expect(submitted("06 20 123 4567", seedCountry("36"))).toBe("+36201234567");
    expect(submitted("1 415 555 1234", seedCountry("1"))).toBe("+14155551234");
  });

  it("without eating an area code that merely begins with the trunk digit", () => {
    expect(submitted("+7 812 123 45 67", seedCountry("7"))).toBe("+78121234567");
  });

  it("and it never ate a second zero either", () => {
    // The old rule was `/^0+/` — EVERY leading zero, not one prefix. Belarus
    // dials "8" and then the number's own "0" begins the operator code.
    expect(submitted("8 029 123 45 67", seedCountry("375"))).toBe("+375291234567");
  });
});

// ---------------------------------------------------------------------------
// 3. The cap counts digits
// ---------------------------------------------------------------------------

describe("the length cap", () => {
  it("comes from the library's own maximum national length", () => {
    expect(PHONE_MAX_DIGITS).toBeGreaterThanOrEqual(15);
    expect(PHONE_MAX_DIGITS).toBeLessThan(20);
  });

  it("charges digits to the budget and separators to nothing", () => {
    const german = "0151 1234 5678"; // 11 digits, 14 characters
    expect(capPhoneDigits(german)).toBe(german);
    expect(submitted(german, seedCountry("49"))).toBe("+4915112345678");
  });

  it("still truncates an absurd paste", () => {
    expect(capPhoneDigits("1".repeat(40))).toHaveLength(PHONE_MAX_DIGITS);
  });
});

// ---------------------------------------------------------------------------
// 4. The optional field stays leavable and stays two-way
// ---------------------------------------------------------------------------

describe("the field is optional (Apple 5.1.1(v))", () => {
  it("an untouched field submits nothing at all, not a bare dial code", () => {
    expect(composeE164("994", "")).toBe("");
    expect(composeE164("994", "   ")).toBe("");
    expect(composeE164("994", "0")).toBe("");
  });

  it("a parent can clear a number they gave earlier", () => {
    const seeded = splitE164("+994501234567");
    const cleared = applyPhoneEdit({ raw: "", prev: seeded, focused: true });
    expect(composeE164(countryFor(cleared.iso2).dial, cleared.national)).toBe("");
  });

  it("but a blank the parent did not type is refused", () => {
    // Browser autofill writes into an UNFOCUSED input when a dataset is chosen
    // in a sibling field, and a dataset with no phone writes "".
    const seeded = splitE164("+994501234567");
    expect(applyPhoneEdit({ raw: "", prev: seeded, focused: false })).toEqual(seeded);
  });

  it("opens empty when the account has no number", () => {
    expect(splitE164("")).toEqual(EMPTY_PHONE);
    expect(splitE164("not a number")).toEqual(EMPTY_PHONE);
  });
});

// ---------------------------------------------------------------------------
// 5. The two rails are running the same code
// ---------------------------------------------------------------------------

describe("web and mobile share one implementation, not two copies of one idea", () => {
  const twin = (webRel: string, mobileRel: string, what: string) => {
    it(`${what} is the same file in both apps`, () => {
      const web = read(webRel);
      const mobile = readFileSync(resolve(process.cwd(), mobileRel), "utf8");
      // Byte-identical, header included. The pair used to be "kept in sync by
      // hand", which is exactly how the two rails came to disagree about a
      // parent's phone number in the first place.
      expect(mobile).toBe(web);
    });
  };

  twin("src/lib/phoneE164.ts", "../mobile-app/src/lib/phoneE164.ts", "the E.164 core");
  twin("src/lib/countries.ts", "../mobile-app/src/lib/countries.ts", "the country list");
  twin(
    "src/lib/__tests__/phoneMatrix.ts",
    "../mobile-app/__tests__/phoneMatrix.ts",
    "the input matrix",
  );
});

// ---------------------------------------------------------------------------
// 6. No hand-rolled numbering plan may come back
// ---------------------------------------------------------------------------

describe("the guesswork is gone and stays gone", () => {
  /** A file with its comments removed, so prose ABOUT a banned pattern is not
   *  mistaken for the pattern itself. */
  const codeOf = (rel: string) =>
    read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");

  it("countries.ts is a picker list and nothing more", () => {
    const src = read("src/lib/countries.ts");
    for (const gone of ["TRUNK_PREFIX_BY_DIAL", "trunkPrefixForDial", "stripTrunkPrefix"]) {
      expect(`${gone}: ${src.includes(gone)}`).toBe(`${gone}: false`);
    }
    expect(src).toContain("export const COUNTRIES");
  });

  it("nothing strips a leading zero from a phone number by hand", () => {
    for (const rel of ["src/lib/phoneE164.ts", "src/components/PhoneField.tsx"]) {
      expect(`${rel}: ${/replace\(\/\^0\+\//.test(codeOf(rel))}`).toBe(`${rel}: false`);
    }
  });

  it("the field composes through the shared core rather than a local rule", () => {
    const field = read("src/components/PhoneField.tsx");
    expect(field).toContain('from "@/lib/phoneE164"');
    expect(field).toContain("composeE164(");
    // The old pair of client rules: a 4–12 digit national check (a numbering
    // plan claim, and wrong at both ends) and a hand-rolled sanitiser. Checked
    // against the CODE — the header names them both to say what went wrong.
    const code = codeOf("src/components/PhoneField.tsx");
    for (const gone of ["NATIONAL_RE", "sanitizeNational"]) {
      expect(`${gone}: ${code.includes(gone)}`).toBe(`${gone}: false`);
    }
  });

  it("the core asks libphonenumber-js rather than a table", () => {
    const core = read("src/lib/phoneE164.ts");
    expect(core).toContain('from "libphonenumber-js"');
    expect(core).toContain("parsePhoneNumberFromString");
  });

  it("both apps declare the dependency", () => {
    for (const rel of ["package.json", "../mobile-app/package.json"]) {
      const pkg = JSON.parse(readFileSync(resolve(process.cwd(), rel), "utf8")) as {
        dependencies?: Record<string, string>;
      };
      expect(`${rel}: ${Boolean(pkg.dependencies?.["libphonenumber-js"])}`).toBe(`${rel}: true`);
    }
  });
});
