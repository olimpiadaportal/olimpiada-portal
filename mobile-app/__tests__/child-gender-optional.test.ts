// The optional child gender (migration 169) has FOUR expressible states, and
// the fourth one is invisible: it is the ABSENCE of the other three.
//
//   female | male          — an answer
//   unspecified            — a parent who was ASKED and declined. Also an answer.
//   nothing selected       — nobody has been asked. NULL in the column.
//
// Every one of the failures this pins turns four states into three, and every
// one of them is a diff that still compiles, still renders and still saves:
//
//   1. A DEFAULT SELECTION. Seed the state with "unspecified" (or with
//      "female", or with GENDER_VALUES[0]) and every parent who walks past the
//      control records a refusal they never made. The column then says 46
//      families declined to answer a question they were never shown — the
//      exact "number that looks like data and is not" the migration header
//      opens with.
//   2. A `gender: null` ON THE WIRE. The field is written by two screens and
//      SAVED by a form whose other seven fields are about schools and names. If
//      an untouched control sends `null` instead of sending nothing, correcting
//      a school name silently downgrades "declined to say" to "never asked".
//      Hence the spread — `...(gender ? { gender } : {})` — on both screens and
//      the `bodyStr(...)` (never `?? null`) in the edit BFF route.
//   3. A REQUIRED FIELD. A "*", a validateChildInfo entry or a FieldErrors slot
//      would let an optional statistic block a parent from creating a child.
//      Nothing about access, content or ranking reads this column; it must
//      never be able to stop anything.
//   4. A PLACEHOLDER THAT READS LIKE "PREFER NOT TO SAY". The two are different
//      facts. If a locale phrases them alike the distinction survives in the
//      database and dies on the screen, which is where the parent decides.
//
// Pinned SOURCE-LEVEL — the child-delete-gate.test.ts idiom: rendering these
// screens needs a component renderer this project does not depend on, and
// these are properties of the diff.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (...parts: string[]) =>
  readFileSync(resolve(__dirname, "..", ...parts), "utf8");

const API = read("src", "lib", "api.ts");
const FORM = read("src", "features", "parent", "ChildInfoForm.tsx");
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

/** Comments stripped. The anti-patterns below are NAMED in the comments that
 *  warn against them ("never `gender: gender || null`"), so a search for the
 *  bug finds the warning unless the prose is removed first. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const LOCALES = 3; // az / en / ru — every key exists in all three

/** The value of one key in one locale block, for all three blocks. */
function valuesOf(key: string): string[] {
  const re = new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*\\n?\\s*"([^"]*)"`, "g");
  return [...MESSAGES.matchAll(re)].map((m) => m[1]);
}

describe("gender wire contract", () => {
  it("has exactly the three enum values migration 169 created", () => {
    expect(API).toContain(
      'export const CHILD_GENDERS = ["female", "male", "unspecified"] as const;',
    );
  });

  it("cannot spell NULL on the wire", () => {
    // The absence of a "none"/"null"/"" member is what forces every caller to
    // express "not answered" by OMITTING the field — the only encoding the
    // server reads as "leave the column alone".
    const decl = API.slice(API.indexOf("export const CHILD_GENDERS"));
    expect(decl.slice(0, decl.indexOf(";"))).not.toMatch(/"(null|none|unset|)"/);
  });

  it("is optional on AddChildFields, so an omission is a type-legal request", () => {
    expect(API).toMatch(/gender\?: ChildGender;/);
  });
});

describe("Add-Child gender selector", () => {
  it("exists and uses the app's select primitive, not a new control", () => {
    expect(addChildGenderField.length).toBeGreaterThan(0);
    expect(FORM).toMatch(/<SelectField\b[\s\S]{0,200}mob\.child\.gender\.label/);
    expect(addChildGenderField).toContain("items={genderItems}");
  });

  it("offers all three answers, built from the shared whitelist", () => {
    const items = FORM.slice(
      FORM.indexOf("const genderItems"),
      FORM.indexOf("const err = ("),
    );
    expect(items).toContain("GENDER_VALUES.map");
    expect(items).toContain("GENDER_LABEL_KEYS[g]");
    expect(FORM).toContain("export const GENDER_VALUES: readonly ChildGender[] = CHILD_GENDERS;");
    for (const g of ["female", "male", "unspecified"]) {
      expect(FORM).toMatch(new RegExp(`${g}: "mob\\.child\\.gender\\.${g}"`));
    }
  });

  it("offers the fourth state as the placeholder — and never as a fourth row", () => {
    expect(addChildGenderField).toContain('placeholder={t("mob.child.gender.none")}');
    // A "clear"/"none" ROW would be a way to write NULL back over an answer.
    expect(code(FORM)).not.toMatch(/kind: "option", value: ""/);
  });

  it("preselects nothing", () => {
    const empty = FORM.slice(
      FORM.indexOf("export const EMPTY_CHILD_INFO"),
      FORM.indexOf("GENDER_LABEL_KEYS"),
    );
    expect(empty).toMatch(/gender: "",/);
    // Any of these would be a default selection wearing a different hat.
    expect(code(empty)).not.toMatch(/gender: "(female|male|unspecified)"/);
    expect(empty).not.toContain("gender: GENDER_VALUES[0]");
    expect(empty).not.toContain("gender: CHILD_GENDERS[0]");
  });

  it("is not required: no star, no validation entry, no error slot", () => {
    expect(addChildGenderField).not.toContain("*");
    expect(addChildGenderField).not.toContain("error=");
    const validate = FORM.slice(
      FORM.indexOf("export function validateChildInfo"),
      FORM.indexOf("type GradeRow"),
    );
    expect(validate).not.toContain("gender");
  });

  it("omits the key entirely when the parent never answered", () => {
    const build = FORM.slice(
      FORM.indexOf("export function buildAddChildFields"),
      FORM.indexOf("export function ChildInfoForm"),
    );
    expect(build).toContain("...(v.gender ? { gender: v.gender } : {})");
    expect(code(build)).not.toMatch(/gender: v\.gender \|\| null/);
    expect(code(build)).not.toMatch(/gender: [^?]*\?\? null/);
  });
});

describe("child-edit gender selector", () => {
  it("exists, on the same select primitive the screen's other fields use", () => {
    expect(editGenderField.length).toBeGreaterThan(0);
    expect(editGenderField).toContain("options={genderOptions}");
    expect(EDIT).toContain("const genderOptions: SelectOption[] = GENDER_VALUES.map");
  });

  it("offers the three answers plus the untouched placeholder", () => {
    expect(editGenderField).toContain('placeholder={t("mob.child.gender.none")}');
    expect(EDIT).toContain("label: t(GENDER_LABEL_KEYS[g])");
  });

  it("preselects only what the child's own row already says", () => {
    // Seeded from the saved column, and a NULL column (or a value this build
    // does not know) is whitelisted down to "" — the placeholder, never a guess.
    expect(EDIT).toContain('const [gender, setGender] = useState<ChildGender | "">(initialGender)');
    expect(EDIT).toContain("gender: asChildGender(row?.gender)");
    expect(EDIT).toContain('initialGender={savedQ.data?.gender ?? ""}');
    expect(FORM).toContain("export function asChildGender");
  });

  it("reads the column on the per-child query, not on the shared children list", () => {
    // fetchChildren backs Home, the subject sheets and the leaderboard headers.
    // A minor's gender belongs on none of them (migration 169).
    expect(read("src", "lib", "data.ts")).not.toContain("gender");
    expect(EDIT).toContain('.select("city_district_id, gender")');
  });

  it("is not required and carries no error slot", () => {
    expect(editGenderField).not.toContain("*");
    expect(editGenderField).not.toContain("error=");
    expect(code(EDIT)).not.toContain('"gender"'); // never a FieldErrors member
  });

  it("SAVING AN UNTOUCHED FIELD SENDS NOTHING — the erase bug", () => {
    const submit = EDIT.slice(EDIT.indexOf("await bffEditChild("), EDIT.indexOf("setPending(false)", EDIT.indexOf("await bffEditChild(")));
    expect(submit).toContain("...(gender ? { gender } : {})");
    expect(code(submit)).not.toMatch(/gender: gender \|\| null/);
    expect(code(submit)).not.toMatch(/gender: [^.]*\?\? null/);
  });
});

describe("the two 'no answer' strings stay tellable apart", () => {
  it("ships every gender string in az, en and ru", () => {
    for (const key of [
      "mob.child.gender.label",
      "mob.child.gender.none",
      "mob.child.gender.female",
      "mob.child.gender.male",
      "mob.child.gender.unspecified",
      "mob.child.gender.hint",
    ]) {
      expect(valuesOf(key)).toHaveLength(LOCALES);
    }
  });

  it("never phrases the placeholder and 'prefer not to say' the same way", () => {
    const none = valuesOf("mob.child.gender.none");
    const unspecified = valuesOf("mob.child.gender.unspecified");
    expect(none).toHaveLength(LOCALES);
    for (let i = 0; i < LOCALES; i++) {
      expect(none[i]).not.toBe(unspecified[i]);
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
    // what the parent has in front of them when they decide. Both halves,
    // in every locale: who sees it, and that access, tasks and ranking are
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

  it("asks the question in the same words the web app uses", () => {
    // One product, one voice: a parent who adds their first child on the site
    // and their second on the phone must not be told two different things about
    // the same field. The web string is `addchild.field.genderHint` — a
    // different key because this one is mobile-only copy, but never different
    // text. (The web catalog is the source of truth for everything else; the
    // sync script copies it into messages.generated.ts.)
    const web = readFileSync(
      resolve(__dirname, "..", "..", "web-app", "src", "i18n", "messages.ts"),
      "utf8",
    );
    const webHints = [
      ...web.matchAll(/"addchild\.field\.genderHint":\s*\n?\s*"([^"]*)"/g),
    ].map((m) => m[1]);
    expect(webHints).toHaveLength(LOCALES);
    expect(valuesOf("mob.child.gender.hint")).toEqual(webHints);
  });
});

describe("BFF contract (web-app /api/mobile/v1/children)", () => {
  it("create accepts the field and defers the whitelist to the shared core", () => {
    expect(CREATE_ROUTE).toContain('gender: bodyStr(body, "gender").trim() || null,');
    // The route must never decide what a legal value is — one whitelist.
    expect(code(CREATE_ROUTE)).not.toContain("female");
  });

  it("edit accepts the field and can never turn an absent one into a NULL write", () => {
    expect(EDIT_ROUTE).toContain('gender: bodyStr(body, "gender"),');
    expect(EDIT_ROUTE).not.toMatch(/gender:[^,\n]*\?\? null/);
    expect(EDIT_ROUTE).not.toContain("female");
  });

  it("both routes still authorize before they read anything", () => {
    for (const route of [CREATE_ROUTE, EDIT_ROUTE]) {
      const auth = route.indexOf("resolveBearerParent(request)");
      const body = route.indexOf("readJsonBody(request)");
      expect(auth).toBeGreaterThan(-1);
      expect(body).toBeGreaterThan(auth);
    }
  });
});
