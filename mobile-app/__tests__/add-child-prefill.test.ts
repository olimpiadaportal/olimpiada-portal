// PREFILLING THE SECOND CHILD — WHAT MAY BE CARRIED OVER, AND WHAT MAY NOT.
//
// The feature is one sentence ("the second child usually lives in the same
// household as the first"), and every way it can go wrong is a field on the
// wrong side of one line:
//
//   * A CHILD-SPECIFIC FIELD CARRIED OVER. A grade is not implied by a school
//     — and the entitled grade selects an olympiad question pool, so an
//     inherited one is a wrong answer with consequences rather than a typo. A
//     gender is worse still: EMPTY_CHILD_INFO forbids ANY default selection
//     because a preselected value is indistinguishable from a real answer once
//     it is in the column, and a prefilled one would record an answer the
//     parent never gave, about a DIFFERENT child.
//   * A LOCATION THE SERVER WOULD REJECT. "Populated" is not the goal; VALID
//     is. A rayon that contradicts the school's own rayon is refused by
//     student_district_guard, and a rayon the catalogue no longer lists is one
//     the select cannot even show. The opposite failure is just as real, and is
//     the one that was REPORTED: the rule used to drop the whole location at
//     the first doubt, so a school with no rayon recorded — a perfectly
//     ordinary row — cost the parent the city and the school as well, leaving
//     "it prefills the surname but not the school".
//   * A SEED THAT OVERWRITES THE PARENT. The reads land after the first render.
//     A seed that fires whenever the data arrives can wipe what is already
//     being typed — and one that re-fires can undo a deliberate clear.
//   * THE WRONG SIBLING, OR SOMEBODY ELSE'S. `fetchChildren` also returns
//     children this parent is merely LINKED to, whose household is not theirs.
//
// HOW THE MUTATION GUARD WORKS. The split is DATA — PREFILL_FIELDS and
// CHILD_ONLY_FIELDS — and it is checked from both ends, so moving a field
// across the line fails whichever way it is done: the membership tests pin the
// two lists literally, and the patch test compares against a HAND-WRITTEN
// object rather than one derived from those lists, so a `siblingPrefillPatch`
// taught to copy a fifth field fails even if the lists were updated to match.
//
// IMPORTS, AND THE SIX MOCKS. The rule under test is pure (childPrefill.ts has
// no runtime imports at all), but the assertions are only worth something
// against the REAL validator and the REAL payload builder, and both live in
// ChildInfoForm.tsx next to the component. Importing that file drags in the
// Supabase client, the locale store and the icon packages for no gain, so the
// leaves are stubbed and nothing is rendered — this project has no renderer
// harness. Everything that matters (validateChildInfo, buildAddChildFields,
// EMPTY_CHILD_INFO) is plain exported functions and data.
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
  buildAddChildFields,
  validateChildInfo,
  type ChildInfo,
} from "@/features/parent/ChildInfoForm";
import {
  CHILD_ONLY_FIELDS,
  PREFILL_FIELDS,
  clearPrefilledFields,
  decidePrefill,
  isPristineChildInfo,
  pickPrefillSource,
  siblingPrefillPatch,
  type PrefillCandidate,
  type PrefillInputs,
  type SourceLocation,
} from "@/features/parent/childPrefill";

const read = (...parts: string[]) => readFileSync(resolve(__dirname, "..", ...parts), "utf8");

const ADD_CHILD = read("src", "app", "(parent)", "add-child.tsx");
const DATA = read("src", "lib", "data.ts");
const QUERIES = read("src", "features", "parent", "queries.ts");
const MESSAGES = read("src", "i18n", "messages.mobile.ts");

const PARENT = "parent-1";
const OTHER_PARENT = "parent-2";

/** A children-list row as the prefill sees it, plus one field it must never
 *  read — `grade_id` is on the real row and is the likeliest thing to leak. */
type Fake = PrefillCandidate & { grade_id: string | null };

function child(over: Partial<Fake> = {}): Fake {
  return {
    profile_id: "child-1",
    first_name: "Ayan",
    last_name: "Əliyeva",
    district_id: "city-baku",
    school_id: "school-7",
    created_by_parent_profile_id: PARENT,
    grade_id: "grade-5",
    ...over,
  };
}

/** What the catalogue says about the source child's saved location — the happy
 *  case: the city is active, it has rayons, and the school sits in the very
 *  rayon the sibling's own row records. */
function location(over: Partial<SourceLocation> = {}): SourceLocation {
  return {
    cityActive: true,
    cityHasRayons: true,
    rayonIds: ["rayon-nesimi", "rayon-sebail"],
    school: { id: "school-7", rayonId: "rayon-nesimi" },
    ...over,
  };
}

/** decidePrefill inputs with every read settled and the form untouched. */
function ready(over: Partial<PrefillInputs<Fake>> = {}): PrefillInputs<Fake> {
  return {
    childrenReady: true,
    source: child(),
    catalogReady: true,
    rayon: { status: "ready", id: "rayon-nesimi" },
    location: location(),
    pristine: true,
    ...over,
  };
}

/** The form state after applying a decision to an untouched wizard. */
function seeded(inputs: PrefillInputs<Fake> = ready()): ChildInfo {
  const d = decidePrefill(inputs);
  return d.kind === "apply" ? { ...EMPTY_CHILD_INFO, ...d.patch } : { ...EMPTY_CHILD_INFO };
}

const EMPTY_CATALOGS = { grades: [], cities: [], schools: [] };

// ---------------------------------------------------------------------------

describe("the shared / child-specific split", () => {
  // The two lists ARE the classification. Pinned literally so moving a field
  // across the line is a failing diff and not a silent behaviour change.
  it("carries over exactly surname, city, rayon and school", () => {
    expect([...PREFILL_FIELDS].sort()).toEqual(
      ["cityDistrictId", "cityId", "lastName", "schoolId"].sort(),
    );
  });

  it("holds back exactly first name, grade, gender and password", () => {
    expect([...CHILD_ONLY_FIELDS].sort()).toEqual(
      ["firstName", "gender", "gradeId", "password"].sort(),
    );
  });

  // A field in neither list is a field nobody decided about — which is how a
  // new column silently inherits whichever behaviour the code happens to give
  // it. The union has to be the whole form, with no overlap.
  it("classifies every ChildInfo field exactly once", () => {
    const classified = [...PREFILL_FIELDS, ...CHILD_ONLY_FIELDS];
    expect(new Set(classified).size).toBe(classified.length);
    expect(classified.sort()).toEqual(Object.keys(EMPTY_CHILD_INFO).sort());
  });

  // isPristineChildInfo reads "untouched" as "every value is the empty string",
  // which is only true while EMPTY_CHILD_INFO says so. A field added later with
  // a different empty state would make the form read as edited forever and the
  // prefill would never fire.
  it("agrees with EMPTY_CHILD_INFO about what untouched means", () => {
    expect(Object.values(EMPTY_CHILD_INFO).every((v) => v === "")).toBe(true);
    expect(isPristineChildInfo(EMPTY_CHILD_INFO)).toBe(true);
    expect(isPristineChildInfo({ ...EMPTY_CHILD_INFO, firstName: "A" })).toBe(false);
  });
});

describe("a second child", () => {
  // THE MUTATION TEST. Hand-written, not derived from PREFILL_FIELDS: a patch
  // builder taught to copy a fifth field fails here even if both lists were
  // updated to agree with it.
  it("prefills the shared set and nothing else", () => {
    expect(seeded()).toEqual({
      ...EMPTY_CHILD_INFO,
      lastName: "Əliyeva",
      cityId: "city-baku",
      cityDistrictId: "rayon-nesimi",
      schoolId: "school-7",
    });
  });

  it("leaves every child-specific field exactly as the form mounted", () => {
    const form = seeded();
    for (const f of CHILD_ONLY_FIELDS) expect(form[f]).toBe(EMPTY_CHILD_INFO[f]);
  });

  // The point of the all-or-nothing location: what is filled is also VALID.
  // Only the fields the prefill deliberately left blank may still be flagged.
  it("passes validation on every field it filled", () => {
    // `gender` belongs in this list and must stay there: it is REQUIRED now,
    // and the prefill must still never answer it — see CHILD_ONLY_FIELDS above.
    const errors = validateChildInfo(seeded(), true);
    expect(Object.keys(errors).sort()).toEqual(["firstName", "gender", "gradeId", "password"]);
  });

  it("puts the seeded ids on the wire unchanged", () => {
    // The gender is supplied HERE, by the parent, because the payload builder
    // accepts nothing else — which is the point: the seed could not have
    // supplied it, and the form would not have submitted without it.
    const fields = buildAddChildFields({ ...seeded(), gender: "female" }, EMPTY_CATALOGS);
    expect(fields.last_name).toBe("Əliyeva");
    expect(fields.district_id).toBe("city-baku"); // the CITY (naming trap)
    expect(fields.city_district_id).toBe("rayon-nesimi"); // the RAYON
    expect(fields.school_id).toBe("school-7");
    expect(seeded().gender).toBe("");
  });

  it("never carries a rayon into a city that has none", () => {
    const form = seeded(
      ready({
        rayon: { status: "ready", id: "stale" },
        location: location({
          cityHasRayons: false,
          rayonIds: [],
          school: { id: "school-7", rayonId: "" },
        }),
      }),
    );
    expect(form.cityDistrictId).toBe("");
    expect(form.cityId).toBe("city-baku");
    expect(form.schoolId).toBe("school-7");
    expect(validateChildInfo(form, false).cityDistrictId).toBeUndefined();
  });

  // THE REPORTED BUG, PINNED. A school with no rayon recorded is an ordinary
  // row — filterSchoolsByRayon keeps those selectable under every rayon, and
  // the server accepts them under any rayon of their city — but it did not
  // match the sibling's saved rayon, so the source was judged invalid and the
  // city and the school were dropped with it. The parent was left retyping the
  // school they had entered minutes earlier.
  it("still prefills the city and the school when the school has no rayon", () => {
    const form = seeded(
      ready({
        rayon: { status: "ready", id: "" },
        location: location({ school: { id: "school-7", rayonId: "" } }),
      }),
    );
    expect(form.cityId).toBe("city-baku");
    expect(form.schoolId).toBe("school-7");
    // The one field that cannot be derived is left to the parent — and it is
    // required, so they are ASKED for it rather than submitting a half-form.
    expect(form.cityDistrictId).toBe("");
    expect(validateChildInfo(form, true).cityDistrictId).toBe("addchild.err.districtRequired");
  });

  // The same missing answer, but this school HAS a rayon: take it. That is the
  // database's own rule — student_district_guard auto-fills the student's rayon
  // from the school — so the pair can never be one the server refuses.
  it("takes the rayon from the school when the sibling's row does not have one", () => {
    const form = seeded(ready({ rayon: { status: "ready", id: "" } }));
    expect(form.cityDistrictId).toBe("rayon-nesimi");
    expect(form.schoolId).toBe("school-7");
  });

  // An admin moved the school after the sibling was created, so the saved rayon
  // is stale and posting it would be refused ("district % contradicts the
  // school's district"). The school's current rayon wins.
  it("prefers the school's rayon over a stale saved one", () => {
    const form = seeded(
      ready({
        rayon: { status: "ready", id: "rayon-sebail" },
        location: location({ school: { id: "school-7", rayonId: "rayon-nesimi" } }),
      }),
    );
    expect(form.cityDistrictId).toBe("rayon-nesimi");
  });

  // A rayon the catalogue no longer lists is one the select cannot show:
  // seeding it would leave the trigger reading "not selected" over a state that
  // holds an id, and satisfy the required check on a value nobody can see.
  it("never seeds a rayon the form could not display", () => {
    const form = seeded(
      ready({ location: location({ school: { id: "school-7", rayonId: "rayon-archived" } }) }),
    );
    expect(form.cityDistrictId).toBe("");
    expect(form.schoolId).toBe("school-7");
  });

  it("carries the city without a school when the sibling has none on file", () => {
    const form = seeded(
      ready({ source: child({ school_id: null }), location: location({ school: null }) }),
    );
    expect(form.cityId).toBe("city-baku");
    expect(form.cityDistrictId).toBe("rayon-nesimi");
    expect(form.schoolId).toBe("");
  });

  // The city anchors the other two — a rayon belongs to one city and a school
  // belongs to one city — so a city the catalogue has dropped takes them with
  // it.
  it("carries no location at all once the city is gone from the catalogue", () => {
    const form = seeded(ready({ location: location({ cityActive: false }) }));
    expect(form).toEqual({ ...EMPTY_CHILD_INFO, lastName: "Əliyeva" });
  });

  it("carries no location when the sibling's row never had a city", () => {
    const form = seeded(ready({ source: child({ district_id: null }) }));
    expect(form).toEqual({ ...EMPTY_CHILD_INFO, lastName: "Əliyeva" });
  });

  it("skips entirely when there is nothing worth carrying", () => {
    const bare = child({ last_name: null, district_id: null, school_id: null });
    expect(decidePrefill(ready({ source: bare, location: location({ school: null }) })).kind).toBe(
      "skip",
    );
  });

  it("trims a surname rather than seeding its padding", () => {
    expect(
      siblingPrefillPatch(child({ last_name: "  Əliyeva  " }), "rayon-nesimi", location()).lastName,
    ).toBe("Əliyeva");
  });
});

describe("the first child — today's behaviour, unchanged", () => {
  it("has no source to copy from", () => {
    expect(pickPrefillSource([], PARENT)).toBeNull();
    expect(pickPrefillSource(undefined, PARENT)).toBeNull();
  });

  it("decides to skip, not to wait, so the screen never stalls on it", () => {
    expect(decidePrefill(ready({ source: null })).kind).toBe("skip");
  });

  it("leaves the wizard exactly as it mounted", () => {
    expect(seeded(ready({ source: null }))).toEqual(EMPTY_CHILD_INFO);
    expect(isPristineChildInfo(seeded(ready({ source: null })))).toBe(true);
  });

  // Still the FIRST child of THIS parent even though the list is not empty:
  // the other rows belong to a household this parent did not create.
  it("ignores children this parent is only linked to", () => {
    const linked = [child({ profile_id: "x", created_by_parent_profile_id: OTHER_PARENT })];
    expect(pickPrefillSource(linked, PARENT)).toBeNull();
    expect(decidePrefill(ready({ source: pickPrefillSource(linked, PARENT) })).kind).toBe("skip");
  });

  it("copies nothing while the account id is still unknown", () => {
    expect(pickPrefillSource([child()], null)).toBeNull();
  });
});

describe("which sibling wins when they disagree", () => {
  // fetchChildren orders created_at ASCENDING, so the most recently created
  // child is the LAST match — the household state the parent last confirmed.
  it("takes the most recently created child this parent created", () => {
    const list = [
      child({ profile_id: "a", school_id: "school-old" }),
      child({ profile_id: "b", school_id: "school-new" }),
    ];
    expect(pickPrefillSource(list, PARENT)?.profile_id).toBe("b");
    // `location.school` is the catalogue row for the SOURCE child's school_id,
    // so it moves with the source — that is the invariant the screen keeps.
    const from = pickPrefillSource(list, PARENT);
    const loc = location({ school: { id: "school-new", rayonId: "rayon-nesimi" } });
    expect(seeded(ready({ source: from, location: loc })).schoolId).toBe("school-new");
  });

  it("skips a linked row even when it is the newest", () => {
    const list = [
      child({ profile_id: "mine", school_id: "school-mine" }),
      child({ profile_id: "linked", created_by_parent_profile_id: OTHER_PARENT }),
    ];
    expect(pickPrefillSource(list, PARENT)?.profile_id).toBe("mine");
  });

  // "Most recent" is only meaningful while the list arrives in that order, and
  // ChildRow carries no timestamp for the client to re-sort by.
  it("rests on fetchChildren's ascending order", () => {
    expect(DATA.replace(/\s+/g, " ")).toContain('.order("created_at", { ascending: true })');
  });
});

describe("the seed never fights the parent", () => {
  const cases: [string, PrefillInputs<Fake>, "wait" | "skip"][] = [
    ["the children list has not answered", ready({ childrenReady: false }), "wait"],
    ["the rayon catalogue has not answered", ready({ catalogReady: false }), "wait"],
    ["the rayon read is in flight", ready({ rayon: { status: "pending", id: "" } }), "wait"],
    // The reads land after the first render; whatever is already typed wins,
    // and the decision is settled for good so nothing appears later under the
    // parent's fingers.
    ["the parent already started typing", ready({ pristine: false }), "skip"],
  ];
  for (const [name, inputs, kind] of cases) {
    it(`${kind}s while ${name}`, () => {
      expect(decidePrefill(inputs).kind).toBe(kind);
    });
  }

  it("never returns a patch it would not apply", () => {
    for (const [, inputs] of cases) {
      const d = decidePrefill(inputs);
      expect(d).not.toHaveProperty("patch");
    }
  });

  // A FAILED rayon read used to skip the whole seed, on the grounds that it
  // "cannot tell a NULL column from an unread one". True — and no longer
  // decisive, because the rayon is taken from the SCHOOL: both cases are just
  // "the sibling's row did not supply one", which the resolution already
  // handles. Losing the city and the school over it is the same surname-only
  // bug by another route.
  it("degrades to the school's rayon when the per-child read fails", () => {
    const form = seeded(ready({ rayon: { status: "error", id: "" } }));
    expect(form.cityId).toBe("city-baku");
    expect(form.schoolId).toBe("school-7");
    expect(form.cityDistrictId).toBe("rayon-nesimi");
  });
});

describe("a cleared field stays cleared", () => {
  const typed: ChildInfo = {
    ...seeded(),
    firstName: "Nihat",
    gradeId: "grade-3",
    password: "Parol-12345",
    gender: "male",
  };
  const cleared = clearPrefilledFields(typed);

  it("empties exactly the prefilled fields", () => {
    for (const f of PREFILL_FIELDS) expect(cleared[f]).toBe("");
  });

  it("keeps everything the parent entered themselves", () => {
    expect(cleared.firstName).toBe("Nihat");
    expect(cleared.gradeId).toBe("grade-3");
    expect(cleared.password).toBe("Parol-12345");
    expect(cleared.gender).toBe("male");
  });

  it("submits empty — nothing of the sibling survives into the payload", () => {
    const fields = buildAddChildFields({ ...cleared, gender: "male" }, EMPTY_CATALOGS);
    expect(fields.last_name).toBe("");
    expect(fields.district_id).toBe("");
    expect(fields.city_district_id).toBe("");
    expect(fields.school_id).toBe("");
  });

  it("still fails validation on the required fields it emptied", () => {
    const errors = validateChildInfo(cleared, true);
    expect(errors.lastName).toBe("auth.child.err.lastNameRequired");
    expect(errors.cityId).toBe("addchild.err.cityRequired");
    expect(errors.schoolId).toBe("addchild.err.schoolRequired");
  });

  it("fails on the rayon too once a city with rayons is chosen again", () => {
    const errors = validateChildInfo({ ...cleared, cityId: "city-baku" }, true);
    expect(errors.cityDistrictId).toBe("addchild.err.districtRequired");
  });

  // The clear leaves the form pristine in the four fields it emptied, so only
  // the screen's own flag stops the seed running a second time and undoing it.
  it("is final: the screen settles the decision and the clear keeps it settled", () => {
    expect(ADD_CHILD).toContain("if (prefill.decided) return;");
    expect(ADD_CHILD.replace(/\s+/g, " ")).toContain(
      "setInfo(clearPrefilledFields); setPrefill({ decided: true, from: null });",
    );
  });

  // "Add another child" is the second-child case itself, so that one path DOES
  // re-arm — from the child just created.
  it("re-arms only when the wizard is reset for another child", () => {
    const reset = ADD_CHILD.slice(ADD_CHILD.indexOf("function resetForAnother"));
    expect(reset.slice(0, reset.indexOf("\n  }")).replace(/\s+/g, " ")).toContain(
      "setPrefill({ decided: false, from: null })",
    );
  });
});

describe("the parent is told it happened", () => {
  it("renders the notice, its source name and the clear control", () => {
    expect(ADD_CHILD).toContain('t("mob.addchild.prefill.title")');
    expect(ADD_CHILD).toContain('t("mob.addchild.prefill.clear")');
    expect(ADD_CHILD.replace(/\s+/g, " ")).toContain(
      't("mob.addchild.prefill.body").replace("{name}", prefill.from)',
    );
  });

  // A locale that loses the placeholder drops the source child's name and the
  // notice stops being checkable by the parent — trilingual or not at all.
  it("names the source child in all three languages", () => {
    const bodies = [...MESSAGES.matchAll(/"mob\.addchild\.prefill\.body":\s*"([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(bodies).toHaveLength(3);
    for (const b of bodies) expect(b).toContain("{name}");
  });

  it("hands the rule the catalogue row, not a verdict about it", () => {
    // The screen REPORTS what the catalogues currently hold; every judgement
    // lives in childPrefill.ts, where it can be tested. The school is passed
    // whole — a NULL city_district_id included, because that is a real and
    // selectable kind of school — instead of being collapsed into a
    // valid/invalid flag, which is the shape that lost the city and the school
    // along with the rayon.
    expect(ADD_CHILD).not.toContain("sourceCatalogValid");
    expect(ADD_CHILD.replace(/\s+/g, " ")).toContain(
      'school: school ? { id: school.id, rayonId: school.city_district_id ?? "" } : null,',
    );
    // `useSchools("")` is disabled and never succeeds: demanding it for a
    // sibling with no city on file would wait forever on a read that is not
    // running.
    expect(ADD_CHILD.replace(/\s+/g, " ")).toContain(
      "cities.isSuccess && districts.isSuccess && (!sourceCityId || sourceSchools.isSuccess)",
    );
  });

  it("keeps the per-child rayon read off the shared children list", () => {
    // The list backs Home, the subject sheets and the leaderboard headers; the
    // prefill's extra column is asked for one child, in its own query.
    expect(DATA).not.toContain("city_district_id");
    expect(QUERIES.replace(/\s+/g, " ")).toContain(
      'from("students") .select("city_district_id") .eq("profile_id", studentProfileId)',
    );
  });
});
