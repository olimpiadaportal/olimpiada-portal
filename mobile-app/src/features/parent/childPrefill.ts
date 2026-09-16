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
//     gender          doubly forbidden, and MORE so since the field became
//                     REQUIRED. EMPTY_CHILD_INFO documents that no default
//                     selection may exist, because a preselected value is
//                     indistinguishable from a real answer once it is in the
//                     column. A prefilled one would manufacture an answer the
//                     parent never gave — about a DIFFERENT child — and the
//                     required check, the one thing that would otherwise stop
//                     them submitting it unread, would already be satisfied.
//     password        a credential, and there is no read path for one anyway.
//
// NOT COLLECTED BY THIS PRODUCT AT ALL, despite being named in the request:
// there is no address column (city / rayon / school ARE the location), no date
// of birth on this form, and the parent's contact details live once on the
// PARENT profile rather than per child — so they are shared by construction and
// there is nothing to copy.
//
// THE LOCATION IS CARRIED FIELD BY FIELD, AND ONLY WHERE IT IS PROVABLY VALID.
// It used to be ALL-OR-NOTHING — any doubt about the rayon dropped the city and
// the school with it — and that rule is what produced the reported bug: "it
// prefills the surname but not the school". Two ordinary situations hit it.
// A school with no rayon recorded (a legitimate row: filterSchoolsByRayon keeps
// those schools selectable under every rayon, and the server accepts them under
// any rayon of their city) did not match the sibling's saved rayon, so the
// source was judged invalid and the parent lost all three fields. A sibling
// whose own students.city_district_id is NULL did the same. In both the city
// and the school were perfectly good, and retyping them is exactly the work
// this feature exists to remove.
//
// What replaces it is not "seed more", it is "seed only what the server would
// accept", one field at a time:
//
//   * The CITY is the anchor. A rayon belongs to one city and a school belongs
//     to one city, so neither is carried without it; if the city is gone from
//     the catalogue, no part of the location is carried.
//   * The SCHOOL'S OWN RAYON WINS whenever the school has one. That is the
//     database's rule, not a preference: student_district_guard auto-fills the
//     student's rayon from the school and REJECTS one that contradicts it
//     ("district % contradicts the school's district"), so this pairing can
//     never be refused — even when an admin has since moved the school and the
//     sibling's saved rayon has gone stale.
//   * A RAYON IS SEEDED ONLY IF IT IS AN ACTIVE RAYON OF THAT CITY, so the
//     select can actually show it. A value the trigger cannot render would read
//     as "nothing selected" while quietly satisfying the required check.
//   * AN UNRESOLVABLE RAYON LEAVES ITS FIELD EMPTY rather than dropping the
//     city and the school. The field is required, so the parent is asked for
//     it — which is precisely what they get today with nothing prefilled at
//     all, minus the retyping. It stays valid whichever rayon they pick:
//     a school with no rayon of its own is accepted under all of them, and
//     ChildInfoForm's cascade clears any school the chosen rayon excludes
//     before it can reach the wire.
//
// A single source child is still taken WHOLE: nothing is ever merged field by
// field ACROSS siblings, because one child's rayon with another's school is a
// pair filterSchoolsByRayon — and the server — can reject.
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
 * What the ADMIN CATALOGUE says TODAY about the source child's saved location.
 *
 * Everything here is read from the same queries the target form itself reads,
 * so "the prefill offered it" and "the form can show it" cannot disagree. The
 * source child's own saved ids are NOT trusted on their own: a city can be
 * deactivated, a rayon archived and a school moved between rayons long after
 * the sibling was created.
 */
export type SourceLocation = {
  /** The source child's city is still in the active cities catalogue. */
  cityActive: boolean;
  /** That city has active rayons — i.e. the form will render the rayon field
   *  and require it. */
  cityHasRayons: boolean;
  /** The ACTIVE rayon ids of that city. A rayon outside this list cannot be
   *  seeded: the select would have no row to show for it. */
  rayonIds: readonly string[];
  /** The source child's school as the catalogue has it now, or null when it is
   *  archived, moved to another city, or simply not on file. `rayonId` is ""
   *  when the school has no rayon recorded — a legitimate row that is
   *  selectable under every rayon of its city (filterSchoolsByRayon), and the
   *  case whose mishandling produced "surname only". */
  school: { id: string; rayonId: string } | null;
};

/**
 * The patch a source child contributes — never a whole ChildInfo, so a field
 * this function does not name cannot be touched by applying it.
 *
 * `savedRayonId` is students.city_district_id for the SOURCE child ("" when the
 * column is NULL or the read did not answer).
 *
 * Every key it sets is one the target form can display and the server would
 * accept; a field it cannot prove is simply left out, and the form asks for it.
 */
export function siblingPrefillPatch(
  source: PrefillCandidate,
  savedRayonId: string,
  loc: SourceLocation,
): Partial<ChildInfo> {
  const patch: Partial<ChildInfo> = {};

  const lastName = (source.last_name ?? "").trim();
  if (lastName) patch.lastName = lastName;

  // The city anchors the other two — without it neither a rayon nor a school
  // can be placed, so nothing of the location is carried.
  const cityId = source.district_id ?? "";
  if (!cityId || !loc.cityActive) return patch;
  patch.cityId = cityId;

  // The school's own rayon first (the DB guard's rule — it auto-fills from the
  // school and refuses anything that contradicts it), the sibling's saved rayon
  // only when the school has none to offer. Either way it must be an ACTIVE
  // rayon of this city, or the trigger would sit on its placeholder while the
  // state held an id.
  const candidate = loc.school?.rayonId || savedRayonId;
  if (loc.cityHasRayons && candidate && loc.rayonIds.includes(candidate)) {
    patch.cityDistrictId = candidate;
  }
  // The school survives an unresolved rayon. It is in this city (the catalogue
  // read is per city) and it is compatible with whatever rayon is or is not
  // seeded: the branch above either took the school's own rayon or found the
  // school has none, and a school with none is accepted under every rayon.
  if (loc.school) patch.schoolId = loc.school.id;
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
  /** The catalogues behind the decision — cities, rayons and the source city's
   *  schools — have all settled. */
  catalogReady: boolean;
  /** The per-child read of the source's students.city_district_id. */
  rayon: { status: "pending" | "error" | "ready"; id: string };
  /** What the catalogue says about the source child's saved location. */
  location: SourceLocation;
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
  // A FAILED rayon read is no longer fatal — it used to skip the whole seed.
  // The read answers one question ("what did the sibling's row say?"), and a
  // NULL column answers it the same way, so a failure is simply the un-answered
  // case: the resolution above takes the rayon from the SCHOOL, which is where
  // the database takes it from too, and leaves the field to the parent when the
  // school has none. Dropping a perfectly good city and school over it is what
  // made the feature look broken.
  const savedRayonId = i.rayon.status === "ready" ? i.rayon.id : "";
  const patch = siblingPrefillPatch(i.source, savedRayonId, i.location);
  if (Object.keys(patch).length === 0) return { kind: "skip" };
  return { kind: "apply", from: i.source, patch };
}
