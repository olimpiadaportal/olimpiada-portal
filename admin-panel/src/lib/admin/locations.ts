"use server";

// Locations (merged Cities → Districts → Schools screen) server actions:
//   * getLocationDeleteImpact — counts shown in the delete-confirmation modal
//     BEFORE a destructive action (what cascades, what blocks, what detaches);
//   * deleteLocation — the actual delete for all three kinds, returning state
//     (no redirect) so the explorer can refresh in place.
//
// FK semantics surfaced by the impact preview (verified against 003/011):
//   * delete CITY (districts row): its rayons (city_districts.city_id) CASCADE-
//     delete silently; schools.district_id is ON DELETE RESTRICT so any linked
//     school BLOCKS the delete (23503 → "cityInUse"); students.district_id is
//     ON DELETE SET NULL (informational count).
//   * delete RAYON (city_districts row): schools.city_district_id is ON DELETE
//     SET NULL, but the school_district_guard trigger rejects unsetting while
//     the city still has active rayons (23514 → "districtInUse"); if it ever
//     succeeds those schools return to the needs-district review list.
//   * delete SCHOOL: students.school_id is ON DELETE SET NULL — students are
//     detached silently, so the modal shows the student count.
//
// Security: requireAdmin() FIRST in every action; kind is enum-whitelisted and
// ids are UUID-shape-checked before any query; audit rows on every delete
// (same action names the previous per-page deletes used); raw DB errors are
// never returned to the client.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";

export type LocationKind = "city" | "district" | "school";

const KINDS = new Set<LocationKind>(["city", "district", "school"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Kind → the real table behind it (historic naming: districts = cities).
const TABLES: Record<LocationKind, string> = {
  city: "districts",
  district: "city_districts",
  school: "schools",
};

export type LocationDeleteImpact =
  | {
      ok: true;
      // city: rayons that cascade-delete; district/school: 0.
      districts: number;
      // city: schools that BLOCK the delete; district: schools that would
      // return to the review list; school: 0.
      schools: number;
      // city: students enrolled in this city's schools; school: students that
      // will be detached; district: 0.
      students: number;
    }
  | { error: string };

export async function getLocationDeleteImpact(
  kind: LocationKind,
  id: string,
): Promise<LocationDeleteImpact> {
  await requireAdmin();
  if (!KINDS.has(kind) || typeof id !== "string" || !UUID_RE.test(id))
    return { error: "err.server" };

  const supabase = await createClient();

  if (kind === "city") {
    const [d, s, st] = await Promise.all([
      supabase
        .from("city_districts")
        .select("id", { count: "exact", head: true })
        .eq("city_id", id),
      supabase
        .from("schools")
        .select("id", { count: "exact", head: true })
        .eq("district_id", id),
      // Students whose school belongs to this city (informational — their
      // school link would go away with the city's schools).
      supabase
        .from("students")
        .select("id, schools!inner(district_id)", {
          count: "exact",
          head: true,
        })
        .eq("schools.district_id", id),
    ]);
    return {
      ok: true,
      districts: d.count ?? 0,
      schools: s.count ?? 0,
      students: st.count ?? 0,
    };
  }

  if (kind === "district") {
    const { count } = await supabase
      .from("schools")
      .select("id", { count: "exact", head: true })
      .eq("city_district_id", id);
    return { ok: true, districts: 0, schools: count ?? 0, students: 0 };
  }

  // school
  const { count } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", id);
  return { ok: true, districts: 0, schools: 0, students: count ?? 0 };
}

export type LocationDeleteResult = { ok: true } | { error: string };

export async function deleteLocation(
  kind: LocationKind,
  id: string,
): Promise<LocationDeleteResult> {
  const ctx = await requireAdmin();
  if (!KINDS.has(kind) || typeof id !== "string" || !UUID_RE.test(id))
    return { error: "err.server" };

  const supabase = await createClient();
  const table = TABLES[kind];
  const { error } = await supabase.from(table).delete().eq("id", id);

  if (error) {
    const code = (error as { code?: string }).code;
    // 23503 = schools still reference the city (ON DELETE RESTRICT).
    if (kind === "city" && code === "23503") return { error: "cityInUse" };
    // 23514 = the school_district_guard rejected unsetting the rayon while the
    // city still has active rayons (23503 kept as a defensive alias).
    if (kind === "district" && (code === "23514" || code === "23503"))
      return { error: "districtInUse" };
    // Never return raw DB error text to the client — generic code only.
    console.error(`[admin] ${kind} delete failed`, error.message);
    return { error: "err.server" };
  }

  // Best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: `admin.${kind}.delete`,
    targetTable: table,
    targetId: id,
    severity: "warning",
  });

  revalidatePath("/locations");
  return { ok: true };
}
