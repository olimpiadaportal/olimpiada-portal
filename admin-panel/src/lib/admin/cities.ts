"use server";

// Cities admin CRUD. "Cities" are backed by the public.districts table (the
// admin-managed CITY catalog — schools.district_id references it). This module
// is intentionally dedicated (not the generic resources registry) so we can
// surface a friendly error when a city is deleted while schools still reference
// it (districts FK is ON DELETE RESTRICT).
//
// Security: every mutation re-checks requireAdmin server-side and writes through
// the normal RLS-respecting server client. Only the allowlisted columns
// (name, status) are ever written; country_code is not exposed in the UI and is
// always defaulted to 'AZ' server-side.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";

export type CityRow = {
  id: string;
  name: string;
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
    .select("id, name, status, schools(count)")
    .order("name");
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    school_count: r.schools?.[0]?.count ?? 0,
  }));
}

export async function getCity(id: string): Promise<CityRow | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("districts")
    .select("id, name, status")
    .eq("id", id)
    .maybeSingle();
  return (data as CityRow) ?? null;
}

export async function saveCity(
  _prev: CitySaveState,
  formData: FormData,
): Promise<CitySaveState> {
  const ctx = await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const status = readStatus(formData);

  if (!name) return { error: "missing.name" };
  // Cap: city/district name ≤ 120 (server-side). The form maps this unknown
  // code to its localized generic error.
  if (name.length > 120) return { error: "err.tooLong" };

  const supabase = await createClient();
  // country_code is not exposed in the admin UI; cities are always Azerbaijan.
  // We always default it to 'AZ' server-side so the DB unique(country_code, name)
  // constraint keeps working (the column stays in the districts table).
  const payload = { name, country_code: "AZ", status };

  let targetId = id || null;
  if (id) {
    const { error } = await supabase
      .from("districts")
      .update(payload)
      .eq("id", id);
    if (error) {
      // Never return raw DB error text to the client — generic code only.
      console.error("[admin] city update failed", error.message);
      return { error: "err.server" };
    }
  } else {
    const { data: created, error } = await supabase
      .from("districts")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      // unique(country_code, name) collision
      if ((error as { code?: string }).code === "23505")
        return { error: "duplicate" };
      console.error("[admin] city insert failed", error.message);
      return { error: "err.server" };
    }
    targetId = created?.id ?? null;
  }

  // M5: best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: id ? "admin.city.update" : "admin.city.create",
    targetTable: "districts",
    targetId,
    metadata: { name, status },
  });

  revalidatePath("/cities");
  redirect("/cities");
}

export type CityDeleteState = { error?: string } | null;

export async function deleteCity(
  _prev: CityDeleteState,
  formData: FormData,
): Promise<CityDeleteState> {
  const ctx = await requireAdmin();
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
    // Never return raw DB error text to the client — generic code only.
    console.error("[admin] city delete failed", error.message);
    return { error: "err.server" };
  }

  // M5: best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.city.delete",
    targetTable: "districts",
    targetId: id,
    severity: "warning",
  });

  revalidatePath("/cities");
  redirect("/cities");
}
