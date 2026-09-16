// The child gender — MANDATORY since 2026-09-16 (owner), and this file is the
// record of what that does and does not mean.
//
// IT REPLACES A TEST THAT PINNED THE OPPOSITE. The previous version of this
// file asserted "passes with NO gender at all — it is never required" and that
// an absent value must leave the column untouched. Both were correct for the
// optional field and both are now exactly the bugs to catch, so the file was
// rewritten rather than deleted: a rule with no test is a rule that lasts until
// the next refactor.
//
// FOUR THINGS ARE PINNED, AND THE THIRD IS THE ONE PEOPLE GET WRONG:
//
//   1. The FORM and the SERVER both require an answer. Client checks are UX;
//      validateChildInfo is what a hand-rolled POST, a stale bundle and the
//      mobile BFF all meet.
//   2. 'unspecified' LEFT THE UI AND STAYED IN THE DATABASE. Postgres cannot
//      drop an enum label, and the rows holding it recorded something true — a
//      parent who was asked and declined. Readers keep understanding it;
//      nothing offers it.
//   3. THE COLUMN IS STILL NULLABLE, and that is not an oversight. Production
//      holds 51 children whose gender is NULL, and there is no honest backfill
//      for a minor's personal data. "Mandatory" is a rule about what this
//      application accepts from a human today — never a claim about rows
//      written before the rule existed. So the codebase must KEEP being able
//      to express "nobody was ever asked", which is what the optional parser
//      is still for.
//   4. An edit WRITES the column unconditionally. While the field was
//      optional, the patch spread it in conditionally so that correcting a
//      school name could not blank an answer given last month. Keep that
//      conditional next to a form that now requires an answer and you get the
//      other failure: a save the parent is told succeeded and the database
//      never made.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COLLECTED_STUDENT_GENDERS,
  isCollectedStudentGender,
  isStudentGender,
  parseStudentGender,
  parseStudentGenderRequired,
  STUDENT_GENDERS,
} from "@/lib/studentGender";
import { validateChildInfo } from "@/lib/auth/children";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: async () => {} }));

const PARENT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const OTHER_PARENT = "9f8c1d2e-1111-4222-8333-444455556666";
const STUDENT = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CITY = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
const RAYON = "c56a4180-65aa-42ec-a945-5fd21dec0538";
const SCHOOL = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const GRADE = "16fd2706-8baf-433b-82eb-8c7fada847da";

/** Every UPDATE the core issued, in order, with the exact patch object. */
const patches: { table: string; patch: Record<string, unknown> }[] = [];
let ownerProfileId: string | null = PARENT;
let studentsUpdateError: { code?: string } | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: () => true,
  getAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === "city_districts") {
          // .select("id", {count}).eq(city).eq(status) → { count }
          return { eq: () => ({ eq: async () => ({ count: 0, error: null }) }) };
        }
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: ownerProfileId
                ? { created_by_parent_profile_id: ownerProfileId }
                : null,
              error: null,
            }),
          }),
        };
      },
      update: (patch: Record<string, unknown>) => {
        patches.push({ table, patch });
        return {
          eq: async () => ({
            error: table === "students" ? studentsUpdateError : null,
          }),
        };
      },
    }),
  }),
}));

const { updateChildProfileCore } = await import("@/lib/auth/parentCore");

/** A complete, valid edit. `gender` is overridden per test — it is the variable. */
const baseEdit = {
  parentProfileId: PARENT,
  studentProfileId: STUDENT,
  firstName: "Aysel",
  lastName: "Məmmədova",
  districtId: CITY,
  cityDistrictId: RAYON,
  schoolId: SCHOOL,
  gradeId: GRADE,
  schoolName: "132 nömrəli məktəb",
  classGrade: "5",
  city: "Bakı",
  gender: "female",
};

/** The patch the core sent to `students` (there is exactly one per save). */
function studentsPatch(): Record<string, unknown> {
  const row = patches.find((p) => p.table === "students");
  return row?.patch ?? {};
}

const src = (...parts: string[]) =>
  readFileSync(join(process.cwd(), "src", ...parts), "utf8");

beforeEach(() => {
  patches.length = 0;
  ownerProfileId = PARENT;
  studentsUpdateError = null;
});

// ---------------------------------------------------------------------------
describe("the two catalogs — what a ROW may say vs what a PARENT may send", () => {
  it("keeps 'unspecified' a legal stored value", () => {
    // Deleting it from STUDENT_GENDERS would make the admin export, the
    // workbook and every reader of a pre-2026-09-16 row unable to name what
    // those rows actually hold.
    expect(STUDENT_GENDERS).toContain("unspecified");
    expect(isStudentGender("unspecified")).toBe(true);
  });

  it("does not offer it as an answer any more", () => {
    expect(COLLECTED_STUDENT_GENDERS).toEqual(["female", "male"]);
    expect(isCollectedStudentGender("unspecified")).toBe(false);
  });

  it("keeps the collectable set a strict SUBSET of the enum", () => {
    // A value a form can send that the column cannot hold is a 22P02 the parent
    // reads as "server error"; the containment is what makes the two safe to
    // keep apart.
    for (const g of COLLECTED_STUDENT_GENDERS) expect(isStudentGender(g)).toBe(true);
    expect(COLLECTED_STUDENT_GENDERS.length).toBeLessThan(STUDENT_GENDERS.length);
  });
});

// ---------------------------------------------------------------------------
describe("parseStudentGender — the OPTIONAL mode, kept on purpose", () => {
  // THE COLUMN IS STILL NULLABLE (point 3 in the header). This parser is how
  // the codebase says "no answer" without inventing one, and it must keep
  // working even though no parent-facing path uses it any more.
  it("treats every shape of ABSENT as 'no change', never as a value", () => {
    for (const absent of [undefined, null, "", "   ", "\t\n "]) {
      expect(parseStudentGender(absent)).toEqual({ ok: true, value: null });
    }
  });

  it("still accepts each of the three STORED values", () => {
    for (const value of STUDENT_GENDERS) {
      expect(parseStudentGender(value)).toEqual({ ok: true, value });
    }
  });

  it("REJECTS anything outside the enum instead of coercing it", () => {
    for (const bad of ["Female", "MALE", "girl", "boy", "other", "n/a", "null"]) {
      const res = parseStudentGender(bad);
      expect(res.ok, `expected "${bad}" to be rejected`).toBe(false);
      expect(res.ok === false && res.errorKey).toBe("addchild.err.genderInvalid");
    }
  });
});

// ---------------------------------------------------------------------------
describe("parseStudentGenderRequired — the mode every parent path uses", () => {
  it("accepts the two collectable answers, trimmed", () => {
    expect(parseStudentGenderRequired("female")).toEqual({ ok: true, value: "female" });
    expect(parseStudentGenderRequired("  male \n")).toEqual({ ok: true, value: "male" });
  });

  it("REFUSES an absent answer with its own key", () => {
    // Its OWN key, not genderInvalid: error keys are a contract shared with the
    // mobile BFF, and "you did not answer" and "that is not a value" are
    // different sentences to a parent looking at a select.
    for (const absent of [undefined, null, "", "   "]) {
      const res = parseStudentGenderRequired(absent);
      expect(res.ok).toBe(false);
      expect(res.ok === false && res.errorKey).toBe("addchild.err.genderRequired");
    }
  });

  it("REFUSES the retired 'unspecified' — as unanswered, not as invalid", () => {
    // It is a legal thing for a ROW to say and no longer a legal thing for a
    // FORM to send, so the honest message is "choose one".
    const res = parseStudentGenderRequired("unspecified");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errorKey).toBe("addchild.err.genderRequired");
  });

  it("keeps genderInvalid for a value the column does not know", () => {
    for (const bad of ["Female", "girl", "non-binary", "female,male", "'female'"]) {
      const res = parseStudentGenderRequired(bad);
      expect(res.ok, `expected "${bad}" to be rejected`).toBe(false);
      expect(res.ok === false && res.errorKey).toBe("addchild.err.genderInvalid");
    }
  });

  it("REJECTS a non-string rather than stringifying it", () => {
    for (const bad of [0, 1, true, {}, [], ["female"], { value: "female" }]) {
      expect(
        parseStudentGenderRequired(bad).ok,
        `expected ${JSON.stringify(bad)} rejected`,
      ).toBe(false);
    }
  });

  it("never answers ok with a null value", () => {
    // The success type carries no null so a writer can spread it
    // unconditionally. If this ever became nullable, the conditional patch this
    // whole change removed would look reasonable again.
    for (const raw of [undefined, null, "", "female", "male", "unspecified", "x"]) {
      const res = parseStudentGenderRequired(raw);
      if (res.ok) expect(res.value).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
describe("validateChildInfo — required at the SERVER, not just on the form", () => {
  const info = {
    firstName: "Aysel",
    lastName: "Məmmədova",
    districtId: CITY,
    cityDistrictId: RAYON,
    schoolId: SCHOOL,
    gradeId: GRADE,
  };

  it("REFUSES a child with no gender at all", () => {
    for (const absent of [null, ""]) {
      const res = validateChildInfo({ ...info, gender: absent });
      expect(res.ok).toBe(false);
      expect(res.ok === false && res.errors).toEqual(["addchild.err.genderRequired"]);
    }
  });

  it("passes with each collectable value", () => {
    for (const gender of COLLECTED_STUDENT_GENDERS) {
      expect(validateChildInfo({ ...info, gender })).toEqual({ ok: true });
    }
  });

  it("refuses 'unspecified' — the UI cannot send it and neither can anything else", () => {
    const res = validateChildInfo({ ...info, gender: "unspecified" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toEqual(["addchild.err.genderRequired"]);
  });

  it("fails with the gender key — and only that key — on a forged value", () => {
    const res = validateChildInfo({ ...info, gender: "attack-helicopter" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toEqual(["addchild.err.genderInvalid"]);
  });

  it("does not let a missing gender mask another genuinely missing field", () => {
    const res = validateChildInfo({ ...info, gradeId: "", gender: "" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toContain("addchild.err.gradeRequired");
    expect(res.ok === false && res.errors).toContain("addchild.err.genderRequired");
  });
});

// ---------------------------------------------------------------------------
describe("updateChildProfileCore — the column is written, never skipped", () => {
  it("REFUSES a save that says nothing about the gender, and writes NOTHING", async () => {
    // THE BUG THIS PINS, and it is the inverse of the one the old test pinned:
    // `...(gender.ok && gender.value ? { gender } : {})`. Next to a form that
    // requires an answer, that conditional reports a successful save for an
    // UPDATE that never carried the field. Not even the valid fields go in —
    // a refusal is not a partial write.
    const res = await updateChildProfileCore({ ...baseEdit, gender: "" });
    expect(res).toEqual({
      ok: false,
      validationErrors: ["addchild.err.genderRequired"],
    });
    expect(patches).toEqual([]);
  });

  it("writes each collectable value the parent chose", async () => {
    for (const gender of COLLECTED_STUDENT_GENDERS) {
      patches.length = 0;
      const res = await updateChildProfileCore({ ...baseEdit, gender });
      expect(res).toEqual({ ok: true });
      expect(studentsPatch().gender).toBe(gender);
    }
  });

  it("puts the column in the patch on EVERY successful save", async () => {
    // Not "when it changed": the edit form posts what is on screen, and a save
    // that silently omits a required field is the failure this whole change is
    // about. A legacy child is answered by exactly this path.
    await updateChildProfileCore(baseEdit);
    expect(studentsPatch()).toHaveProperty("gender");
    expect(studentsPatch().gender).not.toBeNull();
  });

  it("still writes every other edited field on that same save", async () => {
    await updateChildProfileCore(baseEdit);
    expect(studentsPatch()).toMatchObject({
      first_name: "Aysel",
      school_id: SCHOOL,
      grade_id: GRADE,
    });
  });

  it("REFUSES a forged value and writes NOTHING", async () => {
    const res = await updateChildProfileCore({ ...baseEdit, gender: "Female" });
    expect(res).toEqual({
      ok: false,
      validationErrors: ["addchild.err.genderInvalid"],
    });
    expect(patches).toEqual([]);
  });

  it("re-verifies ownership BEFORE it would write anyone's gender", async () => {
    ownerProfileId = OTHER_PARENT;
    const res = await updateChildProfileCore({ ...baseEdit, gender: "female" });
    expect(res).toEqual({ ok: false, errorKey: "childedit.err.notYourChild" });
    expect(patches).toEqual([]);
  });

  it("returns the generic key — never a Postgres message — when the write fails", async () => {
    studentsUpdateError = { code: "22P02" };
    const res = await updateChildProfileCore({ ...baseEdit, gender: "male" });
    expect(res).toEqual({ ok: false, errorKey: "childedit.err.generic" });
  });
});

// ---------------------------------------------------------------------------
describe("the surfaces ask the question they now require an answer to", () => {
  // Source-level: rendering these needs a component renderer this project does
  // not depend on, and each of the rules below is a one-line omission that
  // compiles and ships.
  const FIELD = src("components", "ChildGenderField.tsx");
  const WIZARD = src("components", "AddChildWizard.tsx");
  const EDIT = src("components", "ChildInfoEditForm.tsx");
  /** Comments stripped: every rule is also NAMED in the prose beside it. */
  const code = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  it("the field offers the two collectable values and no third option", () => {
    expect(code(FIELD)).toContain("COLLECTED_STUDENT_GENDERS.map");
    expect(code(FIELD)).not.toContain("unspecified");
  });

  it("the field has lost the '(optional)' suffix and gained the required mark", () => {
    expect(code(FIELD)).not.toContain("field.optional");
    expect(code(FIELD)).toMatch(/addchild\.field\.gender"\)\} \*/);
    expect(code(FIELD)).toMatch(/\brequired\b/);
  });

  it("the field renders the refusal under the select", () => {
    // In a list at the foot of a long wizard step, a required-field message is
    // a message the parent scrolls past.
    expect(code(FIELD)).toContain("className=\"field-error\"");
  });

  it("the Add-Child step cannot advance without an answer", () => {
    expect(code(WIZARD)).toContain('local.push("addchild.err.genderRequired")');
  });

  it("the Edit form requires one too", () => {
    expect(code(EDIT)).toContain('errs.gender = "addchild.err.genderRequired"');
  });

  it("the Edit form seeds a LEGACY child to the placeholder, not to a guess", () => {
    // NULL ("never asked") and 'unspecified' ("asked, declined") are both
    // unofferable now, so both must land on the placeholder and be answered.
    // Seeding from the full enum would put 'unspecified' back on screen; a
    // default would invent an answer nobody gave.
    expect(code(EDIT)).toContain("isCollectedStudentGender(initial.gender)");
    expect(code(EDIT)).not.toContain("isStudentGender(initial.gender)");
  });
});

// ---------------------------------------------------------------------------
describe("i18n", () => {
  const KEYS = [
    "addchild.field.gender",
    "addchild.field.genderNone",
    "addchild.field.genderHint",
    "addchild.gender.female",
    "addchild.gender.male",
    "addchild.err.genderRequired",
    "addchild.err.genderInvalid",
  ];

  it("ships every gender string in all three locales", async () => {
    const { messages } = await import("@/i18n/messages");
    for (const locale of ["az", "en", "ru"] as const) {
      for (const key of KEYS) {
        const value = messages[locale][key];
        expect(typeof value, `${locale} ${key}`).toBe("string");
        expect(value.trim().length, `${locale} ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the retired 'prefer not to say' string, worded apart from the placeholder", async () => {
    // It is no longer offered, and the key stays: the export names stored
    // values with it, and a dictionary that drops a key a cached bundle still
    // asks for renders the key itself on a parent's screen.
    const { messages } = await import("@/i18n/messages");
    for (const locale of ["az", "en", "ru"] as const) {
      const unspecified = messages[locale]["addchild.gender.unspecified"];
      expect(typeof unspecified, `${locale} unspecified`).toBe("string");
      expect(
        messages[locale]["addchild.field.genderNone"].trim().toLowerCase(),
        `${locale} placeholder vs unspecified`,
      ).not.toBe(unspecified.trim().toLowerCase());
    }
  });

  it("says 'you did not answer' and 'that is not a value' differently", async () => {
    const { messages } = await import("@/i18n/messages");
    for (const locale of ["az", "en", "ru"] as const) {
      expect(messages[locale]["addchild.err.genderRequired"]).not.toBe(
        messages[locale]["addchild.err.genderInvalid"],
      );
    }
  });

  it("no longer tells a parent they may leave the field blank", async () => {
    // The refusal used to end "…or leave it blank", which stopped being true
    // the moment the field became mandatory — and an error message that
    // suggests an impossible way out is worse than no message.
    const { messages } = await import("@/i18n/messages");
    const blank: Record<"az" | "en" | "ru", RegExp> = {
      az: /boş buraxın/i,
      en: /leave it blank/i,
      ru: /оставьте поле пустым/i,
    };
    for (const locale of ["az", "en", "ru"] as const) {
      expect(messages[locale]["addchild.err.genderInvalid"]).not.toMatch(blank[locale]);
    }
  });
});
