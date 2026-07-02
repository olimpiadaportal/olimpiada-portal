// Child account model — shared types, the synthetic-email mapping, and
// input validation. Pure/iso (no secrets, no DB) so it is safe to import from
// either server services or (future) client form code.
//
// Validation returns i18n KEYS (not localized text) so the UI layer localizes
// errors per locale (az/en/ru). See messages.ts `auth.child.*`.

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
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function result(errors: string[]): ValidationResult {
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateChildId(childUniqueId: string): ValidationResult {
  return result(CHILD_ID_RE.test(childUniqueId) ? [] : ["auth.child.err.idFormat"]);
}

export function validateChildPassword(
  password: string,
  opts?: { childUniqueId?: string },
): ValidationResult {
  const errors: string[] = [];
  if (password.length < CHILD_PASSWORD_MIN) errors.push("auth.child.err.passwordTooShort");
  if (opts?.childUniqueId && password === opts.childUniqueId) {
    errors.push("auth.child.err.passwordEqualsId");
  }
  return result(errors);
}

// R7 security: server-side bounds — names capped (client maxLength is not a
// guarantee) and the picker ids must LOOK like UUIDs before reaching the RPC.
const CHILD_NAME_MAX = 80;
const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateChildInfo(info: ChildInfo): ValidationResult {
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
  if (!UUID_LIKE_RE.test(info.districtId?.trim() ?? "")) {
    errors.push("addchild.err.cityRequired");
  }
  if (!UUID_LIKE_RE.test(info.schoolId?.trim() ?? "")) {
    errors.push("addchild.err.schoolRequired");
  }
  if (!UUID_LIKE_RE.test(info.gradeId?.trim() ?? "")) {
    errors.push("addchild.err.gradeRequired");
  }
  return result(errors);
}

export function validateChildLogin(childUniqueId: string, password: string): ValidationResult {
  const errors: string[] = [];
  if (!CHILD_ID_RE.test(childUniqueId)) errors.push("auth.child.err.idFormat");
  if (password.length === 0) errors.push("auth.child.err.passwordRequired");
  return result(errors);
}
