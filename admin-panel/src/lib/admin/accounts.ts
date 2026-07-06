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
// RESET CHILD PASSWORD (existing behaviour — unchanged)
// =====================================================================
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
  if (password.length < 8) return { error: t("accounts.reset.err.short") };
  // L11: cap the password length server-side as well.
  if (password.length > PASSWORD_MAX) return { error: t("err.tooLong") };

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

  // Defensive: never allow the password to equal the public 8-digit ID.
  if (password === cred.child_unique_id) {
    return { error: t("accounts.reset.err.equalsId") };
  }

  // 2) Reset the password via the Auth admin API.
  const { error: updErr } = await admin.auth.admin.updateUserById(
    cred.auth_user_id,
    { password },
  );
  if (updErr) {
    // Never return raw Auth error text to the client (never log passwords).
    console.error("[admin] child password reset failed", updErr.message);
    return { error: t("err.server") };
  }

  // 3) Record who/when the password was last set.
  await admin
    .from("child_credentials")
    .update({
      password_set_by_parent_profile_id: ctx.profileId,
      password_set_at: new Date().toISOString(),
    })
    .eq("student_profile_id", studentProfileId);

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.child.password_reset",
    targetTable: "child_credentials",
    targetId: studentProfileId,
    severity: "warning",
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
export type CreateParentState = { error?: string; ok?: boolean } | null;

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
  if (password.length < 8) return { error: t("accounts.create.err.password") };
  if (password.length > PASSWORD_MAX) return { error: t("err.tooLong") };

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
  return { ok: true };
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
export type CreateChildState =
  | { error?: string; ok?: boolean; childUniqueId?: string | null }
  | null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_INTERVALS = new Set(["week", "month", "year"]);
const NAME_MAX = 80;
const PASSWORD_MAX = 128;
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
  if (password.length < 8 || password.length > PASSWORD_MAX) {
    return { error: t("accounts.create.err.password") };
  }
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
    return { ok: true, childUniqueId };
  } catch (e) {
    // Saga cleanup: remove the orphaned auth user (cascades every DB row the
    // flow created). Never surface raw DB/Auth details to the client.
    console.error("[admin] child create flow failed", (e as Error).message);
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    return { error: t("accounts.child.create.err.failed") };
  }
}

// =====================================================================
// UPDATE PARENT — display name + account status (active / suspended).
// =====================================================================
export type UpdateParentState = { error?: string; ok?: boolean } | null;

const ALLOWED_PARENT_STATUSES = new Set(["active", "suspended"]);

export async function updateParent(
  _prev: UpdateParentState,
  formData: FormData,
): Promise<UpdateParentState> {
  const ctx = await requireAdmin();
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const parentProfileId = f(formData, "parent_profile_id");
  const displayName = f(formData, "display_name");
  const status = f(formData, "status");

  if (!parentProfileId) return { error: t("accounts.edit.err.failed") };
  // Never trust a client-submitted status outside the allowed transitions.
  if (status && !ALLOWED_PARENT_STATUSES.has(status)) {
    return { error: t("accounts.edit.err.failed") };
  }

  const admin = createAdminClient();

  // Confirm the target is actually a parent (defence-in-depth: do not let this
  // become a generic profile-status editor for admins/content managers).
  // L10: fail CLOSED — if the role lookup yields nothing (missing seed row,
  // transient error), the mutation is refused rather than skipping the check.
  if (!(await holdsParentRole(admin, parentProfileId))) {
    return { error: t("accounts.edit.err.failed") };
  }

  const patch: Record<string, unknown> = {
    display_name: displayName || null,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;

  const { error: updErr } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", parentProfileId);
  if (updErr) return { error: t("accounts.edit.err.failed") };

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.parent.update",
    targetTable: "profiles",
    targetId: parentProfileId,
    metadata: { status: status || undefined },
  });

  revalidatePath("/accounts");
  revalidatePath("/free-access"); // parent names render in the intervals table
  return { ok: true };
}

// =====================================================================
// DELETE CHILD — mirrors web-app deleteChild (auth delete cascades
// student/credentials/links). Admin variant skips the parent-ownership check
// (admins may delete any child) but still verifies the target is a child.
// =====================================================================
export type DeleteState = { error?: string; ok?: boolean } | null;

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
    await admin.auth.admin.deleteUser(cred.auth_user_id).catch(() => {});
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
        await admin.auth.admin.deleteUser(c.auth_user_id).catch(() => {});
      }
    }
  }

  // 2) Delete the parent auth user (cascades profile/parents/links via FK).
  await admin.auth.admin.deleteUser(parentProfile.auth_user_id).catch(() => {});

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
