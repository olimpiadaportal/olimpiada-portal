// The optional child gender (migration 169) — is it really optional, is it
// really whitelisted, and can a save that says nothing about it destroy an
// answer that is already on file?
//
// Those three questions are the whole surface. The column is NULLABLE with no
// default and carries two different "empty" states —
//
//   NULL          nobody has been asked yet (every row predating the field)
//   'unspecified' a parent WAS asked and declined
//
// — and every bug worth having a test for is a place where those two get
// collapsed. The dangerous one is not a rejected value; it is the quiet one:
// spreading an absent field into the UPDATE as `gender: null` so that a parent
// correcting a school name silently erases the answer they gave last month.
// Nothing in the UI would show it, and the export would report it as "never
// asked". So the assertions below check the PATCH ITSELF, not just the return
// value — a test that only asserted `ok: true` would pass on that bug.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStudentGender,
  parseStudentGender,
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

/** A complete, valid edit. `gender` is added per test — that is the variable. */
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
};

/** The patch the core sent to `students` (there is exactly one per save). */
function studentsPatch(): Record<string, unknown> {
  const row = patches.find((p) => p.table === "students");
  return row?.patch ?? {};
}

beforeEach(() => {
  patches.length = 0;
  ownerProfileId = PARENT;
  studentsUpdateError = null;
});

// ---------------------------------------------------------------------------
describe("parseStudentGender — the whitelist", () => {
  it("accepts each of the three enum values", () => {
    for (const value of STUDENT_GENDERS) {
      expect(parseStudentGender(value)).toEqual({ ok: true, value });
    }
  });

  it("accepts a value with surrounding whitespace, trimmed", () => {
    expect(parseStudentGender("  female \n")).toEqual({ ok: true, value: "female" });
  });

  it("treats every shape of ABSENT as 'no change', never as a value", () => {
    // `value: null` is the signal the cores read as "leave the column alone".
    // If any of these ever produced a string, an untouched control would start
    // writing to a minor's record.
    for (const absent of [undefined, null, "", "   ", "\t\n "]) {
      expect(parseStudentGender(absent)).toEqual({ ok: true, value: null });
    }
  });

  it("REJECTS anything outside the enum instead of coercing it", () => {
    // Case matters: the DB enum is lowercase, so 'Female' is a 22P02 at write
    // time. Refusing here turns that into a field error the parent can act on.
    for (const bad of [
      "Female",
      "MALE",
      "girl",
      "boy",
      "other",
      "non-binary",
      "n/a",
      "null",
      "undefined",
      "female,male",
      "'female'",
      "female; drop table students",
    ]) {
      const res = parseStudentGender(bad);
      expect(res.ok, `expected "${bad}" to be rejected`).toBe(false);
      expect(res.ok === false && res.errorKey).toBe("addchild.err.genderInvalid");
    }
  });

  it("REJECTS a non-string rather than stringifying it", () => {
    for (const bad of [0, 1, true, {}, [], ["female"], { value: "female" }]) {
      expect(parseStudentGender(bad).ok, `expected ${JSON.stringify(bad)} rejected`).toBe(
        false,
      );
    }
  });

  it("isStudentGender agrees with the enum and nothing else", () => {
    expect(STUDENT_GENDERS.every(isStudentGender)).toBe(true);
    expect(isStudentGender("Female")).toBe(false);
    expect(isStudentGender("")).toBe(false);
    expect(isStudentGender(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("validateChildInfo — optional, but not unvalidated", () => {
  const info = {
    firstName: "Aysel",
    lastName: "Məmmədova",
    districtId: CITY,
    cityDistrictId: RAYON,
    schoolId: SCHOOL,
    gradeId: GRADE,
  };

  it("passes with NO gender at all — it is never required", () => {
    expect(validateChildInfo(info)).toEqual({ ok: true });
    expect(validateChildInfo({ ...info, gender: null })).toEqual({ ok: true });
    expect(validateChildInfo({ ...info, gender: "" })).toEqual({ ok: true });
  });

  it("passes with each valid value", () => {
    for (const gender of STUDENT_GENDERS) {
      expect(validateChildInfo({ ...info, gender })).toEqual({ ok: true });
    }
  });

  it("fails with the gender key — and only that key — on a forged value", () => {
    const res = validateChildInfo({ ...info, gender: "attack-helicopter" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toEqual(["addchild.err.genderInvalid"]);
  });

  it("does not let an absent gender mask a genuinely missing field", () => {
    const res = validateChildInfo({ ...info, gradeId: "", gender: "" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.errors).toContain("addchild.err.gradeRequired");
  });
});

// ---------------------------------------------------------------------------
describe("updateChildProfileCore — an absent gender leaves the column alone", () => {
  it("OMITS the column entirely when the field is not sent", async () => {
    // THE BUG THIS PINS: `gender: params.gender ?? null` in the patch. It looks
    // harmless and it silently rewrites a stored answer to NULL — "never
    // asked" — on every unrelated save. The mobile BFF and every older client
    // send no gender at all, so this is the common path, not the rare one.
    const res = await updateChildProfileCore(baseEdit);
    expect(res).toEqual({ ok: true });
    expect(studentsPatch()).not.toHaveProperty("gender");
  });

  it("OMITS the column when the control was left on the placeholder", async () => {
    const res = await updateChildProfileCore({ ...baseEdit, gender: "" });
    expect(res).toEqual({ ok: true });
    expect(studentsPatch()).not.toHaveProperty("gender");
  });

  it("still writes every other edited field on that same save", async () => {
    await updateChildProfileCore(baseEdit);
    expect(studentsPatch()).toMatchObject({
      first_name: "Aysel",
      school_id: SCHOOL,
      grade_id: GRADE,
    });
  });

  it("writes each valid value when the parent actually chose one", async () => {
    for (const gender of STUDENT_GENDERS) {
      patches.length = 0;
      const res = await updateChildProfileCore({ ...baseEdit, gender });
      expect(res).toEqual({ ok: true });
      expect(studentsPatch().gender).toBe(gender);
    }
  });

  it("stores 'unspecified' as the real answer it is, not as an absence", async () => {
    // A parent who is asked and declines has said something. If this ever
    // started behaving like the placeholder, the export could no longer tell a
    // refusal from a row nobody ever asked about.
    await updateChildProfileCore({ ...baseEdit, gender: "unspecified" });
    expect(studentsPatch().gender).toBe("unspecified");
    expect(studentsPatch().gender).not.toBeNull();
  });

  it("REFUSES a forged value and writes NOTHING — not even the valid fields", async () => {
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
describe("i18n", () => {
  const KEYS = [
    "addchild.field.gender",
    "addchild.field.genderNone",
    "addchild.field.genderHint",
    "addchild.gender.female",
    "addchild.gender.male",
    "addchild.gender.unspecified",
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

  it("keeps 'not selected' and 'prefer not to say' worded APART in every locale", async () => {
    // They are different facts in the column, so they must be different
    // sentences on screen. A locale that translated both to the same phrase
    // would leave the parent unable to express the distinction at all.
    const { messages } = await import("@/i18n/messages");
    for (const locale of ["az", "en", "ru"] as const) {
      expect(
        messages[locale]["addchild.field.genderNone"].trim().toLowerCase(),
        `${locale} placeholder vs unspecified`,
      ).not.toBe(messages[locale]["addchild.gender.unspecified"].trim().toLowerCase());
    }
  });
});
