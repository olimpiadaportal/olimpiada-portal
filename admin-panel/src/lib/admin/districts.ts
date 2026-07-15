"use server";

// City-district (rayon) save action for the merged Locations screen. Backed by
// public.city_districts — intra-city administrative districts (city_id
// references public.districts, the CITIES table, historic naming). Round 21:
// the standalone /districts pages were folded into /locations, so saveDistrict
// is now STAY-mode: it returns { ok: true } instead of redirecting. Deletes
// live in lib/admin/locations.ts (deleteLocation, with the impact preview).
//
// Kept behaviors:
//   * the mandatory City link (server-validated, never trusted from the client),
//   * the unique(city_id, name) collision surfaced as a friendly message,
//   * the refusal to move a district to another city while schools reference it
//     (would leave those schools with a mismatched city/district pair).
//
// Security: the mutation re-checks requireAdmin server-side FIRST and writes
// through the normal RLS-respecting server client (city_districts writes are
// admin-only by RLS). Only allowlisted columns (city_id, name, status) are
// ever written.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";

export type DistrictSaveState = { error?: string; ok?: boolean } | null;

const STATUSES = new Set(["active", "inactive"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readStatus(formData: FormData): string {
  const raw = String(formData.get("status") ?? "").trim();
  return STATUSES.has(raw) ? raw : "active";
}

export async function saveDistrict(
  _prev: DistrictSaveState,
  formData: FormData,
): Promise<DistrictSaveState> {
  const ctx = await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const city_id = String(formData.get("city_id") ?? "").trim();
  const status = readStatus(formData);

  if (!name) return { error: "missing.name" };
  // Cap: district name ≤ 120 (server-side) — same cap as cities.
  if (name.length > 120) return { error: "err.tooLong" };
  if (!city_id || !UUID_RE.test(city_id)) return { error: "missing.city" };

  const supabase = await createClient();

  // Defensive: confirm the chosen city exists (FK would also reject, but this
  // yields a friendly message rather than a raw 23503).
  const { data: city } = await supabase
    .from("districts")
    .select("id")
    .eq("id", city_id)
    .maybeSingle();
  if (!city) return { error: "missing.city" };

  const payload = { city_id, name, status };
  let targetId = id || null;

  if (id) {
    // Moving a district to ANOTHER city while schools reference it would leave
    // those schools with a mismatched city/district pair — refuse up front.
    const { data: existing } = await supabase
      .from("city_districts")
      .select("id, city_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return { error: "err.server" };
    if (existing.city_id !== city_id) {
      const { count } = await supabase
        .from("schools")
        .select("id", { count: "exact", head: true })
        .eq("city_district_id", id);
      if ((count ?? 0) > 0) return { error: "cityChange" };
    }

    const { error } = await supabase
      .from("city_districts")
      .update(payload)
      .eq("id", id);
    if (error) {
      // unique(city_id, name) collision
      if ((error as { code?: string }).code === "23505")
        return { error: "duplicate" };
      // Never return raw DB error text to the client — generic code only.
      console.error("[admin] district update failed", error.message);
      return { error: "err.server" };
    }
  } else {
    const { data: created, error } = await supabase
      .from("city_districts")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505")
        return { error: "duplicate" };
      console.error("[admin] district insert failed", error.message);
      return { error: "err.server" };
    }
    targetId = created?.id ?? null;
  }

  // Best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: id ? "admin.district.update" : "admin.district.create",
    targetTable: "city_districts",
    targetId,
    metadata: { name, city_id, status },
  });

  revalidatePath("/locations");
  return { ok: true };
}
