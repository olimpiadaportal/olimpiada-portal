"use server";

// Free-Access management — Administrator-only.
//
// A free-access interval grants FREE access (no paid rows) to a target while
// now() is inside [starts_at, ends_at) and is_active. The target is EITHER a
// whole parent (parent_profile_id set, student null) OR a specific child
// (student_profile_id set, parent null). Enforced by DB (migration 033) +
// admin-only RLS + the SECURITY DEFINER attempt guards.
//
// SECURITY POSTURE (identical to lib/admin/accounts.ts):
//   1) requireAdmin() ALWAYS runs first — before any FormData is read.
//   2) The SERVICE-ROLE admin client (bypasses RLS) is only created AFTER the
//      admin check and never leaves the server.
//   3) Every client-supplied id is re-validated (UUID shape + ownership) before
//      the privileged insert, and raw DB errors are never returned to the client.
//   4) Mutations record an audit_logs entry (best-effort).
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guards";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/admin/audit";
import { getT } from "@/i18n/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 300;

function f(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

// =====================================================================
// getParentChildren — options for the optional "specific child" select.
// Returns the students CREATED BY this parent (name = first+last, falling back
// to the student profile's display_name). Admin-only; service-role.
// =====================================================================
export type ChildOption = { id: string; name: string };

export async function getParentChildren(
  parentProfileId: string,
): Promise<ChildOption[]> {
  await requireAdmin(); // authorize FIRST
  if (!hasServiceRole()) return [];
  if (!UUID_RE.test(parentProfileId)) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("students")
    .select("profile_id, first_name, last_name")
    .eq("created_by_parent_profile_id", parentProfileId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  const rows = data as {
    profile_id: string;
    first_name: string | null;
    last_name: string | null;
  }[];

  // Fallback to the student profile's display_name only for rows with no name.
  const missing = rows
    .filter((r) => !`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim())
    .map((r) => r.profile_id);
  const displayById = new Map<string, string>();
  if (missing.length) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", missing);
    for (const p of (profs ?? []) as {
      id: string;
      display_name: string | null;
    }[]) {
      displayById.set(p.id, (p.display_name ?? "").trim());
    }
  }

  return rows.map((r) => {
    const nm = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
    return {
      id: r.profile_id,
      name: nm || displayById.get(r.profile_id) || "—",
    };
  });
}

// =====================================================================
// listFreeAccessIntervals — every interval (newest first), enriched with the
// parent/student display names and a computed status. Admin-only; service-role.
// =====================================================================
export type IntervalStatus = "active" | "scheduled" | "expired" | "inactive";

export type FreeAccessRow = {
  id: string;
  parentName: string | null;
  studentName: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  status: IntervalStatus;
  note: string | null;
};

export async function listFreeAccessIntervals(): Promise<FreeAccessRow[]> {
  await requireAdmin();
  if (!hasServiceRole()) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("free_access_intervals")
    .select(
      "id, parent_profile_id, student_profile_id, starts_at, ends_at, is_active, note",
    )
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  const rows = data as {
    id: string;
    parent_profile_id: string | null;
    student_profile_id: string | null;
    starts_at: string;
    ends_at: string;
    is_active: boolean;
    note: string | null;
  }[];
  if (rows.length === 0) return [];

  const parentIds = Array.from(
    new Set(rows.map((r) => r.parent_profile_id).filter(Boolean)),
  ) as string[];
  const studentIds = Array.from(
    new Set(rows.map((r) => r.student_profile_id).filter(Boolean)),
  ) as string[];

  // Parent names (profiles.display_name).
  const parentName = new Map<string, string>();
  if (parentIds.length) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", parentIds);
    for (const p of (profs ?? []) as {
      id: string;
      display_name: string | null;
    }[]) {
      parentName.set(p.id, (p.display_name ?? "").trim());
    }
  }

  // Student names (first+last, falling back to the student profile display_name).
  const studentName = new Map<string, string>();
  if (studentIds.length) {
    const { data: kids } = await admin
      .from("students")
      .select("profile_id, first_name, last_name")
      .in("profile_id", studentIds);
    for (const s of (kids ?? []) as {
      profile_id: string;
      first_name: string | null;
      last_name: string | null;
    }[]) {
      const nm = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
      if (nm) studentName.set(s.profile_id, nm);
    }
    const missing = studentIds.filter((id) => !studentName.get(id));
    if (missing.length) {
      const { data: sp } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", missing);
      for (const p of (sp ?? []) as {
        id: string;
        display_name: string | null;
      }[]) {
        const dn = (p.display_name ?? "").trim();
        if (dn) studentName.set(p.id, dn);
      }
    }
  }

  const now = Date.now();
  return rows.map((r) => {
    const start = new Date(r.starts_at).getTime();
    const end = new Date(r.ends_at).getTime();
    let status: IntervalStatus;
    if (!r.is_active) status = "inactive";
    else if (now >= end) status = "expired";
    else if (now < start) status = "scheduled";
    else status = "active";
    return {
      id: r.id,
      parentName: r.parent_profile_id
        ? parentName.get(r.parent_profile_id) || "—"
        : null,
      studentName: r.student_profile_id
        ? studentName.get(r.student_profile_id) || "—"
        : null,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      isActive: r.is_active,
      status,
      note: r.note,
    };
  });
}

// =====================================================================
// createFreeAccessInterval — schedule a new free-access window.
// =====================================================================
export type CreateFreeAccessState = { ok?: boolean; error?: string } | null;

export async function createFreeAccessInterval(
  _prev: CreateFreeAccessState,
  formData: FormData,
): Promise<CreateFreeAccessState> {
  const ctx = await requireAdmin(); // authorize FIRST — before touching FormData
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  // ---- Validate every client-supplied field (server-side, hard) -------------
  const parentProfileId = f(formData, "parent_profile_id");
  const studentProfileId = f(formData, "student_profile_id"); // optional
  const startsRaw = f(formData, "starts_at");
  const endsRaw = f(formData, "ends_at");
  const note = f(formData, "note").slice(0, NOTE_MAX);

  if (!UUID_RE.test(parentProfileId)) {
    return { error: t("freeAccess.err.parent") };
  }
  if (studentProfileId && !UUID_RE.test(studentProfileId)) {
    return { error: t("freeAccess.err.child") };
  }

  const start = new Date(startsRaw);
  const end = new Date(endsRaw);
  if (
    !startsRaw ||
    !endsRaw ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return { error: t("freeAccess.err.dates") };
  }
  if (end.getTime() <= start.getTime()) {
    return { error: t("freeAccess.err.window") };
  }
  // Reject a window that has already ended — nothing to grant.
  if (end.getTime() <= Date.now()) {
    return { error: t("freeAccess.err.past") };
  }

  const admin = createAdminClient();

  // The target parent must be a REAL parent (parents row).
  const { data: parentRow, error: parentErr } = await admin
    .from("parents")
    .select("profile_id")
    .eq("profile_id", parentProfileId)
    .maybeSingle();
  if (parentErr) {
    console.error("[admin] free-access parent lookup failed", parentErr.message);
    return { error: t("err.server") };
  }
  if (!parentRow) return { error: t("freeAccess.err.parent") };

  // If a specific child was chosen, it MUST belong to that parent.
  if (studentProfileId) {
    const { data: childRow, error: childErr } = await admin
      .from("students")
      .select("profile_id")
      .eq("profile_id", studentProfileId)
      .eq("created_by_parent_profile_id", parentProfileId)
      .maybeSingle();
    if (childErr) {
      console.error("[admin] free-access child lookup failed", childErr.message);
      return { error: t("err.server") };
    }
    if (!childRow) return { error: t("freeAccess.err.child") };
  }

  // Target a specific child (student set, parent null) OR the whole parent
  // (parent set, student null) — never both (the DB also allows either).
  const target = studentProfileId
    ? { student_profile_id: studentProfileId, parent_profile_id: null }
    : { parent_profile_id: parentProfileId, student_profile_id: null };

  const { error: insErr } = await admin.from("free_access_intervals").insert({
    ...target,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    is_active: true,
    note: note || null,
    created_by_admin_id: ctx.profileId,
  });
  if (insErr) {
    console.error("[admin] free-access insert failed", insErr.message);
    return { error: t("freeAccess.err.failed") };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.free_access.create",
    targetTable: "free_access_intervals",
    metadata: {
      parent_profile_id: parentProfileId,
      student_profile_id: studentProfileId || undefined,
    },
  });

  revalidatePath("/free-access");
  return { ok: true };
}

// =====================================================================
// deactivateFreeAccessInterval — turn OFF a scheduled/active window.
// Lazy model: is_active=false stops it immediately (nothing to unwind).
// =====================================================================
export async function deactivateFreeAccessInterval(
  formData: FormData,
): Promise<void> {
  const ctx = await requireAdmin();
  if (!hasServiceRole()) return;

  const id = f(formData, "id");
  if (!UUID_RE.test(id)) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("free_access_intervals")
    .update({ is_active: false })
    .eq("id", id);
  if (error) {
    console.error("[admin] free-access deactivate failed", error.message);
    return;
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.free_access.deactivate",
    targetTable: "free_access_intervals",
    targetId: id,
    severity: "warning",
  });

  revalidatePath("/free-access");
}
