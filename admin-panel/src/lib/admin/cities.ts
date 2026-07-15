"use server";

// City save action for the merged Locations screen. "Cities" are backed by the
// public.districts table (the admin-managed CITY catalog — schools.district_id
// references it). Round 21: the standalone /cities pages were folded into
// /locations, so saveCity is now STAY-mode: it returns { ok: true } instead of
// redirecting, and the explorer refreshes in place. Deletes live in
// lib/admin/locations.ts (deleteLocation, with the impact preview).
//
// Security: the mutation re-checks requireAdmin server-side FIRST and writes
// through the normal RLS-respecting server client. Only the allowlisted
// columns (name, status) are ever written; country_code is not exposed in the
// UI and is always defaulted to 'AZ' server-side.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";

export type CitySaveState = { error?: string; ok?: boolean } | null;

const STATUSES = new Set(["active", "inactive"]);

function readStatus(formData: FormData): string {
  const raw = String(formData.get("status") ?? "").trim();
  return STATUSES.has(raw) ? raw : "active";
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
  // Cap: city name ≤ 120 (server-side). The form maps this unknown code to its
  // localized generic error.
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
      // unique(country_code, name) collision on rename
      if ((error as { code?: string }).code === "23505")
        return { error: "duplicate" };
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

  revalidatePath("/locations");
  return { ok: true };
}
