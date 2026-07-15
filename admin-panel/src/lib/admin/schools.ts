"use server";

// School save action + dropdown options for the merged Locations screen. Every
// school MUST belong to a City (districts.id — historic naming), so create/edit
// require a server-validated, non-null district_id; when the chosen city has
// ACTIVE rayons (city_districts), choosing one is REQUIRED too. Round 21: the
// standalone /schools pages were folded into /locations, so saveSchool is now
// STAY-mode: it returns { ok: true } instead of redirecting. Deletes live in
// lib/admin/locations.ts (deleteLocation, with the impact preview).
//
// Security: the mutation re-checks requireAdmin server-side FIRST and writes
// through the normal RLS-respecting server client. Only allowlisted columns
// (name, district_id, city_district_id, status, is_private) are ever written;
// school_number is DERIVED from the name server-side, never trusted from the
// client.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";

// Parse the numeric sort key from an AZ school name ("N nömrəli ...") — mirrors the
// SQL backfill (migration 029) so admin-entered names sort the same as seeds.
// Returns null when there is no such number.
function parseSchoolNumber(name: string): number | null {
  const m = name.match(/(\d+)\s+nömrəli/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export type CityOption = { value: string; label: string };

export type SchoolSaveState = { error?: string; ok?: boolean } | null;

const STATUSES = new Set(["active", "inactive"]);

function readStatus(formData: FormData): string {
  const raw = String(formData.get("status") ?? "").trim();
  return STATUSES.has(raw) ? raw : "active";
}

// Cities for the mandatory dropdown. Only active cities are offered for new
// links, but on edit the currently-linked city is always included so an
// inactive-but-assigned city still renders.
export async function listCityOptions(currentId?: string): Promise<CityOption[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("districts")
    .select("id, name, status")
    .order("name");
  return (data ?? [])
    .filter((r: any) => r.status === "active" || r.id === currentId)
    .map((r: any) => ({ value: r.id, label: String(r.name) }));
}

// Intra-city districts (rayons) for the City → District cascade in the school
// form. All ACTIVE districts of every city are returned (the client filters by
// the selected city); on edit the currently-assigned district is always
// included so an inactive-but-assigned district still renders.
export type SchoolDistrictOption = {
  value: string;
  cityId: string;
  label: string;
};

export async function listSchoolDistrictOptions(
  currentId?: string | null,
): Promise<SchoolDistrictOption[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("city_districts")
    .select("id, city_id, name, status")
    .order("name");
  return (data ?? [])
    .filter((r: any) => r.status === "active" || r.id === currentId)
    .map((r: any) => ({
      value: r.id as string,
      cityId: r.city_id as string,
      label: String(r.name),
    }));
}

export async function saveSchool(
  _prev: SchoolSaveState,
  formData: FormData,
): Promise<SchoolSaveState> {
  const ctx = await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const district_id = String(formData.get("district_id") ?? "").trim();
  const city_district_id = String(formData.get("city_district_id") ?? "").trim();
  const status = readStatus(formData);
  const is_private = formData.get("is_private") != null; // checkbox present => true

  if (!name) return { error: "missing.name" };
  // Cap: school name ≤ 200 (server-side). The form maps this unknown code to
  // its localized generic error.
  if (name.length > 200) return { error: "err.tooLong" };
  // Mandatory City — server-validated, never trust a missing/blank dropdown.
  if (!district_id) return { error: "missing.city" };

  const supabase = await createClient();

  // Defensive: confirm the chosen city exists (FK would also reject, but this
  // yields a friendly message rather than a raw 23503).
  const { data: city } = await supabase
    .from("districts")
    .select("id")
    .eq("id", district_id)
    .maybeSingle();
  if (!city) return { error: "missing.city" };

  // City → District pair validation (the DB school_district_guard trigger is
  // the backstop; this yields friendly messages instead of a raw 23514):
  //   * a chosen district must exist AND belong to the chosen city;
  //   * when the city has ACTIVE districts, choosing one is REQUIRED.
  if (city_district_id) {
    const { data: cd } = await supabase
      .from("city_districts")
      .select("id, city_id")
      .eq("id", city_district_id)
      .maybeSingle();
    if (!cd || cd.city_id !== district_id) return { error: "missing.district" };
  } else {
    const { count: activeDistricts } = await supabase
      .from("city_districts")
      .select("id", { count: "exact", head: true })
      .eq("city_id", district_id)
      .eq("status", "active");
    if ((activeDistricts ?? 0) > 0) return { error: "missing.district" };
  }

  // school_number is derived from the name (kept consistent with the SQL backfill),
  // never trusted from the client. is_private comes from the checkbox.
  const payload = {
    name,
    district_id,
    city_district_id: city_district_id || null,
    status,
    is_private,
    school_number: parseSchoolNumber(name),
  };

  let targetId = id || null;
  if (id) {
    const { error } = await supabase
      .from("schools")
      .update(payload)
      .eq("id", id);
    if (error) {
      // 23514 = the DB district guard (mismatched pair / required district).
      if ((error as { code?: string }).code === "23514")
        return { error: "missing.district" };
      // Never return raw DB error text to the client — generic code only.
      console.error("[admin] school update failed", error.message);
      return { error: "err.server" };
    }
  } else {
    const { data: created, error } = await supabase
      .from("schools")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23514")
        return { error: "missing.district" };
      console.error("[admin] school insert failed", error.message);
      return { error: "err.server" };
    }
    targetId = created?.id ?? null;
  }

  // M5: best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: id ? "admin.school.update" : "admin.school.create",
    targetTable: "schools",
    targetId,
    metadata: {
      name,
      district_id,
      city_district_id: city_district_id || null,
      status,
    },
  });

  revalidatePath("/locations");
  return { ok: true };
}
