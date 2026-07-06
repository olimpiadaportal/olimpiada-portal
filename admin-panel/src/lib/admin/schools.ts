"use server";

// Schools admin CRUD. Every school MUST belong to a City (districts.id), so
// create/edit require a server-validated, non-null district_id chosen from the
// city dropdown. Dedicated (not generic-registry) so we can hard-enforce the
// mandatory City link server-side and show the city in the list.
//
// Security: every mutation re-checks requireAdmin server-side and writes through
// the normal RLS-respecting server client. Only allowlisted columns
// (name, district_id, status) are ever written.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";

export type SchoolRow = {
  id: string;
  name: string;
  district_id: string;
  status: string;
  is_private: boolean;
  school_number: number | null;
  city_name?: string;
};

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

export type SchoolSaveState = { error?: string } | null;

const STATUSES = new Set(["active", "inactive"]);

function readStatus(formData: FormData): string {
  const raw = String(formData.get("status") ?? "").trim();
  return STATUSES.has(raw) ? raw : "active";
}

export async function listSchools(): Promise<SchoolRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  // Round 12: private schools first, then numeric school_number asc (nulls last),
  // then name.
  const { data } = await supabase
    .from("schools")
    .select("id, name, district_id, status, is_private, school_number, districts(name)")
    .order("is_private", { ascending: false })
    .order("school_number", { ascending: true, nullsFirst: false })
    .order("name");
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    district_id: r.district_id,
    status: r.status,
    is_private: !!r.is_private,
    school_number: r.school_number ?? null,
    city_name: r.districts?.name ?? "—",
  }));
}

export async function getSchool(id: string): Promise<SchoolRow | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("schools")
    .select("id, name, district_id, status, is_private, school_number")
    .eq("id", id)
    .maybeSingle();
  return (data as SchoolRow) ?? null;
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

export async function saveSchool(
  _prev: SchoolSaveState,
  formData: FormData,
): Promise<SchoolSaveState> {
  const ctx = await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const district_id = String(formData.get("district_id") ?? "").trim();
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

  // school_number is derived from the name (kept consistent with the SQL backfill),
  // never trusted from the client. is_private comes from the checkbox.
  const payload = {
    name,
    district_id,
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
    metadata: { name, district_id, status },
  });

  revalidatePath("/schools");
  redirect("/schools");
}

export async function deleteSchool(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("schools").delete().eq("id", id);

  if (!error) {
    // M5: best-effort audit trail.
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.school.delete",
      targetTable: "schools",
      targetId: id,
      severity: "warning",
    });
  }

  revalidatePath("/schools");
}
