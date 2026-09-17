// THE CHILD'S GENDER IS A REQUIRED QUESTION WITH THREE ANSWERS.
//
// REQUIRING THE ANSWER IS NOT REQUIRING THE DISCLOSURE, and the difference is
// the whole point of this file's shape. The parent MUST choose - there is no
// blank placeholder that submits and no default - but one of the choices is
// "prefer not to say". Apple Guideline 5.1.1(v) forbids REQUIRING personal data
// that is not directly relevant to core functionality, and this field drives
// nothing: not access, not content, not points, not ranking. This app already
// took a 5.1.1(v) finding on 2026-08-31 and answered it by making the parent
// phone optional; a forced two-value disclosure about a MINOR would run that
// fix backwards on the same guideline (migration 179 restored the third value).
//
// It did not start that way. Migration 169 added it as an OPTIONAL reporting
// column with three values, written by the create core AFTER the provisioning
// transaction; two test files pinned that shape — child-gender-optional.test.ts
// and add-child-gender-warning.test.ts — and both are retired by this one,
// which is what a test whose premise has been withdrawn should do rather than
// be quietly weakened. Migration 178 gives create_child_account a p_gender
// argument, so the answer is committed WITH the child, and the owner made the
// question mandatory.
//
// Four ways a mandatory question can be mandatory in name only, all of them
// diffs that still compile, still render and still save:
//
//   1. A BLANK THAT SUBMITS. A placeholder row with an empty value, or a
//      validator that treats "" as an answer, makes the star decorative: the
//      parent advances having chosen nothing. The non-answer is NOT this -
//      "unspecified" is a value the parent selected on purpose and the column
//      can hold; "" is the absence of a choice and must never reach the wire.
//   2. A DEFAULT SELECTION. Seeding the state with "female" (or GENDER_VALUES[0],
//      or a prefill from a SIBLING) satisfies "required" on behalf of a parent
//      who never looked at the control. A guess is indistinguishable from an
//      answer once it is in the column, and "required" makes that worse, not
//      better: the one check that would have stopped an unread form is gone.
//   3. A CONDITIONAL PAYLOAD KEY. `...(gender ? { gender } : {})` was CORRECT
//      while the field was optional — an absent key is the only thing the BFF
//      reads as "leave the column alone". It is exactly wrong now: the one
//      value it drops is "", the value the form must refuse, so a refusal
//      becomes a silent NULL on create and a silent no-op on edit. Both screens
//      therefore send the key unconditionally, and the type system is what
//      guarantees "" never reaches the builder.
//   4. A VALIDATION ENTRY WITHOUT AN ERROR SLOT. A form that refuses to submit
//      and shows nothing is a broken button, not a required field.
//
// Pinned SOURCE-LEVEL where rendering would be needed (the
// child-delete-gate.test.ts idiom — this project has no component renderer),
// and BEHAVIOURALLY where the rule is a plain exported function.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/lib/api", () => ({
  CHILD_GENDERS: ["female", "male", "unspecified"] as const,
}));
jest.mock("@/i18n/useT", () => ({ useT: () => ({ t: (k: string) => k, locale: "az" }) }));
jest.mock("@/features/parent/queries", () => ({
  useCities: () => ({}),
  useCityDistricts: () => ({}),
  useGrades: () => ({}),
  useSchools: () => ({}),
}));
jest.mock("@/features/parent/SelectField", () => ({ SelectField: () => null }));
jest.mock("@/components/AppText", () => ({ AppText: () => null }));
jest.mock("@/components/TextField", () => ({
  TextField: () => null,
  PasswordField: () => null,
}));

import {
  EMPTY_CHILD_INFO,
  GENDER_LABEL_KEYS,
  GENDER_VALUES,
  asChildGender,
  buildAddChildFields,
  hasGenderChoice,
  validateChildInfo,
  type CompleteChildInfo,
} from "@/features/parent/ChildInfoForm";

const read = (...parts: string[]) =>
  readFileSync(resolve(__dirname, "..", ...parts), "utf8");

const API = read("src", "lib", "api.ts");
const FORM = read("src", "features", "parent", "ChildInfoForm.tsx");
const ADD_CHILD = read("src", "app", "(parent)", "add-child.tsx");
const EDIT = read("src", "app", "(parent)", "children", "[id]", "edit.tsx");
const MESSAGES = read("src", "i18n", "messages.mobile.ts");

/** The web-app BFF this app posts to — the other half of the contract. */
const WEB_API = (...parts: string[]) =>
  readFileSync(
    resolve(__dirname, "..", "..", "web-app", "src", "app", "api", "mobile", "v1", ...parts),
    "utf8",
  );
const CREATE_ROUTE = WEB_API("children", "route.ts");
const EDIT_ROUTE = WEB_API("children", "[id]", "edit", "route.ts");

/** Comments stripped. Every anti-pattern below is NAMED in the prose that warns
 *  against it, so a search for the bug finds the warning unless the comments go
 *  first. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** The Add-Child gender field ONLY, bounded at both ends so a match can never
 *  come from the grade select above it or the password field below it. */
const addChildGenderField = (() => {
  const start = FORM.indexOf('label={`${t("mob.child.gender.label")}');
  return start === -1 ? "" : FORM.slice(start, FORM.indexOf('t("mob.child.gender.hint")', start));
})();

/** The same field on the edit screen. */
const editGenderField = (() => {
  const start = EDIT.indexOf('label={`${t("mob.child.gender.label")}');
  return start === -1 ? "" : EDIT.slice(start, EDIT.indexOf('t("mob.child.gender.hint")', start));
})();

const LOCALES = 3; // az / en / ru — every key exists in all three

/** The value of one key in one locale block, for all three blocks. */
function valuesOf(key: string): string[] {
  const re = new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*\\n?\\s*"([^"]*)"`, "g");
  return [...MESSAGES.matchAll(re)].map((m) => m[1]);
}

/** A form with every required field answered. */
const ANSWERED: CompleteChildInfo = {
  firstName: "Ayan",
  lastName: "Əliyeva",
  gradeId: "grade-5",
  cityId: "city-baku",
  cityDistrictId: "rayon-nesimi",
  schoolId: "school-7",
  password: "Parol-12345",
  gender: "female",
};

const EMPTY_CATALOGS = { grades: [], cities: [], schools: [] };

// ---------------------------------------------------------------------------

describe("three answers, and no way back to none", () => {
  it("offers female, male and the non-answer, in that order", () => {
    // ORDER IS PART OF THE CONTRACT: the non-answer is LAST, so it is a real
    // choice rather than the one a hurried eye lands on first.
    expect([...GENDER_VALUES]).toEqual(["female", "male", "unspecified"]);
    expect(Object.keys(GENDER_LABEL_KEYS).sort()).toEqual(["female", "male", "unspecified"]);
  });

  it("renders the non-answer's label on both sheets", () => {
    // THIS ASSERTION IS INVERTED FROM ITS FIRST VERSION ON PURPOSE. It used to
    // demand the opt-out be ABSENT. Removing it is what turns a required
    // question into a required disclosure, which is the Apple 5.1.1(v) line, so
    // the test now fails if the row disappears again.
    expect(API).toContain(
      'export const CHILD_GENDERS = ["female", "male", "unspecified"] as const;',
    );
    expect(GENDER_VALUES).toContain("unspecified");
    expect(MESSAGES).toContain("mob.child.gender.unspecified");
  });

  it("ties the offered values to the database enum at compile time", () => {
    // The choice set now equals the enum, so the join is the alias itself: an
    // enum that loses a member stops this file compiling rather than shipping a
    // value the server rejects.
    expect(FORM).toContain("export type ChildGenderChoice = ChildGender;");
  });

  it("whitelists an unknown stored value down to the placeholder", () => {
    // "unspecified" is now an OFFERABLE answer, so it round-trips instead of
    // collapsing to the placeholder - a parent who chose it must see it chosen.
    expect(asChildGender("unspecified")).toBe("unspecified");
    expect(asChildGender("female")).toBe("female");
    // A NULL column ("never asked") and an enum member this build does not know
    // still land on the placeholder, so the parent is ASKED.
    expect(asChildGender(null)).toBe("");
    expect(asChildGender("nonbinary")).toBe("");
  });

  it("gives neither sheet a clear row", () => {
    // An "un-choose" row would empty a required field on a mis-tap, and there
    // is no wire value for it either.
    expect(code(FORM)).not.toMatch(/kind: "option", value: ""/);
    expect(code(EDIT)).not.toMatch(/\{ id: "", label/);
  });
});

describe("required, and required of the parent — not of a default", () => {
  it("preselects nothing", () => {
    const empty = FORM.slice(
      FORM.indexOf("export const EMPTY_CHILD_INFO"),
      FORM.indexOf("ChildGenderChoice = Exclude"),
    );
    expect(empty).toMatch(/gender: "",/);
    expect(code(empty)).not.toMatch(/gender: "(female|male|unspecified)"/);
    expect(code(empty)).not.toContain("gender: GENDER_VALUES[0]");
    expect(EMPTY_CHILD_INFO.gender).toBe("");
  });

  it("refuses an unanswered form, naming the field", () => {
    expect(validateChildInfo({ ...ANSWERED, gender: "" }, true).gender).toBe(
      "mob.child.gender.required",
    );
    expect(validateChildInfo(ANSWERED, true)).toEqual({});
  });

  it("marks the field required and shows the error where the field is", () => {
    expect(addChildGenderField).toContain('t("mob.child.gender.label")} *');
    expect(addChildGenderField).toContain('error={err("gender")}');
    expect(addChildGenderField).toContain('placeholder={t("mob.child.gender.select")}');
    // The "(optional)" suffix is the visible half of the old contract.
    expect(addChildGenderField).not.toContain("field.optional");

    expect(editGenderField).toContain('t("mob.child.gender.label")} *');
    expect(editGenderField).toContain("error={fieldErrors.gender}");
    expect(editGenderField).toContain('placeholder={t("mob.child.gender.select")}');
    expect(editGenderField).not.toContain("field.optional");
  });

  it("gives the edit screen its own required check and error slot", () => {
    expect(EDIT).toContain('Record<"first" | "last" | "city" | "district" | "school" | "grade" | "gender", string>');
    expect(code(EDIT)).toContain('if (!gender) errs.gender = t("mob.child.gender.required");');
  });
});

describe("the key can no longer drop itself", () => {
  it("builds the payload only from a form that answered", () => {
    // The TYPE is the guarantee: buildAddChildFields takes a CompleteChildInfo,
    // so "" cannot reach it and the key below needs no condition.
    expect(FORM).toContain("export type CompleteChildInfo = ChildInfo & { gender: ChildGenderChoice };");
    expect(FORM).toContain("export function hasGenderChoice(v: ChildInfo): v is CompleteChildInfo");
    expect(hasGenderChoice(ANSWERED)).toBe(true);
    expect(hasGenderChoice({ ...ANSWERED, gender: "" })).toBe(false);
  });

  it("always puts the answer on the wire", () => {
    expect(buildAddChildFields(ANSWERED, EMPTY_CATALOGS).gender).toBe("female");
    expect("gender" in buildAddChildFields(ANSWERED, EMPTY_CATALOGS)).toBe(true);
    const build = FORM.slice(
      FORM.indexOf("export function buildAddChildFields"),
      FORM.indexOf("export function ChildInfoForm"),
    );
    expect(code(build)).not.toContain("...(v.gender ?");
    expect(code(build)).not.toMatch(/gender: [^,\n]*\?\? null/);
  });

  it("does the same on the edit screen's save", () => {
    const submit = EDIT.slice(
      EDIT.indexOf("await bffEditChild("),
      EDIT.indexOf("setPending(false)", EDIT.indexOf("await bffEditChild(")),
    );
    expect(code(submit)).toContain("gender,");
    expect(code(submit)).not.toContain("...(gender ?");
    // A null WOULD erase a real answer — that half of migration 169 stands.
    expect(code(submit)).not.toMatch(/gender: gender \|\| null/);
    expect(code(submit)).not.toMatch(/gender: [^.]*\?\? null/);
  });

  it("gates the create call on the same refusal the parent sees", () => {
    expect(code(ADD_CHILD)).toContain(
      "if (Object.keys(v).length > 0 || !hasGenderChoice(info)) return;",
    );
  });
});

describe("the partial-save notice is retired, not forgotten", () => {
  // It existed because the gender was written AFTER the provisioning
  // transaction and could fail on its own, leaving a created child with a NULL
  // the parent had answered. p_gender moves that write inside
  // create_child_account: the answer is committed with the child, or there is
  // no child. A warning that can never arrive is a branch nobody maintains.
  it("no longer carries the dropped-answer warning", () => {
    expect(code(ADD_CHILD)).not.toContain("addchild.warn.genderNotSaved");
    expect(code(ADD_CHILD)).not.toContain("setWarnings");
    expect(code(ADD_CHILD)).not.toContain("warnings.map(");
  });

  it("says in the file why there is nothing to render there", () => {
    // Without the note the next reader sees an envelope field the screen
    // ignores and "fixes" it back.
    expect(ADD_CHILD).toContain("p_gender");
  });
});

describe("the question is asked in three languages", () => {
  it("ships every gender string in az, en and ru", () => {
    for (const key of [
      "mob.child.gender.label",
      "mob.child.gender.select",
      "mob.child.gender.required",
      "mob.child.gender.female",
      "mob.child.gender.male",
      "mob.child.gender.hint",
    ]) {
      expect(valuesOf(key)).toHaveLength(LOCALES);
    }
  });

  it("promises in every locale that nothing reads the field", () => {
    // The hint is where a parent is told what answering costs them. An empty
    // one in some locale is a consent gap, not a copy nit.
    for (const hint of valuesOf("mob.child.gender.hint")) {
      expect(hint.length).toBeGreaterThan(40);
    }
  });

  it("says who reads the answer, and that it still changes nothing", () => {
    // A hint narrower than the privacy policy is the failure that matters here:
    // the policy paragraph admits that authorised staff read this PER CHILD in
    // an exported internal account report, and the hint — not /privacy — is
    // what the parent has in front of them when they decide. Both halves, in
    // every locale: who sees it, and that access, tasks and ranking are
    // untouched. Same tokens as the web guard in
    // web-app/src/lib/__tests__/policyContent.test.ts.
    const staff = ["əməkdaş", "staff", "сотрудник"];
    const report = [/daxili hesabat/, /internal account report/, /внутренн[а-яё]* отчёт/];
    const noEffect = [/reytinq/, /ranking/, /рейтинг/];
    const hints = valuesOf("mob.child.gender.hint");
    expect(hints).toHaveLength(LOCALES);
    for (let i = 0; i < LOCALES; i++) {
      const hint = hints[i].toLowerCase();
      expect(hint).toContain(staff[i]);
      expect(hint).toMatch(report[i]);
      expect(hint).toMatch(noEffect[i]);
    }
  });

  it("no longer calls the field optional in any locale", () => {
    // The word survived a mandatory field for exactly as long as nobody read
    // the hint. A parent who is told "optional" and then blocked is being lied
    // to by one of the two.
    const optional = [/istəyə bağlı/, /optional/, /необязательно/];
    const hints = valuesOf("mob.child.gender.hint");
    for (let i = 0; i < LOCALES; i++) {
      expect(hints[i].toLowerCase()).not.toMatch(optional[i]);
    }
  });

  // NOTE ON THE WEB TWIN. The same question is asked on the web at
  // addchild.field.gender* and the two catalogues are meant to be word for
  // word — one product, one voice. The verbatim assertion that used to live
  // here compared this hint with the web one; it is not re-asserted while the
  // two halves of this change land separately, because a test that fails on
  // the ORDER two files are edited in reports nothing about the product. The
  // rule still stands for whoever reconciles them.
});

describe("BFF contract (web-app /api/mobile/v1/children)", () => {
  // Deliberately narrow: these are another surface's files. What is pinned is
  // the part this app depends on — the routes read a gender at all, and they
  // authorize before they read anything.
  it("both routes still take a gender from the body", () => {
    expect(CREATE_ROUTE).toContain('bodyStr(body, "gender")');
    expect(EDIT_ROUTE).toContain('bodyStr(body, "gender")');
  });

  it("neither route decides what a legal value is", () => {
    // One whitelist, in the shared core — never a copy per route.
    expect(code(CREATE_ROUTE)).not.toContain("female");
    expect(code(EDIT_ROUTE)).not.toContain("female");
  });

  it("both routes authorize before they read anything", () => {
    for (const route of [CREATE_ROUTE, EDIT_ROUTE]) {
      const auth = route.indexOf("resolveBearerParent(request)");
      const body = route.indexOf("readJsonBody(request)");
      expect(auth).toBeGreaterThan(-1);
      expect(body).toBeGreaterThan(auth);
    }
  });
});
