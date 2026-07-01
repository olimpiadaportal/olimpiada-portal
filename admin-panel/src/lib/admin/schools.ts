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

export type SchoolRow = {
  id: string;
  name: string;
  district_id: string;
  status: string;
  city_name?: string;
};

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
  const { data } = await supabase
    .from("schools")
    .select("id, name, district_id, status, districts(name)")
    .order("name");
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    district_id: r.district_id,
    status: r.status,
    city_name: r.districts?.name ?? "—",
  }));
}

export async function getSchool(id: string): Promise<SchoolRow | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("schools")
    .select("id, name, district_id, status")
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
  await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const district_id = String(formData.get("district_id") ?? "").trim();
  const status = readStatus(formData);

  if (!name) return { error: "missing.name" };
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

  const payload = { name, district_id, status };

  if (id) {
    const { error } = await supabase
      .from("schools")
      .update(payload)
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("schools").insert(payload);
    if (error) return { error: error.message };
  }
  revalidatePath("/schools");
  redirect("/schools");
}

export async function deleteSchool(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("schools").delete().eq("id", id);
  revalidatePath("/schools");
}
