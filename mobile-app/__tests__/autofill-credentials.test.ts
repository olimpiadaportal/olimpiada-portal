// THE PHONE FIELD MUST NOT BE ABLE TO EMPTY ITSELF, AND EVERY CREDENTIAL FIELD
// MUST SAY WHAT IT IS.
//
// THE BUG THIS PINS (owner, both platforms). A parent typed a phone number in
// registration, moved to the password field, and the phone was CLEARED. Six
// candidate causes were eliminated with file:line evidence — no component
// declared inside a render, no changing `key`, no effect writing the value, no
// `value` prop to re-initialise from, no blur-time validation, and Screen
// passing `{children}` straight through. The one left standing is PLATFORM
// AUTOFILL: Android's framework and iOS's AutoFill both write into UNFOCUSED
// inputs when a dataset is chosen in a SIBLING field, and a dataset carrying no
// phone writes an EMPTY value.
//
// The fix is two constructions rather than a diagnosis, so it holds whichever
// cause it really was:
//
//   1. the value is CONTROLLED and owned by the screen, so a remount of the
//      field cannot reset it;
//   2. `applyPhoneEdit` REFUSES a pass that would leave a field that had digits
//      with none — unless the input actually held focus and the text really
//      arrived empty, which is a person clearing it by hand.
//
// Both are pinned below, together with the autofill attributes that stop the
// platform guessing at these fields in the first place. Source assertions where
// there is no pure function to call: this suite has no renderer.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// The same two stubs phone-optional.test.ts uses, and for the same reasons:
// `lucide-react-native` ships untranspiled ESM outside jest-expo's
// transformIgnorePatterns, and the component modules reach the locale catalogue
// (and through it the Supabase client) at import time. Nothing renders here.
jest.mock("lucide-react-native", () => ({}), { virtual: true });
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import {
  applyPhoneEdit,
  composeE164,
  countryFor,
  matchDialCode,
  EMPTY_PHONE,
  PHONE_MAX_DIGITS,
  type PhoneValue,
} from "@/components/PhoneField";
import { NEW_PASSWORD_RULES, PASSWORD_AUTOFILL } from "@/components/TextField";
import { COUNTRIES } from "@/lib/countries";
import { PASSWORD_SPECIAL_RE } from "@/lib/passwordPolicy";

const SRC = resolve(__dirname, "..", "src");

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8");
}

/** Source with comments blanked: prose ABOUT an attribute must never satisfy a
 *  test that the attribute is set. */
function code(source: string): string {
  return source
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

const REGISTER = code(read("app/(public)/register.tsx"));
const LOGIN = code(read("app/(public)/login.tsx"));
const TEXT_FIELD = code(read("components/TextField.tsx"));
const PHONE_FIELD = code(read("components/PhoneField.tsx"));

/**
 * The PROP LIST of each `<Tag …/>` in a source file — everything from the tag
 * name to the `/>` that closes it, with `{…}` expressions counted so a style
 * object or an arrow body cannot end the scan early.
 */
function elements(source: string, tag: string): string[] {
  const out: string[] = [];
  const open = `<${tag}`;
  let at = source.indexOf(open);
  while (at >= 0) {
    // `<TextField` must not match `<TextFieldish`.
    const after = source[at + open.length];
    if (after !== undefined && !/[\s/>]/.test(after)) {
      at = source.indexOf(open, at + open.length);
      continue;
    }
    let depth = 0;
    let i = at + open.length;
    for (; i < source.length; i += 1) {
      const c = source[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (depth === 0 && c === ">") break;
    }
    out.push(source.slice(at, i));
    at = source.indexOf(open, i);
  }
  return out;
}

/** The one element of `tag` whose props contain `marker`. */
function field(source: string, tag: string, marker: string): string {
  const found = elements(source, tag).filter((e) => e.includes(marker));
  expect(found).toHaveLength(1);
  return found[0];
}

const AZ = EMPTY_PHONE.iso2;
const filled: PhoneValue = { iso2: AZ, national: "50 123 45 67" };

// ---------------------------------------------------------------------------
// 1. The sanitiser cannot blank a filled field
// ---------------------------------------------------------------------------

describe("applyPhoneEdit refuses to blank a filled field", () => {
  it("keeps the number when an UNFOCUSED write empties it — the reported bug", () => {
    // Autofill filling its dataset while focus sits on the password: the phone
    // it has no value for is written as "". Nobody was typing here.
    expect(applyPhoneEdit({ raw: "", prev: filled, focused: false })).toEqual(filled);
  });

  it("keeps the number when a write arrives that CARRIES no digits", () => {
    // A dial code with nothing after it, or any other normalisation artefact.
    // Refused even while focused: a person does not produce these one keystroke
    // at a time.
    for (const raw of ["+994", "N/A", "()", "   ", "+"]) {
      expect(applyPhoneEdit({ raw, prev: filled, focused: true })).toEqual(filled);
    }
  });

  it("still lets the user clear it by hand", () => {
    // The optional field has to stay two-way: the profile section treats an
    // empty value as a deliberate clear (Apple 5.1.1(v)), so a blanket
    // "never empty" rule would have made it one-way.
    expect(applyPhoneEdit({ raw: "", prev: filled, focused: true })).toEqual({
      iso2: AZ,
      national: "",
    });
  });

  it("is a plain no-op when there was nothing to lose", () => {
    expect(applyPhoneEdit({ raw: "", prev: EMPTY_PHONE, focused: false })).toEqual({
      iso2: AZ,
      national: "",
    });
  });

  it("never refuses an edit that leaves digits behind", () => {
    // Deleting down to one digit is not blanking, focused or not.
    expect(applyPhoneEdit({ raw: "5", prev: filled, focused: true }).national).toBe("5");
    expect(applyPhoneEdit({ raw: "50 123 45 6", prev: filled, focused: true }).national).toBe(
      "50 123 45 6",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Ordinary typing is unchanged
// ---------------------------------------------------------------------------

describe("applyPhoneEdit leaves normal typing alone", () => {
  it("keeps digits and the spaces people group with, and drops everything else", () => {
    expect(applyPhoneEdit({ raw: "50 123-45.67", prev: EMPTY_PHONE, focused: true }).national).toBe(
      "50 1234567",
    );
  });

  it("caps DIGITS, not characters", () => {
    // The cap used to be 14 CHARACTERS including the spaces people group with,
    // so an 11-digit number written out lost its last digit and still composed
    // into a well-formed E.164 number belonging to somebody else. The bound is
    // now the longest national number libphonenumber-js knows of any plan.
    const long = "1".repeat(40);
    expect(
      applyPhoneEdit({ raw: long, prev: EMPTY_PHONE, focused: true }).national,
    ).toHaveLength(PHONE_MAX_DIGITS);
    const spaced = "1234 5678 901"; // 11 digits, 13 characters
    expect(
      applyPhoneEdit({ raw: spaced, prev: EMPTY_PHONE, focused: true }).national,
    ).toBe(spaced);
  });

  it("does not touch the selected country", () => {
    const prev: PhoneValue = { iso2: "TR", national: "" };
    expect(applyPhoneEdit({ raw: "532 111 22 33", prev, focused: true }).iso2).toBe("TR");
  });

  it("does not reinterpret a number mid-keystroke because it starts 00", () => {
    // "009" is not a dial code, so this is someone typing, not an
    // international paste. Nothing is stripped.
    expect(applyPhoneEdit({ raw: "009", prev: EMPTY_PHONE, focused: true }).national).toBe("009");
  });
});

// ---------------------------------------------------------------------------
// 3. An autofilled INTERNATIONAL number lands correctly
// ---------------------------------------------------------------------------

describe("applyPhoneEdit understands a full international number", () => {
  it("strips the dial code instead of doubling it", () => {
    // The old sanitiser cleaned "+994 50 123 45 67" to "994501234567" and
    // composed "+994994501234567". Inviting autofill onto this field was unsafe
    // until this was fixed.
    const next = applyPhoneEdit({ raw: "+994 50 123 45 67", prev: EMPTY_PHONE, focused: false });
    expect(next).toEqual({ iso2: "AZ", national: "501234567" });
    expect(composeE164(countryFor(next.iso2).dial, next.national)).toBe("+994501234567");
  });

  it("accepts the 00 form too", () => {
    const next = applyPhoneEdit({ raw: "00994501234567", prev: EMPTY_PHONE, focused: false });
    expect(next).toEqual({ iso2: "AZ", national: "501234567" });
  });

  it("moves the country trigger when the number belongs to another country", () => {
    const next = applyPhoneEdit({ raw: "+90 532 111 22 33", prev: EMPTY_PHONE, focused: false });
    expect(next.iso2).toBe("TR");
    expect(composeE164(countryFor(next.iso2).dial, next.national)).toBe("+905321112233");
  });

  it("leaves a shared dial code on the country the user already picked", () => {
    // +1 is twenty-odd NANP territories and +7 is RU/KZ. Flipping the user's
    // own choice to whichever row comes first in the table would be worse than
    // doing nothing.
    expect(matchDialCode("15551234567", "CA")?.iso2).toBe("CA");
    expect(matchDialCode("79261234567", "KZ")?.iso2).toBe("KZ");
  });

  it("resolves an unpreferred shared code to a country with the SAME dial", () => {
    // A dial code does not identify a country — 25 rows share "1". With no
    // preference the first match is taken, and that is harmless precisely
    // because siblings share the dial and the dial is all composeE164 uses.
    const picked = matchDialCode("15551234567");
    expect(picked?.dial).toBe("1");
    expect(composeE164(picked?.dial ?? "", "5551234567")).toBe("+15551234567");
  });

  it("never has to guess between dial codes of different lengths", () => {
    // The tie-break in matchDialCode is defensive: today no dial in
    // countries.ts is a prefix of another, so a match is unambiguous by length.
    // If that ever stops being true, the longest match is the country.
    const dials = new Set(COUNTRIES.map((c) => c.dial));
    const shadowed = [...dials].filter((d) => [...dials].some((o) => o !== d && o.startsWith(d)));
    expect(shadowed).toEqual([]);
  });

  it("round-trips: what autofill writes is what the server receives", () => {
    const next = applyPhoneEdit({ raw: "+994501234567", prev: filled, focused: false });
    expect(composeE164(countryFor(next.iso2).dial, next.national)).toBe("+994501234567");
  });
});

// ---------------------------------------------------------------------------
// 4. PhoneField is controlled — the value cannot live inside the field
// ---------------------------------------------------------------------------

describe("PhoneField is controlled", () => {
  it("takes the country + national pair as a prop and renders from it", () => {
    expect(PHONE_FIELD).toContain("value: PhoneValue;");
    expect(PHONE_FIELD).toContain("onChange: (next: PhoneValue) => void;");
    const input = field(PHONE_FIELD, "TextField", "value={value.national}");
    expect(input).toContain("applyPhoneEdit");
  });

  it("owns no national-number state of its own", () => {
    // `const [national, setNational] = useState("")` is what a remount reset to
    // empty with nothing on screen to say so.
    expect(PHONE_FIELD).not.toContain("setNational");
    expect(PHONE_FIELD).not.toContain("national, setNational");
  });

  it("tells the sanitiser whether the input actually has focus", () => {
    // Without this the refusal cannot tell a user clearing the field from the
    // platform overwriting it, and would have to break manual clearing.
    expect(PHONE_FIELD).toContain("focused: focused.current");
    expect(PHONE_FIELD).toContain("focused.current = true");
    expect(PHONE_FIELD).toContain("focused.current = false");
  });

  it("is controlled at EVERY call site", () => {
    for (const { file, source } of tsxFiles()) {
      for (const el of elements(source, "PhoneField")) {
        expect([file, el.includes("value={")]).toEqual([file, true]);
        expect([file, el.includes("onChange={")]).toEqual([file, true]);
      }
    }
  });
});

function tsxFiles(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx") && !p.endsWith("PhoneField.tsx")) {
        out.push({
          file: relative(SRC, p).split("\\").join("/"),
          source: code(readFileSync(p, "utf8")),
        });
      }
    }
  };
  walk(SRC);
  return out;
}

// ---------------------------------------------------------------------------
// 5. Every credential field declares its autofill
// ---------------------------------------------------------------------------

describe("the password table says which password it is", () => {
  it("uses the CROSS-PLATFORM spellings", () => {
    // The trap: `password-new` is the Android-only alias. RN maps
    // `new-password` -> Android `password-new` AND -> iOS `newPassword`
    // (TextInput.js:830, :870), while `password-new` passed straight through
    // produces NOTHING on iOS, because autoComplete is dropped there entirely.
    expect(PASSWORD_AUTOFILL.new.autoComplete).toBe("new-password");
    expect(PASSWORD_AUTOFILL.new.textContentType).toBe("newPassword");
    expect(PASSWORD_AUTOFILL.current.autoComplete).toBe("current-password");
    expect(PASSWORD_AUTOFILL.current.textContentType).toBe("password");
    expect(TEXT_FIELD).not.toContain('"password-new"');
    expect(TEXT_FIELD).not.toContain('"username-new"');
  });

  it("keeps a child credential out of every store", () => {
    expect(PASSWORD_AUTOFILL.none.autoComplete).toBe("off");
    expect(PASSWORD_AUTOFILL.none.importantForAutofill).toBe("no");
    expect(PASSWORD_AUTOFILL.none.passwordRules).toBeUndefined();
  });

  it("defaults to giving nothing away", () => {
    // A field that forgets to answer must stay out of a credential store, not
    // guess its way into one.
    expect(TEXT_FIELD).toContain('purpose = "none"');
  });

  it("enrols the parent fields on Android, where the hint alone is not enough", () => {
    expect(PASSWORD_AUTOFILL.new.importantForAutofill).toBe("yes");
    expect(PASSWORD_AUTOFILL.current.importantForAutofill).toBe("yes");
  });

  it("passes the whole set through to the input", () => {
    const input = field(TEXT_FIELD, "TextInput", "secureTextEntry={!visible}");
    for (const prop of [
      "textContentType={autofill.textContentType}",
      "autoComplete={autofill.autoComplete}",
      "importantForAutofill={autofill.importantForAutofill}",
      "passwordRules={autofill.passwordRules}",
    ]) {
      expect(input).toContain(prop);
    }
  });

  it("has no `isParentCredential` left to disagree with it", () => {
    for (const { file, source } of tsxFiles()) {
      expect([file, source.includes("isParentCredential")]).toEqual([file, false]);
    }
    expect(TEXT_FIELD).not.toContain("isParentCredential");
  });
});

describe("iOS strong-password rules match our own policy", () => {
  it("states the length and the two required classes", () => {
    expect(NEW_PASSWORD_RULES).toContain("minlength: 8");
    expect(NEW_PASSWORD_RULES).toContain("maxlength: 128");
    expect(NEW_PASSWORD_RULES).toContain("required: upper");
  });

  it("names its symbols instead of using Apple's `special`", () => {
    // Apple's "special" class INCLUDES THE SPACE and PASSWORD_SPECIAL_RE does
    // not, so a generated password whose only symbol was a space would fail the
    // very check this exists to satisfy.
    expect(NEW_PASSWORD_RULES).not.toContain("required: special");
    const set = /required: \[([^\]]+)\]/.exec(NEW_PASSWORD_RULES);
    expect(set).not.toBeNull();
    const chars = (set as RegExpExecArray)[1];
    expect(chars).not.toContain(" ");
    for (const ch of chars) {
      expect([ch, PASSWORD_SPECIAL_RE.test(ch)]).toEqual([ch, true]);
    }
  });
});

describe("register declares autofill on every field", () => {
  const cases: [string, string, string[]][] = [
    [
      "first name",
      'label={t("parent.auth.firstName")}',
      ['autoComplete="given-name"', 'textContentType="givenName"', 'autoCapitalize="words"'],
    ],
    [
      "last name",
      'label={t("parent.auth.lastName")}',
      ['autoComplete="family-name"', 'textContentType="familyName"', 'autoCapitalize="words"'],
    ],
    [
      "e-mail",
      'label={t("parent.auth.email")}',
      [
        'autoComplete="email"',
        'textContentType="emailAddress"',
        'autoCapitalize="none"',
        "autoCorrect={false}",
      ],
    ],
  ];

  it.each(cases)("%s", (_name, marker, props) => {
    const el = field(REGISTER, "TextField", marker);
    for (const prop of props) expect(el).toContain(prop);
    // The Android half. An `autoComplete` hint on its own does not enrol the
    // view in the autofill structure.
    expect(el).toContain('importantForAutofill="yes"');
  });

  it("asks for a NEW password, so a manager offers to SAVE it", () => {
    expect(field(REGISTER, "PasswordField", 'label={t("parent.auth.password")}')).toContain(
      'purpose="new"',
    );
  });
});

describe("login declares autofill on every field", () => {
  it("asks for a CURRENT password, so a manager offers to FILL it", () => {
    // This is the distinction the platform cannot infer, and the whole reason
    // `purpose` exists: the same component, opposite jobs on the two screens.
    expect(field(LOGIN, "PasswordField", 'label={t("parent.auth.password")}')).toContain(
      'purpose="current"',
    );
    expect(field(REGISTER, "PasswordField", 'label={t("parent.auth.password")}')).not.toContain(
      'purpose="current"',
    );
  });

  it("carries the e-mail hints that pair with it", () => {
    const el = field(LOGIN, "TextField", 'label={t("parent.auth.email")}');
    for (const prop of [
      'autoComplete="email"',
      'textContentType="emailAddress"',
      'autoCapitalize="none"',
      'importantForAutofill="yes"',
    ]) {
      expect(el).toContain(prop);
    }
  });
});

describe("the child sign-in is deliberately excluded", () => {
  it("offers nothing for the parent password behind the 8-digit ID", () => {
    // A minor's account number plus the PARENT's password, filed against the
    // same app domain as the parent's own credential. A manager that learned it
    // could overwrite that entry — an account lockout from a convenience.
    expect(field(LOGIN, "PasswordField", 'label={t("mob.parentPassword")}')).toContain(
      'purpose="none"',
    );
  });

  it("keeps the ID itself out of the autofill structure entirely", () => {
    const input = field(TEXT_FIELD, "TextInput", "maxLength={CHILD_ID_LEN + 1}");
    expect(input).toContain('autoComplete="off"');
    expect(input).toContain('importantForAutofill="no"');
    expect(input).toContain('textContentType="none"');
  });

  it("does not let a caller re-enable any of that", () => {
    for (const prop of [
      '| "autoComplete"',
      '| "importantForAutofill"',
      '| "textContentType"',
    ]) {
      expect(TEXT_FIELD).toContain(prop);
    }
  });
});

describe("the phone row asks for a NATIONAL number", () => {
  it("uses the hint for a number without its country code", () => {
    // The country code lives in a separate Pressable, so plain `tel` invited a
    // full E.164 number into a field that holds only the national part.
    const input = field(PHONE_FIELD, "TextField", "value={value.national}");
    expect(input).toContain('autoComplete="tel-national"');
    expect(input).toContain('textContentType="telephoneNumber"');
    expect(input).toContain('importantForAutofill="yes"');
    expect(input).not.toContain('autoComplete="tel"');
  });

  it("keeps the country SEARCH box out of autofill", () => {
    const search = field(PHONE_FIELD, "TextField", "autoFocus");
    expect(search).toContain('autoComplete="off"');
    expect(search).toContain('importantForAutofill="no"');
  });
});
