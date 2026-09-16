// Child account model — shared types, the synthetic-email mapping, and
// input validation. Pure/iso (no secrets, no DB) so it is safe to import from
// either server services or (future) client form code.
//
// Validation returns i18n KEYS (not localized text) so the UI layer localizes
// errors per locale (az/en/ru). See messages.ts `auth.child.*`.

import { isUuid } from "@/lib/uuid";
import { checkNewPassword } from "@/lib/auth/passwordPolicy";
import { parseStudentGender, parseStudentGenderRequired } from "@/lib/studentGender";

export const CHILD_ID_RE = /^\d{8}$/;
export const CHILD_PASSWORD_MIN = 8;

// Synthetic, non-routable internal email derived from the 8-digit ID. `.invalid`
// is RFC 2606 reserved and can never send/receive mail. This is the email the
// child's Supabase Auth user carries once provisioning completes; child login
// maps ID -> this email -> signInWithPassword. Never shown to users.
export function childSyntheticEmail(childUniqueId: string): string {
  return `c${childUniqueId}@children.invalid`;
}

// Temporary email used only between admin.createUser and ID allocation (the
// 8-digit ID is allocated by the DB AFTER the auth user exists).
export function childPendingEmail(token: string): string {
  return `pending-${token}@children.invalid`;
}

export type ChildInfo = {
  firstName: string;
  lastName: string;
  city?: string | null;
  schoolName?: string | null;
  classGrade?: string | null;
  // Structured grade (FK to public.grades). Batch H: the Add-Child form uses a real
  // grade dropdown; classGrade stays as a human label fallback.
  gradeId?: string | null;
  // Structured catalog FKs (D2 wizard): city = districts.id, school = schools.id.
  // The wizard makes these mandatory; validateChildInfo enforces it server-side.
  districtId?: string | null;
  schoolId?: string | null;
  // Round 21: the intra-city district (rayon) = city_districts.id. NAMING:
  // districtId above is the CITY (historic naming — table `districts` stores
  // cities); THIS is the real rayon, stored as students.city_district_id.
  // Optional here: whether the chosen city REQUIRES one is decided server-side
  // (create RPC / updateChildProfileCore) against city_districts — never by
  // the client.
  cityDistrictId?: string | null;
  // MANDATORY since 2026-09-16 (owner) — Qız or Oğlan, for aggregate reporting
  // only. A raw client string; lib/studentGender whitelists it.
  //
  // NOT OPTIONAL IN THIS TYPE ANY MORE, even though the column is still
  // nullable. Every surface that builds a ChildInfo now has to DECIDE about
  // this field: an optional member is a decision a caller can skip without
  // noticing, which is how a client ends up posting nothing while its form
  // believes it asked. The value may still be `null` — that is a surface
  // saying "the parent gave me nothing" out loud, and validateChildInfo
  // refuses it below rather than the type pretending it cannot happen.
  gender: string | null;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function result(errors: string[]): ValidationResult {
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateChildPassword(
  password: string,
  opts?: { childUniqueId?: string },
): ValidationResult {
  const errors: string[] = [];
  // A child password is CHOSEN here (by the parent, or by the child on their
  // own profile), so the full strength rule applies. validateChildLogin below
  // deliberately does NOT call this — children whose password predates the rule
  // must keep being able to sign in.
  const weak = checkNewPassword(password);
  if (weak === "tooShort" || weak === "tooLong") {
    errors.push("auth.child.err.passwordTooShort");
  } else if (weak) {
    errors.push("auth.child.err.passwordWeak");
  }
  if (opts?.childUniqueId && password === opts.childUniqueId) {
    errors.push("auth.child.err.passwordEqualsId");
  }
  return result(errors);
}

// R7 security: server-side bounds — names capped (client maxLength is not a
// guarantee) and the picker ids must LOOK like UUIDs before reaching the RPC.
const CHILD_NAME_MAX = 80;

/** Options that only a caller with a good reason may set - see the gender note below. */
export type ChildInfoValidationOptions = { genderOptional?: boolean };

export function validateChildInfo(
  info: ChildInfo,
  opts?: ChildInfoValidationOptions,
): ValidationResult {
  const errors: string[] = [];
  if (!info.firstName?.trim()) errors.push("auth.child.err.firstNameRequired");
  if (!info.lastName?.trim()) errors.push("auth.child.err.lastNameRequired");
  if ((info.firstName?.trim().length ?? 0) > CHILD_NAME_MAX) {
    errors.push("auth.child.err.nameTooLong");
  }
  if ((info.lastName?.trim().length ?? 0) > CHILD_NAME_MAX) {
    errors.push("auth.child.err.nameTooLong");
  }
  // D2 wizard: structured city (district), school and grade are MANDATORY.
  // (The DB keeps them optional for back-compat; the app enforces them here.)
  // A malformed (non-UUID) id is treated the same as a missing one.
  if (!isUuid(info.districtId?.trim() ?? "")) {
    errors.push("addchild.err.cityRequired");
  }
  // Round 21: the rayon is OPTIONAL at this layer (requiredness depends on the
  // city's rayon catalog and is enforced server-side by the create RPC and
  // updateChildProfileCore) — but when provided it must be UUID-shaped.
  const cityDistrictId = info.cityDistrictId?.trim() ?? "";
  if (cityDistrictId && !isUuid(cityDistrictId)) {
    errors.push("addchild.err.districtRequired");
  }
  if (!isUuid(info.schoolId?.trim() ?? "")) {
    errors.push("addchild.err.schoolRequired");
  }
  if (!isUuid(info.gradeId?.trim() ?? "")) {
    errors.push("addchild.err.gradeRequired");
  }
  // REQUIRED since 2026-09-16 (owner). This is the server half of the rule —
  // the forms ask for it, and this is what makes asking mean something: the
  // mobile BFF, a stale cached bundle and a hand-rolled POST all land here.
  //
  // TWO REFUSALS, DELIBERATELY DIFFERENT KEYS, and neither replaces the other.
  // `genderRequired` means "you did not answer" (nothing sent, or the retired
  // 'unspecified'); `genderInvalid` means "that is not a value this column
  // knows" and is what a forged string still gets. Error keys are a CONTRACT
  // shared with the mobile BFF, so the new rule ADDED a key rather than
  // repurposing the one that already had a meaning.
  //
  // NOTE FOR THE EDIT PATH: this same check runs on updateChildProfileCore, so
  // a legacy child whose gender is NULL can still be saved — by ANSWERING.
  // That is the only way the 51 pre-rule rows ever get a value, and it is why
  // the column stays nullable instead of being backfilled with a guess.
  // THE ONE EXEMPTION, AND IT IS NOT A LOOPHOLE. A binary already installed on
  // someone's phone cannot be made to comply retroactively. This rule ships to
  // mobile as an over-the-air update, which downloads in the background and
  // applies on the NEXT launch — so between the server deploy and that launch a
  // 1.16.0 parent is running a bundle whose gender control still offers
  // "Bildirmək istəmirəm", and a 1.15.x parent is running one that sends no
  // gender key at all and never will, because this update cannot reach them.
  //
  // Enforcing here would not make those parents answer. It would make Add-Child
  // fail outright, with a refusal their app has no control capable of
  // satisfying, and the only escape would be a store update they did not know
  // they needed. So the two mobile BFF routes pass genderOptional and the value
  // lands as NULL — exactly the "nobody has been asked yet" state the column was
  // designed to hold, and the same reasoning that makes p_gender nullable in
  // create_child_account (migration 178).
  //
  // WHAT IS NOT EXEMPT: a value that is PRESENT and wrong still fails, on every
  // caller. And the web forms, which are served fresh on every load and so can
  // always comply, get the strict parser. The requirement is real everywhere a
  // client exists that can honour it.
  const gender = opts?.genderOptional
    ? parseStudentGender(info.gender)
    : parseStudentGenderRequired(info.gender);
  if (!gender.ok) errors.push(gender.errorKey);
  return result(errors);
}

export function validateChildLogin(childUniqueId: string, password: string): ValidationResult {
  const errors: string[] = [];
  if (!CHILD_ID_RE.test(childUniqueId)) errors.push("auth.child.err.idFormat");
  if (password.length === 0) errors.push("auth.child.err.passwordRequired");
  return result(errors);
}
