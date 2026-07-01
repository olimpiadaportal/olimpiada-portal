"use server";

// Cities admin CRUD. "Cities" are backed by the public.districts table (the
// admin-managed CITY catalog — schools.district_id references it). This module
// is intentionally dedicated (not the generic resources registry) so we can
// surface a friendly error when a city is deleted while schools still reference
// it (districts FK is ON DELETE RESTRICT).
//
// Security: every mutation re-checks requireAdmin server-side and writes through
// the normal RLS-respecting server client. Only the allowlisted columns
// (name, country_code, status) are ever written.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";

export type CityRow = {
  id: string;
  name: string;
  country_code: string;
  status: string;
  school_count?: number;
};

export type CitySaveState = { error?: string } | null;

const STATUSES = new Set(["active", "inactive"]);

function readStatus(formData: FormData): string {
  const raw = String(formData.get("status") ?? "").trim();
  return STATUSES.has(raw) ? raw : "active";
}

export async function listCities(): Promise<CityRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("districts")
    .select("id, name, country_code, status, schools(count)")
    .order("name");
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    country_code: r.country_code,
    status: r.status,
    school_count: r.schools?.[0]?.count ?? 0,
  }));
}

export async function getCity(id: string): Promise<CityRow | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("districts")
    .select("id, name, country_code, status")
    .eq("id", id)
    .maybeSingle();
  return (data as CityRow) ?? null;
}

export async function saveCity(
  _prev: CitySaveState,
  formData: FormData,
): Promise<CitySaveState> {
  await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const country_code =
    String(formData.get("country_code") ?? "").trim().toUpperCase() || "AZ";
  const status = readStatus(formData);

  if (!name) return { error: "missing.name" };

  const supabase = await createClient();
  const payload = { name, country_code, status };

  if (id) {
    const { error } = await supabase
      .from("districts")
      .update(payload)
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("districts").insert(payload);
    if (error) {
      // unique(country_code, name) collision
      if ((error as { code?: string }).code === "23505")
        return { error: "duplicate" };
      return { error: error.message };
    }
  }
  revalidatePath("/cities");
  redirect("/cities");
}

export type CityDeleteState = { error?: string } | null;

export async function deleteCity(
  _prev: CityDeleteState,
  formData: FormData,
): Promise<CityDeleteState> {
  await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  if (!id) return { error: "missing.id" };

  const supabase = await createClient();
  const { error } = await supabase.from("districts").delete().eq("id", id);
  if (error) {
    // 23503 = foreign_key_violation: schools still reference this city
    // (schools.district_id ON DELETE RESTRICT). Surface a friendly message
    // instead of crashing.
    if ((error as { code?: string }).code === "23503")
      return { error: "cityInUse" };
    return { error: error.message };
  }
  revalidatePath("/cities");
  redirect("/cities");
}
