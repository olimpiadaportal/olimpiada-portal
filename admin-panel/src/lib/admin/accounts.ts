"use server";

// Parent/child account CRUD — Administrator-only.
//
// SECURITY POSTURE (identical for every action below):
//   1) requireAdmin() ALWAYS runs first. Only an administrator reaches any
//      privileged code path.
//   2) The SERVICE-ROLE admin client (createAdminClient — bypasses RLS) is only
//      created AFTER the admin check, and is never returned to / imported by a
//      Client Component. The service key never leaves the server.
//   3) Mutations record an audit_logs entry (best-effort) so create/delete are
//      traceable to the acting administrator.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guards";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/admin/audit";
import { checkNewPassword, type PasswordProblem } from "@/lib/admin/passwordPolicy";
import { sanitizeSearchTerm } from "@/lib/admin/search";
import { getT } from "@/i18n/server";

// --------------------------------------------------------------------------
// Auditing uses the shared best-effort helper in @/lib/admin/audit (extracted
// from the pattern that originated here; see that file for the audit_logs
// columns, the audit_severity enum constraint, and the service-role rationale).
//
// NOTE: account CRUD here targets profiles / students / child_credentials, none
// of which carry the generic fn_audit_row() DB trigger (011 attaches those to
// profile_roles, parent_student_links, subscriptions, payments, questions,
// tests, daily_task_packages). So these app writes are the single source of
// truth for account-level events and do not duplicate/conflict with triggers.
// --------------------------------------------------------------------------

function f(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

// The password strength rule lives in ONE module (passwordPolicy.ts, twinned
// byte-for-byte with web-app and mobile-app). It returns a CODE rather than a
// message because the three apps have three different i18n key namespaces —
// this is the admin-panel half of that contract.
const PASSWORD_PROBLEM_KEY: Record<PasswordProblem, string> = {
  tooShort: "pw.err.tooShort",
  tooLong: "pw.err.tooLong",
  needsUpper: "pw.err.needsUpper",
  needsSpecial: "pw.err.needsSpecial",
};

// L10: shared fail-CLOSED parent-role check. Returns true ONLY when the target
// profile verifiably holds the 'parent' role; a failed/empty roles lookup (bad
// seed, transient error) counts as "not a parent" and refuses the mutation —
// so an admin/content-manager profile id can never be fed to these actions.
async function holdsParentRole(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<boolean> {
  const { data: parentRole, error: roleErr } = await admin
    .from("roles")
    .select("id")
    .eq("code", "parent")
    .maybeSingle();
  if (roleErr || !parentRole?.id) return false;
  const { data: isParent, error: linkErr } = await admin
    .from("profile_roles")
    .select("profile_id")
    .eq("profile_id", profileId)
    .eq("role_id", parentRole.id)
    .maybeSingle();
  return !linkErr && !!isParent;
}

// =====================================================================
// RESET CHILD PASSWORD
//
// A reset here means "make this child able to sign in" — support uses this
// path to rescue accounts that cannot. ONE password store (Supabase Auth) is
// addressed by TWO keys: the reset writes by auth user id (always succeeds),
// while child login signs in by the synthetic email derived from the 8-digit
// id. Migration 146 backfilled ids for children created while payments were
// off but could not write auth.users.email from SQL, so accounts exist whose
// displayed id and login address disagree. Writing a password on one of those
// reports success and changes nothing the child can use.
// =====================================================================

// admin-panel copy of web-app childAccountService.reconcileChildLoginEmail.
// Duplicated on purpose: admin-panel is a separate deployable and cannot
// import from web-app.
//
// Idempotent — an already-correct address costs one read and no write, which
// is what makes it safe on every reset instead of only the broken ones. A
// FAILED READ FALLS THROUGH TO THE WRITE rather than skipping: skipping on a
// read error is the one outcome nothing downstream could ever detect.
async function reconcileChildLoginEmail(
  admin: ReturnType<typeof createAdminClient>,
  authUserId: string,
  childUniqueId: string,
): Promise<{ ok: boolean; changed: boolean }> {
  const desired = `c${childUniqueId}@children.invalid`;

  const { data: existing } = await admin.auth.admin.getUserById(authUserId);
  const currentEmail = existing?.user?.email?.trim().toLowerCase() ?? null;
  if (currentEmail === desired) return { ok: true, changed: false };

  // email_confirm keeps the address confirmed: GoTrue refuses
  // signInWithPassword on an unconfirmed email, which would trade one silent
  // login failure for another.
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    email: desired,
    email_confirm: true,
  });
  if (error) {
    // Never return raw Auth error text to the client.
    console.error("[admin] child login email reconcile failed", error.message);
    return { ok: false, changed: false };
  }
  return { ok: true, changed: true };
}

// Void the child's recent failed-login streak. is_child_login_locked counts
// failures in the last 15 minutes and ONLY a successful login clears them, so
// without this the rescued child is still refused for the rest of the window —
// which looks exactly like the reset not having worked. Successful attempts
// stay: they are login history, not a lockout.
//
// Best-effort: the password is already changed by the time this runs, so a
// failure must not be reported as a failed reset. It is recorded in the audit
// row instead.
async function clearChildLoginFailures(
  admin: ReturnType<typeof createAdminClient>,
  childUniqueId: string,
): Promise<boolean> {
  const { error } = await admin
    .from("child_login_attempts")
    .delete()
    .eq("child_unique_id", childUniqueId)
    .eq("success", false);
  if (error) {
    console.error("[admin] could not clear the child login lockout");
    return false;
  }
  return true;
}

export type ResetChildPasswordState = { error?: string; ok?: boolean } | null;

export async function resetChildPassword(
  _prev: ResetChildPasswordState,
  formData: FormData,
): Promise<ResetChildPasswordState> {
  const ctx = await requireAdmin(); // ONLY administrators can reset a child password
  const t = await getT();

  if (!hasServiceRole()) {
    return { error: t("accounts.reset.noServiceKey") };
  }

  const studentProfileId = String(formData.get("student_profile_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!studentProfileId) return { error: t("accounts.reset.err.missing") };
  // One rule for every newly chosen password, length caps included. Enforced
  // server-side because the form's attributes are UX, not a guarantee.
  const pwProblem = checkNewPassword(password);
  if (pwProblem) return { error: t(PASSWORD_PROBLEM_KEY[pwProblem]) };

  const admin = createAdminClient();

  // 1) Resolve the child's auth user from credentials.
  const { data: cred, error: credErr } = await admin
    .from("child_credentials")
    .select("auth_user_id, child_unique_id")
    .eq("student_profile_id", studentProfileId)
    .maybeSingle();
  if (credErr) {
    // Never return raw DB error text to the client.
    console.error("[admin] child credential lookup failed", credErr.message);
    return { error: t("err.server") };
  }
  if (!cred?.auth_user_id) return { error: t("accounts.reset.err.noCredentials") };

  // A child with no 8-digit id has no username: no password would let them
  // in, so reporting a successful reset would be a lie. The account needs an
  // id allocated, which is a different repair than a password.
  const childUniqueId: string | null = cred.child_unique_id ?? null;
  if (!childUniqueId) return { error: t("accounts.reset.err.noLoginId") };

  // Defensive: never allow the password to equal the public 8-digit ID.
  if (password === childUniqueId) {
    return { error: t("accounts.reset.err.equalsId") };
  }

  // 2) Repair the login address BEFORE touching the password. On failure the
  //    password is deliberately left alone: setting it would put the account
  //    straight back into the state this whole path exists to end.
  const reconciled = await reconcileChildLoginEmail(
    admin,
    cred.auth_user_id,
    childUniqueId,
  );
  if (!reconciled.ok) return { error: t("accounts.reset.err.loginRepair") };

  // 3) Reset the password via the Auth admin API.
  const { error: updErr } = await admin.auth.admin.updateUserById(
    cred.auth_user_id,
    { password },
  );
  if (updErr) {
    // Never return raw Auth error text to the client (never log passwords).
    console.error("[admin] child password reset failed", updErr.message);
    return { error: t("err.server") };
  }

  // 4) Record who/when the password was last set.
  await admin
    .from("child_credentials")
    .update({
      password_set_by_parent_profile_id: ctx.profileId,
      password_set_at: new Date().toISOString(),
    })
    .eq("student_profile_id", studentProfileId);

  // 5) A reset is precisely the event that should void the failure history.
  const lockoutCleared = await clearChildLoginFailures(admin, childUniqueId);

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.child.password_reset",
    targetTable: "child_credentials",
    targetId: studentProfileId,
    severity: "warning",
    // Support needs to SEE the repair: emailReconciled means this account was
    // one that could never sign in, and an uncleared lockout explains a child
    // still being refused for the rest of the 15-minute window.
    metadata: { emailReconciled: reconciled.changed, lockoutCleared },
  });

  revalidatePath("/accounts");
  return { ok: true };
}

// =====================================================================
// CREATE PARENT
// Mirrors web-app registerParent provisioning, but uses admin.createUser with
// email auto-confirm (an administrator creates the account directly) followed
// by the existing setup_parent RPC (profile → parent role + parents row).
// =====================================================================
// On success the new parent's profile id + display name are surfaced so the
// Free-Access wizard can hand the created parent straight to the child step.
export type CreateParentState =
  | { error?: string; ok?: boolean; parentProfileId?: string; name?: string }
  | null;

export async function createParent(
  _prev: CreateParentState,
  formData: FormData,
): Promise<CreateParentState> {
  const ctx = await requireAdmin();
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const firstName = f(formData, "first_name");
  const lastName = f(formData, "last_name");
  const displayName = `${firstName} ${lastName}`.trim();
  const email = f(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  // L11: server-side length caps (client maxLength is UX, not security).
  if (!firstName || !lastName) return { error: t("accounts.create.err.required") };
  if (firstName.length > 100 || lastName.length > 100) {
    return { error: t("err.tooLong") };
  }
  if (!email || !email.includes("@")) return { error: t("accounts.create.err.email") };
  if (email.length > 254) return { error: t("err.tooLong") };
  const parentPwProblem = checkNewPassword(password);
  if (parentPwProblem) return { error: t(PASSWORD_PROBLEM_KEY[parentPwProblem]) };

  const admin = createAdminClient();

  // 1) Create the auth user (email auto-confirmed — admin-provisioned account).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: "parent", display_name: displayName },
  });
  if (createErr || !created?.user) {
    // Supabase returns a 422 for an already-registered email.
    if (createErr && /already|registered|exists/i.test(createErr.message)) {
      return { error: t("accounts.create.err.exists") };
    }
    return { error: t("accounts.create.err.failed") };
  }

  // 2) Promote the new profile to an active parent (parent role + parents row).
  const { error: rpcErr } = await admin.rpc("setup_parent", {
    p_auth_user_id: created.user.id,
    p_display_name: displayName || null,
  });
  if (rpcErr) {
    // Roll back the orphaned auth user so a retry can succeed cleanly.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { error: t("accounts.create.err.failed") };
  }

  // Resolve the new parent's profile id for the audit target.
  const { data: prof } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", created.user.id)
    .maybeSingle();

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.parent.create",
    targetTable: "profiles",
    targetId: prof?.id ?? null,
    metadata: { email },
  });

  revalidatePath("/accounts");
  revalidatePath("/free-access"); // creation now lives there (Round 12.1)
  // Surface the new parent's profile id + name so the wizard's child step can
  // lock onto this parent (the id flows ONLY from here, never client-fabricated).
  return { ok: true, parentProfileId: prof?.id ?? "", name: displayName };
}

// =====================================================================
// CREATE CHILD FOR A PARENT (Round 11, owner item 7 — admin payment bypass).
//
// Mirrors the web-app parent Add-Child flow (childAccountService.createChild):
//   auth admin.createUser (temp pending-<uuid>@children.invalid email, parent-
//   chosen password) → atomic create_child_account RPC → OPTIONAL comped access
//   via admin_grant_child_access (service-role-only RPC: 0-amount ACTIVE
//   subscription, provider 'admin_grant', allocates the 8-digit login ID) →
//   canonical synthetic email c<8digits>@children.invalid.
// Saga: on ANY failure after createUser the auth user is deleted (FK cascades
// remove the profile/student/credentials/subscription rows) and a generic
// trilingual error is returned — no raw DB/Auth text ever reaches the client.
// =====================================================================
// On success the new student's profile id + display name are surfaced too so the
// Free-Access wizard can target this exact child in its schedule step.
export type CreateChildState =
  | {
      error?: string;
      ok?: boolean;
      childUniqueId?: string | null;
      studentProfileId?: string;
      name?: string;
    }
  | null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_INTERVALS = new Set(["week", "month", "year"]);
const NAME_MAX = 80;
const SUBJECTS_MAX = 20;

// Round 12: live parent autocomplete for the admin Add-Child form. Case-insensitive
// partial match on parent display name / email / phone, restricted to REAL parents,
// enriched with contact + child count. Admin-only; capped; returns [] on empty query.
export type ParentSearchResult = {
  id: string;
  name: string;
  email: string;
  phone: string;
  childCount: number;
};

export async function searchParents(query: string): Promise<ParentSearchResult[]> {
  await requireAdmin(); // authorize FIRST
  if (!hasServiceRole()) return [];
  // M18: shared sanitizer — strips PostgREST or()-grammar chars (incl. quotes),
  // escapes LIKE wildcards, caps length.
  const esc = sanitizeSearchTerm(query);
  if (!esc) return [];
  const admin = createAdminClient();

  // Match profiles by name/email/phone, then keep only those that are parents.
  const { data: profs, error } = await admin
    .from("profiles")
    .select("id, display_name, email, phone")
    .or(`display_name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%`)
    .limit(50);
  if (error || !profs || profs.length === 0) return [];

  const ids = (profs as { id: string }[]).map((p) => p.id);
  const { data: parentRows } = await admin
    .from("parents")
    .select("profile_id")
    .in("profile_id", ids);
  const parentIds = new Set(
    ((parentRows ?? []) as { profile_id: string }[]).map((r) => r.profile_id),
  );
  const matched = (profs as {
    id: string;
    display_name: string | null;
    email: string | null;
    phone: string | null;
  }[])
    .filter((p) => parentIds.has(p.id))
    .slice(0, 20);
  if (matched.length === 0) return [];

  // Child counts for the matched parents (created_by_parent_profile_id).
  const matchedIds = matched.map((m) => m.id);
  const { data: kids } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .in("created_by_parent_profile_id", matchedIds);
  const counts = new Map<string, number>();
  for (const k of (kids ?? []) as { created_by_parent_profile_id: string | null }[]) {
    const pid = k.created_by_parent_profile_id;
    if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }

  return matched.map((p) => ({
    id: p.id,
    name: (p.display_name ?? "").trim() || "—",
    email: (p.email ?? "").trim(),
    phone: (p.phone ?? "").trim(),
    childCount: counts.get(p.id) ?? 0,
  }));
}

export async function createChildForParent(
  _prev: CreateChildState,
  formData: FormData,
): Promise<CreateChildState> {
  const ctx = await requireAdmin(); // authorize FIRST — before touching FormData
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  // ---- Validate every client-supplied field (server-side, hard) -------------
  const parentProfileId = f(formData, "parent_profile_id");
  const firstName = f(formData, "first_name");
  const lastName = f(formData, "last_name");
  const password = String(formData.get("password") ?? "");
  const gradeId = f(formData, "grade_id");
  const grantAccess = f(formData, "grant_access") === "true";

  if (!UUID_RE.test(parentProfileId)) {
    return { error: t("accounts.child.create.err.parent") };
  }
  if (
    !firstName ||
    !lastName ||
    firstName.length > NAME_MAX ||
    lastName.length > NAME_MAX
  ) {
    return { error: t("accounts.create.err.required") };
  }
  const childPwProblem = checkNewPassword(password);
  if (childPwProblem) return { error: t(PASSWORD_PROBLEM_KEY[childPwProblem]) };
  if (gradeId && !UUID_RE.test(gradeId)) {
    return { error: t("accounts.child.create.err.invalid") };
  }
  // Round 12: city + school are required for admin-created children too (parity
  // with the parent Add-Child flow). Both are UUIDs; the school must belong to the
  // chosen city (re-validated below against the DB).
  const districtId = f(formData, "district_id");
  const schoolId = f(formData, "school_id");
  if (!UUID_RE.test(districtId) || !UUID_RE.test(schoolId)) {
    return { error: t("accounts.child.create.err.cityschool") };
  }
  // ROUND 21 RAYON — mandatory when the chosen city has any, and the reason
  // admin child creation failed outright for every Baku child: the panel
  // never collected it, so create_child_account raised
  // `district is required for city ...` (23514) and the saga reported the
  // generic "could not create the child account". Validated here rather than
  // trusted from the form, and re-checked by the RPC itself.
  const cityDistrictId = f(formData, "city_district_id");
  if (cityDistrictId && !UUID_RE.test(cityDistrictId)) {
    return { error: t("accounts.child.create.err.cityschool") };
  }
  // The "is a rayon required for this city" question needs the DB, so it is
  // asked further down, next to the existing city/school validation — the
  // service-role client does not exist yet at this point in the function.

  // Grant fields are validated only when the bypass grant is requested.
  let interval = "";
  let subjectIds: string[] = [];
  let days: number | null = null;
  if (grantAccess) {
    interval = f(formData, "interval");
    if (!ALLOWED_INTERVALS.has(interval)) {
      return { error: t("accounts.child.create.err.invalid") };
    }
    subjectIds = Array.from(
      new Set(
        formData
          .getAll("subject")
          .map((v) => (typeof v === "string" ? v.trim() : "")),
      ),
    ).filter(Boolean);
    if (
      subjectIds.length < 1 ||
      subjectIds.length > SUBJECTS_MAX ||
      !subjectIds.every((s) => UUID_RE.test(s))
    ) {
      return { error: t("accounts.child.create.err.subjects") };
    }
    const daysRaw = f(formData, "days");
    if (daysRaw) {
      const n = Number(daysRaw);
      if (!Number.isInteger(n) || n < 1 || n > 730) {
        return { error: t("accounts.child.create.err.days") };
      }
      days = n;
    }
  }

  const admin = createAdminClient();

  // The target parent must be a REAL parent (parents row) — this action must
  // never attach a child to an admin/content-manager/arbitrary profile.
  const { data: parentRow, error: parentErr } = await admin
    .from("parents")
    .select("profile_id")
    .eq("profile_id", parentProfileId)
    .maybeSingle();
  if (parentErr) {
    console.error("[admin] parent lookup failed", parentErr.message);
    return { error: t("err.server") };
  }
  if (!parentRow) return { error: t("accounts.child.create.err.parent") };

  // Resolve + validate city/school server-side (never trust the display names;
  // the school MUST belong to the chosen city — the RPC also enforces this).
  const { data: cityRow } = await admin
    .from("districts")
    .select("name")
    .eq("id", districtId)
    .maybeSingle();
  const { data: schoolRow } = await admin
    .from("schools")
    .select("name, district_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (
    !cityRow ||
    !schoolRow ||
    (schoolRow as { district_id: string }).district_id !== districtId
  ) {
    return { error: t("accounts.child.create.err.cityschool") };
  }
  const cityName = (cityRow as { name: string }).name;
  const schoolName = (schoolRow as { name: string }).name;

  // ROUND 21 RAYON — mandatory when the chosen city has any, and the reason
  // admin child creation failed outright for every Baku child: the panel never
  // collected it, so create_child_account raised `district is required for
  // city …` (23514) and the saga reported the generic "could not create the
  // child account". Asked of the DB rather than assumed from the form, and
  // re-checked by the RPC itself — a disabled/absent select is not a guarantee.
  {
    const { count } = await admin
      .from("city_districts")
      .select("id", { count: "exact", head: true })
      .eq("city_id", districtId)
      .eq("status", "active");
    if ((count ?? 0) > 0 && !cityDistrictId) {
      return { error: t("accounts.child.create.err.rayon") };
    }
  }

  // ---- 1) Auth user (temporary pending email, parent-chosen password) -------
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: `pending-${crypto.randomUUID()}@children.invalid`,
    password,
    email_confirm: true,
    user_metadata: {
      account_type: "child",
      created_by_parent_profile_id: parentProfileId,
    },
  });
  if (createErr || !created?.user) {
    console.error("[admin] child auth create failed", createErr?.message);
    return { error: t("accounts.child.create.err.failed") };
  }
  const authUserId = created.user.id;

  try {
    // ---- 2) Atomic DB provisioning (student + credentials + parent link) ----
    const { data: rows, error: rpcErr } = await admin.rpc(
      "create_child_account",
      {
        p_parent_profile_id: parentProfileId,
        p_auth_user_id: authUserId,
        p_first_name: firstName,
        p_last_name: lastName,
        p_city: cityName,
        p_school_name: schoolName,
        p_class_grade: null,
        p_grade_id: gradeId || null,
        p_district_id: districtId,
        p_school_id: schoolId,
        p_city_district_id: cityDistrictId || null,
      },
    );
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    const studentProfileId: string | undefined = row?.new_student_profile_id;
    if (!studentProfileId) throw new Error("provisioning returned no student id");

    let childUniqueId: string | null = null;
    let subscriptionId: string | null = null;

    if (grantAccess) {
      // ---- 3) Comped access (0-amount ACTIVE subscription + login ID) -------
      const { data: grantData, error: grantErr } = await admin.rpc(
        "admin_grant_child_access",
        {
          p_student_profile_id: studentProfileId,
          p_interval: interval,
          p_subject_ids: subjectIds,
          p_days: days,
        },
      );
      if (grantErr) throw new Error(grantErr.message);
      const grant = (grantData ?? {}) as {
        subscription_id?: string;
        new_child_unique_id?: string;
      };
      childUniqueId = grant.new_child_unique_id ?? null;
      subscriptionId = grant.subscription_id ?? null;
      if (!childUniqueId) throw new Error("grant returned no child id");

      // ---- 4) Canonical synthetic login email (c<8digits>@children.invalid) —
      // same updateUserById call as web-app applyAllocatedChildEmail; without it
      // the child could never log in, so a failure here aborts the whole saga.
      const { error: emailErr } = await admin.auth.admin.updateUserById(
        authUserId,
        { email: `c${childUniqueId}@children.invalid` },
      );
      if (emailErr) throw new Error(emailErr.message);
    }

    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.child.create",
      targetTable: "students",
      targetId: studentProfileId,
      metadata: { parentProfileId },
    });
    if (grantAccess) {
      await writeAuditLog({
        actorProfileId: ctx.profileId,
        action: "admin.child.access_grant",
        targetTable: "child_subscriptions",
        targetId: subscriptionId,
        metadata: { interval, subjects: subjectIds.length, days },
        severity: "warning",
      });
    }

    revalidatePath("/accounts");
    revalidatePath("/free-access"); // creation now lives there (Round 12.1)
    // studentProfileId + name flow up so the wizard can schedule for this child.
    return {
      ok: true,
      childUniqueId,
      studentProfileId,
      name: `${firstName} ${lastName}`.trim(),
    };
  } catch (e) {
    // Saga cleanup: remove the orphaned auth user (cascades every DB row the
    // flow created). Never surface raw DB/Auth details to the client.
    console.error("[admin] child create flow failed", (e as Error).message);
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    return { error: t("accounts.child.create.err.failed") };
  }
}

// =====================================================================
// UPDATE PARENT — full profile edit: display name, phone, status
// (active / suspended) and EMAIL. Email changes go through the service-role
// Auth admin API (auth.users is the source of truth for the login email);
// profiles.email is kept in sync so the panel list reflects the change.
// =====================================================================
export type UpdateParentState = { error?: string; ok?: boolean } | null;

const ALLOWED_PARENT_STATUSES = new Set(["active", "suspended"]);
// E.164 shape, matching the profiles.phone DB check (chk_profiles_phone_e164).
const PHONE_RE = /^\+[1-9][0-9]{6,14}$/;
const NAME_MAX_PARENT = 160;

export async function updateParent(
  _prev: UpdateParentState,
  formData: FormData,
): Promise<UpdateParentState> {
  const ctx = await requireAdmin();
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const parentProfileId = f(formData, "parent_profile_id");
  const displayName = f(formData, "display_name");
  const phone = f(formData, "phone");
  const email = f(formData, "email").toLowerCase();
  const status = f(formData, "status");

  // The profile id is server-verified, never editable — it only identifies the
  // target row (a hidden field). Reject anything that is not a UUID.
  if (!UUID_RE.test(parentProfileId)) return { error: t("accounts.edit.err.failed") };
  // Never trust a client-submitted status outside the allowed transitions.
  if (status && !ALLOWED_PARENT_STATUSES.has(status)) {
    return { error: t("accounts.edit.err.failed") };
  }
  if (displayName.length > NAME_MAX_PARENT) return { error: t("err.tooLong") };
  // Email is required and validated server-side (client attrs are UX only).
  if (!email || !email.includes("@")) return { error: t("accounts.edit.err.email") };
  if (email.length > 254) return { error: t("err.tooLong") };
  // Phone is optional; when present it must satisfy the E.164 DB constraint
  // (otherwise the profiles UPDATE below would be rejected by the check).
  if (phone && !PHONE_RE.test(phone)) return { error: t("accounts.edit.err.phone") };

  const admin = createAdminClient();

  // Confirm the target is actually a parent (defence-in-depth: do not let this
  // become a generic profile editor for admins/content managers).
  // L10: fail CLOSED — if the role lookup yields nothing (missing seed row,
  // transient error), the mutation is refused rather than skipping the check.
  if (!(await holdsParentRole(admin, parentProfileId))) {
    return { error: t("accounts.edit.err.failed") };
  }

  // Resolve the parent's auth user + current contact fields (the auth user id is
  // read from the DB — never client-supplied — before any Auth admin call).
  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("auth_user_id, email, phone, display_name")
    .eq("id", parentProfileId)
    .maybeSingle();
  if (profErr || !prof?.auth_user_id) {
    if (profErr) console.error("[admin] parent lookup failed", profErr.message);
    return { error: t("accounts.edit.err.failed") };
  }

  const emailChanged = (prof.email ?? "").toLowerCase() !== email;
  const phoneChanged = (prof.phone ?? "") !== phone;

  // Apply the email change via the Auth admin API first (auth.users owns the
  // login email). email_confirm keeps the account confirmed (admin-driven).
  if (emailChanged) {
    const { error: authErr } = await admin.auth.admin.updateUserById(
      prof.auth_user_id,
      { email, email_confirm: true },
    );
    if (authErr) {
      if (/already|registered|exists|duplicate/i.test(authErr.message)) {
        return { error: t("accounts.edit.err.emailExists") };
      }
      console.error("[admin] parent email update failed", authErr.message);
      return { error: t("accounts.edit.err.failed") };
    }
  }

  const patch: Record<string, unknown> = {
    display_name: displayName || null,
    phone: phone || null,
    email,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;

  const { error: updErr } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", parentProfileId);
  if (updErr) {
    console.error("[admin] parent profile update failed", updErr.message);
    return { error: t("accounts.edit.err.failed") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.account.parent.update",
    targetTable: "profiles",
    targetId: parentProfileId,
    // Metadata records WHICH fields changed (booleans/status only) — never the
    // email/phone/name values themselves.
    metadata: {
      status: status || undefined,
      emailChanged,
      phoneChanged,
      nameChanged: (prof.display_name ?? "") !== (displayName || ""),
    },
  });

  revalidatePath("/accounts");
  revalidatePath("/free-access"); // parent names render in the intervals table
  return { ok: true };
}

// =====================================================================
// UPDATE CHILD ACCOUNT — profile fields on the students row: names, grade,
// city (district) + school cascade, and optional class_grade. The 8-digit
// child_unique_id and every internal id stay READ-ONLY (never accepted here).
// =====================================================================
export type UpdateChildState = { error?: string; ok?: boolean } | null;

const CLASS_GRADE_MAX = 40;

export async function updateChildAccount(
  _prev: UpdateChildState,
  formData: FormData,
): Promise<UpdateChildState> {
  const ctx = await requireAdmin(); // authorize FIRST — before touching FormData
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const studentProfileId = f(formData, "student_profile_id");
  const firstName = f(formData, "first_name");
  const lastName = f(formData, "last_name");
  const gradeId = f(formData, "grade_id");
  const districtId = f(formData, "district_id");
  const schoolId = f(formData, "school_id");
  const classGrade = f(formData, "class_grade");

  // The student profile id only identifies the target row (hidden field). It is
  // never editable; reject anything that is not a UUID.
  if (!UUID_RE.test(studentProfileId)) {
    return { error: t("accounts.childEdit.err.failed") };
  }
  if (
    !firstName ||
    !lastName ||
    firstName.length > NAME_MAX ||
    lastName.length > NAME_MAX
  ) {
    return { error: t("accounts.create.err.required") };
  }
  if (gradeId && !UUID_RE.test(gradeId)) {
    return { error: t("accounts.childEdit.err.invalid") };
  }
  // City + school are required (parity with admin child creation); both UUIDs.
  if (!UUID_RE.test(districtId) || !UUID_RE.test(schoolId)) {
    return { error: t("accounts.child.create.err.cityschool") };
  }
  if (classGrade.length > CLASS_GRADE_MAX) return { error: t("err.tooLong") };

  const admin = createAdminClient();

  // Verify the target is genuinely a student (never let this edit an arbitrary
  // profile — defence-in-depth on top of the UUID check).
  const { data: student, error: stErr } = await admin
    .from("students")
    .select("profile_id")
    .eq("profile_id", studentProfileId)
    .maybeSingle();
  if (stErr) {
    console.error("[admin] student lookup failed", stErr.message);
    return { error: t("err.server") };
  }
  if (!student) return { error: t("accounts.childEdit.err.failed") };

  // Resolve + validate city/school server-side (never trust display names; the
  // school MUST belong to the chosen city).
  const { data: cityRow } = await admin
    .from("districts")
    .select("name")
    .eq("id", districtId)
    .maybeSingle();
  const { data: schoolRow } = await admin
    .from("schools")
    .select("name, district_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (
    !cityRow ||
    !schoolRow ||
    (schoolRow as { district_id: string }).district_id !== districtId
  ) {
    return { error: t("accounts.child.create.err.cityschool") };
  }

  // If a grade was chosen, confirm it exists (a client could post any UUID).
  if (gradeId) {
    const { data: gradeRow } = await admin
      .from("grades")
      .select("id")
      .eq("id", gradeId)
      .maybeSingle();
    if (!gradeRow) return { error: t("accounts.childEdit.err.invalid") };
  }

  const { error: updErr } = await admin
    .from("students")
    .update({
      first_name: firstName,
      last_name: lastName,
      grade_id: gradeId || null,
      district_id: districtId,
      school_id: schoolId,
      city: (cityRow as { name: string }).name,
      school_name: (schoolRow as { name: string }).name, // keep in sync
      class_grade: classGrade || null,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", studentProfileId);
  if (updErr) {
    console.error("[admin] child account update failed", updErr.message);
    return { error: t("accounts.childEdit.err.failed") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.account.child.update",
    targetTable: "students",
    targetId: studentProfileId,
    metadata: { gradeSet: !!gradeId, classGradeSet: !!classGrade },
  });

  revalidatePath("/accounts");
  revalidatePath("/free-access"); // child names render in the intervals table
  return { ok: true };
}

// =====================================================================
// DELETE CHILD — mirrors web-app deleteChild (auth delete cascades
// student/credentials/links). Admin variant skips the parent-ownership check
// (admins may delete any child) but still verifies the target is a child.
// =====================================================================
export type DeleteState = { error?: string; ok?: boolean } | null;

/**
 * Delete ONE auth user and PROVE it is gone. Returns null on success, or a
 * short reason for server-side logging. Twin of the web-app's
 * lib/auth/parentCore.deleteAuthUserVerified — same reasoning, same shape.
 *
 * WHY IT REPLACES `.catch(() => {})`. `deleteUser` CATCHES every AuthError and
 * RETURNS it as `{ data, error }` rather than throwing, so `.catch()` here
 * intercepted almost nothing and the discarded return value was the only place
 * a failure was ever reported. Both delete actions below then returned
 * `{ ok: true }` regardless. In the web app the identical pattern silently did
 * nothing on two of five real account deletions.
 *
 * Migration 167 makes this urgent rather than merely wrong: the cascade trigger
 * now RAISES rather than stranding a child login, so a refusal is a reachable
 * outcome. Swallowed, it would tell an administrator a family was deleted while
 * the parent and every child remain able to sign in.
 *
 * Success means the row is gone, not that the API stayed quiet.
 */
async function deleteAuthUserVerified(
  admin: ReturnType<typeof createAdminClient>,
  authUserId: string,
): Promise<string | null> {
  const { error } = await admin.auth.admin.deleteUser(authUserId);
  if (error) {
    // Already absent is the outcome we want, so a retry after a partial
    // failure can finish rather than trip over what it already removed.
    const status = (error as { status?: number }).status;
    const notFound = status === 404 || /not\s*found/i.test(error.message ?? "");
    if (!notFound) return `delete_failed:${status ?? "unknown"}`;
  }

  const { data, error: readError } = await admin.auth.admin.getUserById(authUserId);
  if (readError) {
    const status = (readError as { status?: number }).status;
    if (status === 404) return null;
    return `verify_failed:${status ?? "unknown"}`;
  }
  return data?.user ? "still_present" : null;
}

export async function deleteChild(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const ctx = await requireAdmin();
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const studentProfileId = f(formData, "student_profile_id");
  const confirm = f(formData, "confirm");
  if (!studentProfileId) return { error: t("accounts.delete.err.failed") };
  if (confirm !== t("accounts.delete.confirmWord")) {
    return { error: t("accounts.delete.err.confirm") };
  }

  const admin = createAdminClient();

  // Verify the target is genuinely a student before deleting.
  const { data: student } = await admin
    .from("students")
    .select("profile_id")
    .eq("profile_id", studentProfileId)
    .maybeSingle();
  if (!student) return { error: t("accounts.delete.err.failed") };

  // Delete the child auth user (cascades student/credentials/links via FK).
  const { data: cred } = await admin
    .from("child_credentials")
    .select("auth_user_id")
    .eq("student_profile_id", studentProfileId)
    .maybeSingle();
  if (cred?.auth_user_id) {
    const reason = await deleteAuthUserVerified(admin, cred.auth_user_id);
    if (reason) {
      // Never audit or report a deletion that did not happen: the child's
      // c<id>@children.invalid login still works.
      console.error("[admin] child delete incomplete", studentProfileId, reason);
      return { error: t("accounts.delete.err.failed") };
    }
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.child.delete",
    targetTable: "students",
    targetId: studentProfileId,
    severity: "warning",
  });

  revalidatePath("/accounts");
  revalidatePath("/free-access"); // interval rows for this child cascade away
  return { ok: true };
}

// =====================================================================
// DELETE PARENT — mirrors web-app deleteParentAccount: delete the parent's
// children first, then the parent auth user (cascades profile/parents/links).
// =====================================================================
export async function deleteParent(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const ctx = await requireAdmin();
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const parentProfileId = f(formData, "parent_profile_id");
  const confirm = f(formData, "confirm");
  if (!parentProfileId) return { error: t("accounts.delete.err.failed") };
  if (confirm !== t("accounts.delete.confirmWord")) {
    return { error: t("accounts.delete.err.confirm") };
  }

  const admin = createAdminClient();

  // L10: the target MUST verifiably hold the parent role (fail closed) —
  // deleteParent must never be usable against an admin/content-manager profile.
  if (!(await holdsParentRole(admin, parentProfileId))) {
    return { error: t("accounts.delete.err.failed") };
  }

  // Resolve the parent's auth user id.
  const { data: parentProfile } = await admin
    .from("profiles")
    .select("id, auth_user_id")
    .eq("id", parentProfileId)
    .maybeSingle();
  if (!parentProfile?.auth_user_id) {
    return { error: t("accounts.delete.err.failed") };
  }

  // Collected rather than thrown per-user: an administrator needs to know that
  // SOMETHING survived, and stopping at the first failure would leave more
  // behind than continuing does.
  const failures: string[] = [];

  // 1) Delete this parent's children (auth delete cascades their rows).
  const { data: students } = await admin
    .from("students")
    .select("profile_id")
    .eq("created_by_parent_profile_id", parentProfileId);
  const studentIds = (students ?? []).map(
    (s: { profile_id: string }) => s.profile_id,
  );
  if (studentIds.length > 0) {
    const { data: creds } = await admin
      .from("child_credentials")
      .select("auth_user_id")
      .in("student_profile_id", studentIds);
    for (const c of (creds ?? []) as { auth_user_id: string }[]) {
      if (c.auth_user_id) {
        const reason = await deleteAuthUserVerified(admin, c.auth_user_id);
        if (reason) failures.push(`child:${reason}`);
      }
    }
  }

  // 2) Delete the parent auth user (cascades profile/parents/links via FK).
  const parentReason = await deleteAuthUserVerified(admin, parentProfile.auth_user_id);
  if (parentReason) failures.push(`parent:${parentReason}`);

  if (failures.length > 0) {
    // Report the failure instead of auditing a deletion that did not happen.
    // Since migration 167 the cascade trigger REFUSES rather than stranding a
    // child login, so "nothing was deleted" is a real outcome an administrator
    // must be told about — otherwise the family is still able to sign in and
    // the audit log claims otherwise.
    console.error("[admin] parent delete incomplete", parentProfileId, failures.join(","));
    return { error: t("accounts.delete.err.failed") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.parent.delete",
    targetTable: "profiles",
    targetId: parentProfileId,
    metadata: { childrenDeleted: studentIds.length },
    severity: "warning",
  });

  revalidatePath("/accounts");
  revalidatePath("/free-access"); // interval rows for this parent cascade away
  return { ok: true };
}
