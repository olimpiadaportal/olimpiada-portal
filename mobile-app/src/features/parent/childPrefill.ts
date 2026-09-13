// PREFILLING THE SECOND CHILD FROM THE FIRST.
//
// A family that adds a second child retypes the same surname, the same city,
// the same rayon and the same school they typed a minute ago for the first one.
// This file decides what may be carried over, from WHICH existing child, and
// WHEN — and it is pure on purpose: mobile jest has no renderer harness, so a
// rule that lives inside the wizard component cannot be tested at all. The
// precedent is features/profile/phoneEditor.ts, which exists for the same
// reason (an editor seeded from stored data, with the seeding rule exported so
// it can be pinned).
//
// THE LINE THIS FILE DRAWS. Two lists, PREFILL_FIELDS and CHILD_ONLY_FIELDS,
// and together they cover every key of ChildInfo. Moving a field across that
// line is the change this feature can most easily get wrong, so the split is
// data rather than control flow and __tests__/add-child-prefill.test.ts asserts
// both the membership and the resulting patch against a hand-written object.
//
//   SHARED — carried over
//     lastName        the surname. A blended family costs one edit.
//     cityId          the household's CITY (wire key district_id; the
//                     `districts` table is the cities catalogue, see
//                     ChildInfoForm's buildAddChildFields).
//     cityDistrictId  the intra-city RAYON.
//     schoolId        the school. The weakest member of the set — siblings in
//                     different grades genuinely attend different schools —
//                     which is why the notice names its source and offers a
//                     one-tap clear instead of the prefill being silent.
//
//   CHILD-SPECIFIC — never carried over
//     firstName       the given name; the entire point of a second child.
//     gradeId         NOT implied by the school. Grades are a flat catalogue
//                     with no tie to a school, and the entitled grade selects
//                     an olympiad question pool — an inherited grade is worse
//                     than a blank one.
//     gender          doubly forbidden. EMPTY_CHILD_INFO documents that "" is
//                     the un-asked state and that NO default selection may
//                     exist, because a preselected value is indistinguishable
//                     from a real answer once it is in the column. A prefilled
//                     gender would manufacture an answer the parent never gave
//                     — for a DIFFERENT child.
//     password        a credential, and there is no read path for one anyway.
//
// NOT COLLECTED BY THIS PRODUCT AT ALL, despite being named in the request:
// there is no address column (city / rayon / school ARE the location), no date
// of birth on this form, and the parent's contact details live once on the
// PARENT profile rather than per child — so they are shared by construction and
// there is nothing to copy.
//
// THE LOCATION TRIO IS ALL-OR-NOTHING. A prefilled form must be VALID, not
// merely populated: the rayon is REQUIRED whenever the chosen city has active
// rayons, so seeding a city whose rayon could not be read would hand the parent
// a form that fails validation on a field they never touched. When the trio
// cannot be completed it is dropped whole and only the surname carries over.
// Mixing one child's rayon with another's school is forbidden for the same
// reason — the pair can be one filterSchoolsByRayon() rejects — which is why a
// single source child is taken WHOLE and nothing is ever merged field by field
// across siblings.
//
// NO RUNTIME IMPORTS. Both imports below are `import type` and erase at
// compile time, so a test can load this module without dragging in the
// component tree or the Supabase client.
import type { ChildInfo } from "./ChildInfoForm";
import type { ChildRow } from "@/lib/data";

/** The ChildInfo fields a sibling may seed. */
export const PREFILL_FIELDS = ["lastName", "cityId", "cityDistrictId", "schoolId"] as const;

/** The ChildInfo fields that must stay empty. Together with PREFILL_FIELDS
 *  these cover every key of ChildInfo — the test asserts it. */
export const CHILD_ONLY_FIELDS = ["firstName", "gradeId", "gender", "password"] as const;

export type PrefillField = (typeof PREFILL_FIELDS)[number];

/**
 * Exactly the columns the prefill reads off an existing child — narrower than
 * ChildRow on purpose, so the read surface is visible in the type rather than
 * implied by the query. `city_district_id` is NOT here: it is not part of the
 * shared children list and arrives separately (see useChildRayon in queries.ts).
 */
export type PrefillCandidate = Pick<
  ChildRow,
  | "profile_id"
  | "first_name"
  | "last_name"
  | "district_id"
  | "school_id"
  | "created_by_parent_profile_id"
>;

/**
 * The child to copy from: the MOST RECENTLY CREATED child this parent created.
 *
 * MOST RECENT, NOT FIRST. It is the household state the parent last confirmed
 * — families move and children change schools — and it makes adding three
 * children in a row converge on the newest answer instead of re-offering an
 * ageing one. Two children who disagree about a school therefore resolve
 * deterministically, and the notice on screen names whichever one won.
 *
 * CREATED, NOT MERELY LINKED. `fetchChildren` also returns children this parent
 * is only LINKED to, whose household may not be this parent's; seeding a city,
 * rayon and school out of another family's row is exactly the failure this
 * filter prevents.
 *
 * ORDER CONTRACT: `fetchChildren` orders by created_at ASCENDING and ChildRow
 * carries no timestamp of its own, so "most recent" is the LAST match in the
 * list. The test pins that ordering in data.ts.
 */
export function pickPrefillSource<T extends PrefillCandidate>(
  children: readonly T[] | null | undefined,
  parentProfileId: string | null | undefined,
): T | null {
  if (!parentProfileId) return null;
  let source: T | null = null;
  for (const c of children ?? []) {
    if (c.created_by_parent_profile_id === parentProfileId) source = c;
  }
  return source;
}

/**
 * The patch a source child contributes — never a whole ChildInfo, so a field
 * this function does not name cannot be touched by applying it.
 *
 * `savedRayonId` is students.city_district_id for the SOURCE child ("" when the
 * column is NULL or the read returned nothing). `cityHasRayons` is whether the
 * SOURCE child's city has active rayons, i.e. whether the target form will
 * render the rayon field and require it.
 */
export function siblingPrefillPatch(
  source: PrefillCandidate,
  savedRayonId: string,
  cityHasRayons: boolean,
): Partial<ChildInfo> {
  const patch: Partial<ChildInfo> = {};

  const lastName = (source.last_name ?? "").trim();
  if (lastName) patch.lastName = lastName;

  const cityId = source.district_id ?? "";
  const schoolId = source.school_id ?? "";
  // A rayon belongs to ONE city. If the city has no rayons the field is not
  // rendered and any inherited id would be a value the form cannot show and the
  // server would reject — so it is dropped rather than carried.
  const cityDistrictId = cityHasRayons ? savedRayonId : "";
  const complete = cityId !== "" && schoolId !== "" && (!cityHasRayons || cityDistrictId !== "");
  if (complete) {
    patch.cityId = cityId;
    patch.cityDistrictId = cityDistrictId;
    patch.schoolId = schoolId;
  }
  return patch;
}

/**
 * Is the form still exactly as it mounted?
 *
 * Every field of ChildInfo is a string whose un-entered state is "" — that is
 * what EMPTY_CHILD_INFO encodes, and the test asserts it stays true. A field
 * added later with a non-string empty state has to be handled here, or the form
 * would read as "already edited" forever and never prefill.
 */
export function isPristineChildInfo(info: ChildInfo): boolean {
  return Object.values(info).every((v) => v === "");
}

/**
 * Empty exactly the prefilled fields and nothing else — what the notice's
 * "clear" button runs.
 *
 * ONE CONTROL, NOT FOUR. Every prefilled field is REQUIRED, so a per-field
 * clear would only ever produce an invalid form; and three of the four are
 * SelectFields whose sheets deliberately carry no "clear" row (an un-choose row
 * would let a mis-tap erase a real answer). Without this button the "delete a
 * prefilled value" half of the requirement would simply not exist for the city,
 * the rayon and the school. Anything the parent has typed themselves — a first
 * name, a grade, a password, a gender — survives untouched.
 */
export function clearPrefilledFields(info: ChildInfo): ChildInfo {
  const next = { ...info };
  for (const f of PREFILL_FIELDS) next[f] = "";
  return next;
}

/** What the reads behind the decision have answered so far. */
export type PrefillInputs<T extends PrefillCandidate> = {
  /** The children list has settled with data (pending or failed = wait). */
  childrenReady: boolean;
  /** pickPrefillSource()'s answer: null on a parent's FIRST child. */
  source: T | null;
  /** The rayon CATALOGUE (which cities have rayons) has settled. */
  catalogReady: boolean;
  /** The per-child read of the source's students.city_district_id. */
  rayon: { status: "pending" | "error" | "ready"; id: string };
  /** Does the SOURCE child's city have active rayons? */
  cityHasRayons: boolean;
  /** The source's saved catalogue ids still exist and are active. */
  sourceCatalogValid?: boolean;
  /** Is the form untouched (isPristineChildInfo)? */
  pristine: boolean;
};

export type PrefillDecision<T> =
  | { kind: "wait" }
  | { kind: "skip" }
  | { kind: "apply"; from: T; patch: Partial<ChildInfo> };

/**
 * Seed, wait, or leave the form alone — the whole rule in one pure function.
 *
 * "wait" means a read is still in flight and the caller must ask again; "skip"
 * is FINAL and the caller records it so nothing can seed later. The caller owns
 * that flag, which is what makes a cleared field stay cleared: after the parent
 * empties the prefilled fields the form is pristine again, and only the flag
 * stops this from helpfully refilling it.
 *
 * ORDER MATTERS. `pristine` is checked before the catalogue and the rayon read
 * so a parent who started typing while those were in flight settles at once —
 * nothing may appear under their fingers. And "no source" resolves to skip, not
 * wait: a parent's FIRST child is not a slow read, it is the answer, and it is
 * why the first Add-Child of an account behaves exactly as it did before this
 * feature existed.
 */
export function decidePrefill<T extends PrefillCandidate>(
  i: PrefillInputs<T>,
): PrefillDecision<T> {
  if (!i.childrenReady) return { kind: "wait" };
  if (!i.source) return { kind: "skip" };
  if (!i.pristine) return { kind: "skip" };
  if (!i.catalogReady) return { kind: "wait" };
  if (i.rayon.status === "pending") return { kind: "wait" };
  // A failed rayon read cannot tell a NULL column from an unread one, and
  // guessing either way risks a populated-but-invalid form. Nothing is seeded.
  if (i.rayon.status === "error") return { kind: "skip" };
  if (i.sourceCatalogValid === false) {
    const lastName = (i.source.last_name ?? "").trim();
    return lastName ? { kind: "apply", from: i.source, patch: { lastName } } : { kind: "skip" };
  }
  const patch = siblingPrefillPatch(i.source, i.rayon.id, i.cityHasRayons);
  if (Object.keys(patch).length === 0) return { kind: "skip" };
  return { kind: "apply", from: i.source, patch };
}
