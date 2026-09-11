// THE NUMBERING PLAN IS NOT A TABLE ANYONE MAINTAINS BY HAND.
//
// Two attempts did, and both produced a DIFFERENT, WELL-FORMED number — the
// worst failure mode available, because E164_RE accepts it, the BFF accepts it,
// `chk_profiles_phone_e164` accepts it, and a parent simply has a stranger's
// number on file:
//
//   * `replace(/^0+/, "")` — greedy and country-blind. Right for Azerbaijan,
//     wrong for Italy, whose plan has no trunk prefix at all (Rome's
//     "+39 06 1234 5678" became +39 6 1234 5678), and inert for every plan
//     whose trunk digit is not "0";
//   * a hand-maintained trunk table. It cured Italy and broke Russia: "the
//     trunk prefix of +7 is 8" is true of the trunk prefix and false of the
//     AREA codes beginning with 8, so a pasted "+7 812 123 45 67" was stored as
//     +7 121 234 567. It also defaulted every unlisted plan to "0" — eating a
//     real digit in Benin and San Marino — and left Lithuania and Belarus
//     (trunk "8") unstripped.
//
// libphonenumber-js decides all of it now. What this suite asserts is that the
// app HANDS it the right question and USES its answer: the shared input matrix
// (`./phoneMatrix`, byte-identical to the web app's copy — the web suite pins
// that) plus the field behaviours that surround the parse.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The same two stubs the sibling phone suites use: `lucide-react-native` ships
// untranspiled ESM outside jest-expo's transformIgnorePatterns, and the
// component module reaches the locale catalogue (and through it the Supabase
// client) at import time. Nothing renders here.
jest.mock("lucide-react-native", () => ({}), { virtual: true });
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import {
  applyPhoneEdit,
  composeE164,
  countryFor,
  E164_RE,
  EMPTY_PHONE,
  PHONE_MAX_DIGITS,
  parseToE164,
  splitE164,
  type PhoneValue,
} from "@/components/PhoneField";
import { PHONE_MATRIX } from "./phoneMatrix";

/** What the parent's account actually receives: one edit in, one E.164 out. */
function submitted(raw: string, prev: PhoneValue = EMPTY_PHONE, focused = false): string {
  const next = applyPhoneEdit({ raw, prev, focused });
  return composeE164(countryFor(next.iso2).dial, next.national);
}

const AZ = EMPTY_PHONE.iso2;

// ---------------------------------------------------------------------------
// 1. The shared matrix, row by row
// ---------------------------------------------------------------------------

describe("parseToE164 over the shared input matrix", () => {
  // One assertion per row, each carrying the input in its message, so a failure
  // names the number that broke rather than "expected +39061… got +396…".
  for (const row of PHONE_MATRIX) {
    it(`${JSON.stringify(row.input)} (+${row.dial}) — ${row.why}`, () => {
      expect(`${row.input} -> ${parseToE164(row.input, row.dial)}`).toBe(
        `${row.input} -> ${row.e164}`,
      );
    });
  }

  it("composes what it parses, for every row that is a number", () => {
    // `composeE164` is what the screens actually call; it must not add a rule
    // of its own on top of the parse.
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      expect(`${row.input} -> ${composeE164(row.dial, row.input)}`).toBe(
        `${row.input} -> ${row.e164}`,
      );
    }
  });

  it("is idempotent: feeding the output back in changes nothing", () => {
    // The composed value is recomputed on every keystroke, and an autofilled
    // field is re-read as its own input, so a rule that fires twice is a rule
    // that eats a digit the second time.
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      expect(`${row.e164} -> ${parseToE164(row.e164, row.dial)}`).toBe(
        `${row.e164} -> ${row.e164}`,
      );
      expect(`${row.e164} -> ${composeE164(row.dial, row.e164)}`).toBe(
        `${row.e164} -> ${row.e164}`,
      );
    }
  });

  it("emits E.164 the server and the database accept", () => {
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      expect(`${row.input} valid=${E164_RE.test(row.e164)}`).toBe(`${row.input} valid=true`);
    }
  });

  it("never emits an E164_RE-shaped string for a number it could not read", () => {
    // The half that keeps a half-typed number OUT of the account. A draft is
    // non-empty — a number on screen must never be read as "no number given" —
    // but it never passes for finished, so the client gate, the server's
    // PHONE_RE and chk_profiles_phone_e164 all refuse it in the same way.
    //
    // "050 123 45" is the row that matters. It is two digits short of an
    // Azerbaijani number, and the old composition turned it into
    // "+9945012345" — nine digits behind a real dial code, accepted by every
    // regex in the stack, belonging to nobody. Only a length-aware reading
    // catches that, and E164_RE is not one.
    for (const row of PHONE_MATRIX) {
      if (row.e164 !== null) continue;
      const composed = composeE164(row.dial, row.input);
      expect(`${JSON.stringify(row.input)} -> ${E164_RE.test(composed)}`).toBe(
        `${JSON.stringify(row.input)} -> false`,
      );
      // And it cannot be laundered by feeding it back through the parser.
      expect(`${JSON.stringify(row.input)} -> ${parseToE164(composed, row.dial)}`).toBe(
        `${JSON.stringify(row.input)} -> null`,
      );
    }
  });

  it("reaches the account through the field, not just through the parser", () => {
    // The matrix run end to end: the text is sanitised by `applyPhoneEdit`
    // first, exactly as a keystroke or an autofill write would be, and only
    // then composed. A cap or a sanitiser that quietly drops a digit shows up
    // here and nowhere above.
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      const prev: PhoneValue = { iso2: countryFor(AZ).iso2, national: "" };
      const start = row.dial === "994" ? prev : seedCountry(row.dial);
      expect(`${row.input} -> ${submitted(row.input, start)}`).toBe(`${row.input} -> ${row.e164}`);
    }
  });
});

/** A field whose chip already shows `dial` and whose number is empty. */
function seedCountry(dial: string): PhoneValue {
  const country = COUNTRY_BY_DIAL[dial];
  if (!country) throw new Error(`no country in the picker dials +${dial}`);
  return { iso2: country, national: "" };
}

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

// ---------------------------------------------------------------------------
// 2. The two failures that made this rewrite necessary, stated on their own
// ---------------------------------------------------------------------------

describe("the numbers the hand-rolled rules got wrong", () => {
  it("Italy keeps the leading zero that IS its area code", () => {
    expect(submitted("+39 06 1234 5678", seedCountry("39"))).toBe("+390612345678");
    expect(submitted("06 1234 5678", seedCountry("39"))).toBe("+390612345678");
  });

  it("St Petersburg keeps the 8 of its area code", () => {
    // The blocker: "7" -> "8" in the old table stripped the first digit of
    // 812/831/843/846/861/863/87xx, storing a different, well-formed number.
    expect(submitted("+7 812 123 45 67", seedCountry("7"))).toBe("+78121234567");
    expect(submitted("812 123 45 67", seedCountry("7"))).toBe("+78121234567");
  });

  it("and Russia still loses the trunk 8 when that is what it is", () => {
    expect(submitted("8 926 123 45 67", seedCountry("7"))).toBe("+79261234567");
  });

  it("Benin and San Marino keep a leading zero the '0' default would have eaten", () => {
    expect(submitted("01 23 45 67", seedCountry("229"))).toBe("+22901234567");
    expect(submitted("0549 886377", seedCountry("378"))).toBe("+3780549886377");
  });

  it("Lithuania and Belarus lose a trunk 8 the '0' default never touched", () => {
    expect(submitted("8 612 34567", seedCountry("370"))).toBe("+37061234567");
    expect(submitted("8 029 123 45 67", seedCountry("375"))).toBe("+375291234567");
  });
});

// ---------------------------------------------------------------------------
// 3. The trunk prefix stays ON SCREEN while it is typed
// ---------------------------------------------------------------------------

describe("what the field shows while a number is being entered", () => {
  it("keeps the trunk zero visible", () => {
    // It is how the number is written locally, and deleting it mid-entry moves
    // the caret out from under the user. It comes off once, at compose time.
    const next = applyPhoneEdit({ raw: "050 123 45 67", prev: EMPTY_PHONE, focused: true });
    expect(next).toEqual({ iso2: AZ, national: "050 123 45 67" });
    expect(composeE164(countryFor(next.iso2).dial, next.national)).toBe("+994501234567");
  });

  it("keeps an international paste's own digits, including a written (0)", () => {
    // The old international branch stripped a leading trunk digit here,
    // unconditionally — sound only for the "(0)" convention, and the reason a
    // real "+7 812 …" lost the 8 of its area code. Nothing is stripped now;
    // the library decides once, later.
    const az = applyPhoneEdit({ raw: "+994 (0)50 123 45 67", prev: EMPTY_PHONE, focused: false });
    expect(az).toEqual({ iso2: "AZ", national: "0501234567" });
    expect(composeE164(countryFor(az.iso2).dial, az.national)).toBe("+994501234567");

    const ru = applyPhoneEdit({ raw: "+7 812 123 45 67", prev: seedCountry("7"), focused: false });
    expect(ru.national).toBe("8121234567");
    expect(composeE164(countryFor(ru.iso2).dial, ru.national)).toBe("+78121234567");
  });

  it("survives the sanitiser running on every keystroke", () => {
    // applyPhoneEdit's output is fed straight back in as the next raw value,
    // which is exactly what a controlled input does on the next keypress.
    const once = applyPhoneEdit({ raw: "+994 (0)50 123 45 67", prev: EMPTY_PHONE, focused: false });
    const twice = applyPhoneEdit({ raw: once.national, prev: once, focused: true });
    expect(twice).toEqual(once);
    expect(composeE164(countryFor(twice.iso2).dial, twice.national)).toBe("+994501234567");
  });
});

// ---------------------------------------------------------------------------
// 4. The cap counts DIGITS
// ---------------------------------------------------------------------------

describe("the length cap", () => {
  it("is the longest national number the library knows of any plan", () => {
    // Asked of libphonenumber-js rather than guessed, so it cannot go stale
    // against the metadata. E.164 allows 15 digits in total, so an
    // international paste is bounded more tightly still.
    expect(PHONE_MAX_DIGITS).toBeGreaterThanOrEqual(15);
    expect(PHONE_MAX_DIGITS).toBeLessThan(20);
  });

  it("charges digits to the budget and separators to nothing", () => {
    // THE BUG: the old cap was 14 CHARACTERS INCLUDING SPACES, so an 11-digit
    // number written out with them lost its final digit — and then composed
    // into a perfectly well-formed E.164 number belonging to somebody else.
    const german = "0151 1234 5678"; // 11 digits, 14 characters
    const next = applyPhoneEdit({ raw: german, prev: seedCountry("49"), focused: true });
    expect(next.national).toBe(german);
    expect(composeE164(countryFor(next.iso2).dial, next.national)).toBe("+4915112345678");
  });

  it("still truncates a genuinely absurd input", () => {
    const next = applyPhoneEdit({ raw: "1".repeat(40), prev: EMPTY_PHONE, focused: true });
    expect(next.national).toHaveLength(PHONE_MAX_DIGITS);
  });

  it("caps a draft like any other value", () => {
    const v = applyPhoneEdit({ raw: `+${"9".repeat(40)}`, prev: EMPTY_PHONE, focused: true });
    expect(v.national).toBe(`+${"9".repeat(PHONE_MAX_DIGITS)}`);
  });
});

// ---------------------------------------------------------------------------
// 5. Typing an international number by hand — "+" and now "00"
// ---------------------------------------------------------------------------

describe("typing an international number by hand", () => {
  it("keeps the + on screen while the dial code is still incomplete", () => {
    // It used to be deleted on the first keystroke, so everything after it was
    // read as a NATIONAL number and composed onto the dial code again.
    let v = applyPhoneEdit({ raw: "+", prev: EMPTY_PHONE, focused: true });
    expect(v.national).toBe("+");
    expect(composeE164(countryFor(v.iso2).dial, v.national)).toBe("");

    v = applyPhoneEdit({ raw: "+9", prev: v, focused: true });
    expect(v.national).toBe("+9");
    v = applyPhoneEdit({ raw: "+99", prev: v, focused: true });
    expect(v.national).toBe("+99");
  });

  it("moves the dial code into the country chip on the keystroke that completes it", () => {
    let v: PhoneValue = EMPTY_PHONE;
    for (const raw of ["+", "+9", "+99", "+994"]) {
      v = applyPhoneEdit({ raw, prev: v, focused: true });
    }
    // The digits were not lost — they became the country.
    expect(v).toEqual({ iso2: "AZ", national: "" });

    for (const raw of ["5", "50", "501234567"]) {
      v = applyPhoneEdit({ raw, prev: v, focused: true });
    }
    expect(composeE164(countryFor(v.iso2).dial, v.national)).toBe("+994501234567");
  });

  it("does the same for the 00 form, one keystroke at a time", () => {
    // THE BUG THIS FIXES: "00994" has no "+" to mark it as a draft, so the
    // keystroke that completed the dial code emptied a field that HAD digits
    // and was refused as an autofill blank. The 4 was eaten and the user was
    // left typing into a field that silently ignored them.
    let v: PhoneValue = EMPTY_PHONE;
    for (const raw of ["0", "00", "009", "0099", "00994"]) {
      v = applyPhoneEdit({ raw, prev: v, focused: true });
    }
    expect(v).toEqual({ iso2: "AZ", national: "" });

    for (const raw of ["5", "50", "501234567"]) {
      v = applyPhoneEdit({ raw, prev: v, focused: true });
    }
    expect(composeE164(countryFor(v.iso2).dial, v.national)).toBe("+994501234567");
  });

  it("does not reinterpret a national number mid-keystroke because it starts 00", () => {
    // "009" is not a dial code, so this is someone typing, not an
    // international paste. Nothing moves.
    expect(applyPhoneEdit({ raw: "009", prev: EMPTY_PHONE, focused: true })).toEqual({
      iso2: AZ,
      national: "009",
    });
  });

  it("never composes a doubled dial code, whatever is typed after the +", () => {
    let v: PhoneValue = EMPTY_PHONE;
    for (const raw of ["+", "+9", "+99", "+994", "5", "50", "501", "5012", "501234567"]) {
      v = applyPhoneEdit({ raw, prev: v, focused: true });
      const e164 = composeE164(countryFor(v.iso2).dial, v.national);
      expect(e164.startsWith("+994994")).toBe(false);
    }
  });

  it("still refuses a bare + that ARRIVES over a real number", () => {
    // A value carrying no digits is a normalisation artefact, and a bare dial
    // code EXTENDS nothing — it replaces. The typing exception below is what
    // separates the two.
    const filled: PhoneValue = { iso2: AZ, national: "50 123 45 67" };
    expect(applyPhoneEdit({ raw: "+", prev: filled, focused: true })).toEqual(filled);
    expect(applyPhoneEdit({ raw: "+994", prev: filled, focused: true })).toEqual(filled);
    expect(applyPhoneEdit({ raw: "+994", prev: filled, focused: false })).toEqual(filled);
  });

  it("lets a draft be backspaced away", () => {
    // The refusal must not trap the user inside a half-typed dial code: "+99"
    // -> "+9" -> "+" -> "" has to walk all the way back.
    let v: PhoneValue = { iso2: AZ, national: "+99" };
    v = applyPhoneEdit({ raw: "+9", prev: v, focused: true });
    expect(v.national).toBe("+9");
    v = applyPhoneEdit({ raw: "+", prev: v, focused: true });
    expect(v.national).toBe("+");
    v = applyPhoneEdit({ raw: "", prev: v, focused: true });
    expect(v.national).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 6. An unfocused write may still REPLACE a number — deliberate, not an
//    oversight
// ---------------------------------------------------------------------------

describe("an unfocused write carrying digits", () => {
  it("replaces the number, because that is the autofill path itself", () => {
    // Android fills a whole dataset when the user picks one in a SIBLING field,
    // so the phone is unfocused for the entire fill. Refusing writes here would
    // break ordinary autofill with nothing on screen to say why. The blank
    // refusal is the narrow case: an empty write carries no information at all,
    // so all it can do is destroy some.
    const filled: PhoneValue = { iso2: AZ, national: "50 123 45 67" };
    const next = applyPhoneEdit({ raw: "+994 55 987 65 43", prev: filled, focused: false });
    expect(composeE164(countryFor(next.iso2).dial, next.national)).toBe("+994559876543");
  });

  it("still cannot empty it", () => {
    const filled: PhoneValue = { iso2: AZ, national: "50 123 45 67" };
    expect(applyPhoneEdit({ raw: "", prev: filled, focused: false })).toEqual(filled);
  });
});

// ---------------------------------------------------------------------------
// 7. A stored number opens the editor on itself
// ---------------------------------------------------------------------------

describe("splitE164 round-trips every stored number", () => {
  it("recomposes to the identical string it came from", () => {
    for (const row of PHONE_MATRIX) {
      if (row.e164 === null) continue;
      const value = splitE164(row.e164);
      const dial = countryFor(value.iso2).dial;
      expect(`${row.e164} -> ${composeE164(dial, value.national)}`).toBe(
        `${row.e164} -> ${row.e164}`,
      );
    }
  });

  it("opens empty on an account that has no number", () => {
    for (const nothing of ["", "   ", "not a number"]) {
      expect(splitE164(nothing)).toEqual(EMPTY_PHONE);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. The national input is not an unnamed edit box
// ---------------------------------------------------------------------------

describe("the national-number input names itself", () => {
  const SRC = resolve(__dirname, "..", "src");
  const strip = (s: string) =>
    s
      .split("\r\n")
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\/[^\n]*/g, " ");
  const PHONE_FIELD = strip(readFileSync(resolve(SRC, "components", "PhoneField.tsx"), "utf8"));
  const TEXT_FIELD = strip(readFileSync(resolve(SRC, "components", "TextField.tsx"), "utf8"));

  it("passes the visible label straight to the input as its accessibility name", () => {
    // The label is rendered once, above a ROW holding the country trigger and
    // the input, so the input itself has no `label` prop to derive a name from.
    expect(PHONE_FIELD).toContain("accessibilityLabel={fieldLabel}");
    expect(PHONE_FIELD).toContain("const fieldLabel =");
  });

  it("and TextField lets that explicit name win over its own label prop", () => {
    // `accessibilityLabel={label}` sits after `{...rest}`, so without the
    // fallback the caller's name is overwritten with undefined.
    expect(TEXT_FIELD).toContain("accessibilityLabel={rest.accessibilityLabel ?? label}");
    expect(TEXT_FIELD).not.toContain("accessibilityLabel={label}");
  });
});

// ---------------------------------------------------------------------------
// 9. No hand-rolled numbering plan may come back
// ---------------------------------------------------------------------------

describe("the guesswork is gone and stays gone", () => {
  const read = (rel: string) =>
    readFileSync(resolve(__dirname, "..", rel), "utf8").split("\r\n").join("\n");
  /** The same file with every comment removed, so prose ABOUT a banned pattern
   *  is not mistaken for the pattern itself. */
  const codeOf = (rel: string) =>
    read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");

  it("countries.ts is a picker list and nothing more", () => {
    const src = read("src/lib/countries.ts");
    expect(src).not.toContain("TRUNK_PREFIX_BY_DIAL");
    expect(src).not.toContain("trunkPrefixForDial");
    expect(src).not.toContain("stripTrunkPrefix");
    // The list itself stays — it drives the country sheet.
    expect(src).toContain("export const COUNTRIES");
  });

  it("nothing in src strips a leading zero from a phone number by hand", () => {
    // The original defect, one regex long, and easy to reintroduce while
    // "tidying up" a compose function. The header of phoneE164.ts QUOTES that
    // expression to explain what was wrong with it, so the comments come off
    // first: a rule that cannot survive being explained gets explained badly.
    for (const rel of ["src/lib/phoneE164.ts", "src/components/PhoneField.tsx"]) {
      expect(`${rel}: ${/replace\(\/\^0\+\//.test(codeOf(rel))}`).toBe(`${rel}: false`);
    }
  });

  it("the core asks libphonenumber-js rather than a table", () => {
    const core = read("src/lib/phoneE164.ts");
    expect(core).toContain('from "libphonenumber-js"');
    expect(core).toContain("parsePhoneNumberFromString");
  });
});
