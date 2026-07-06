"use server";

// Generic, allowlisted create/update/delete for taxonomy/config resources.
// Security: the slug must exist in RESOURCES; only registry-defined columns are
// written; access is re-checked server-side; RLS is the final gate.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getResource, type Resource } from "@/lib/admin/resources";
import { requireAdmin, requirePanelAccess } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { getT } from "@/i18n/server";

export type SaveState = { error?: string } | null;

// Server-side length cap on free text (taxonomy/config names ≤ 120).
const TEXT_MAX = 120;

// Auto-generate the internal stable `code` (no longer a UI input) from `name`.
const AZ_MAP: Record<string, string> = {
  ə: "e", ö: "o", ü: "u", ğ: "g", ı: "i", ç: "c", ş: "s",
};
function slugifyCode(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[əöügıçş]/g, (c) => AZ_MAP[c] ?? c)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "item"
  );
}

type BuiltPayload =
  | { payload: Record<string, unknown>; invalid?: undefined }
  | { payload?: undefined; invalid: "number" | "text" };

function buildPayload(res: Resource, formData: FormData): BuiltPayload {
  const payload: Record<string, unknown> = {};
  for (const f of res.fields) {
    if (f.type === "boolean") {
      payload[f.name] = formData.get(f.name) != null;
      continue;
    }
    const raw = formData.get(f.name);
    const val = typeof raw === "string" ? raw.trim() : "";
    if (f.type === "number") {
      if (val === "") {
        payload[f.name] = null;
        continue;
      }
      const n = Number(val);
      // Numeric guard: reject NaN/Infinity and negatives.
      if (!Number.isFinite(n) || n < 0) return { invalid: "number" };
      // Grade level is a school class: integer 1..11 only.
      if (
        res.slug === "grades" &&
        f.name === "level" &&
        (!Number.isInteger(n) || n < 1 || n > 11)
      ) {
        return { invalid: "number" };
      }
      payload[f.name] = n;
    } else if (f.type === "reference" || f.type === "select") {
      payload[f.name] = val === "" ? null : val;
    } else {
      // Cap: taxonomy/config names ≤ 120 (server-side, mirrors the UI limit).
      if (val.length > TEXT_MAX) return { invalid: "text" };
      payload[f.name] = val;
    }
  }
  return { payload };
}

export async function saveRow(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  // L8: guard FIRST — the cheapest gate (panel access) runs before ANY
  // client-supplied FormData is read; escalation to admin happens as soon as
  // the registry flag is known. getAuthContext is request-memoized, so the
  // second guard reuses the same lookup.
  const ctx = await requirePanelAccess();
  const slug = String(formData.get("__slug") ?? "");
  const id = String(formData.get("__id") ?? "");
  const res = getResource(slug);
  if (!res) return { error: "Unknown resource." };
  if (res.adminOnly) await requireAdmin();
  const t = await getT();

  const supabase = await createClient();
  const built = buildPayload(res, formData);
  if (built.invalid) {
    return { error: built.invalid === "text" ? t("err.tooLong") : t("err.server") };
  }
  const payload = built.payload;

  if (id) {
    const { error } = await supabase.from(res.table).update(payload).eq("id", id);
    if (error) {
      console.error("[admin] resource update failed", slug, error.message);
      return { error: t("err.server") };
    }
    // M5: best-effort audit trail (never fails the mutation — handled inside).
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.resource.update",
      targetTable: res.table,
      targetId: id,
      metadata: { resource: slug, id },
    });
    revalidatePath(`/manage/${slug}`);
    redirect(`/manage/${slug}`);
  } else {
    if (res.autoCode && !payload.code) {
      payload.code = slugifyCode(String(payload.name ?? ""));
    }
    let { data: created, error } = await supabase
      .from(res.table)
      .insert(payload)
      .select("id")
      .single();
    if (error && res.autoCode && (error as { code?: string }).code === "23505") {
      // `code` collided — retry once with a short random suffix.
      payload.code = `${slugifyCode(String(payload.name ?? ""))}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      ({ data: created, error } = await supabase
        .from(res.table)
        .insert(payload)
        .select("id")
        .single());
    }
    if (error) {
      console.error("[admin] resource insert failed", slug, error.message);
      return { error: t("err.server") };
    }
    const newId = (created as { id?: string } | null)?.id ?? null;
    // M5: best-effort audit trail (never fails the mutation — handled inside).
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.resource.create",
      targetTable: res.table,
      targetId: newId,
      metadata: { resource: slug, id: newId ?? undefined },
    });
    revalidatePath(`/manage/${slug}`);
    return null;
  }
}

export async function deleteRow(formData: FormData): Promise<void> {
  // L8: guard FIRST — panel access before any FormData is read; escalate to
  // admin once the registry flag is known (memoized context, no extra lookup).
  const ctx = await requirePanelAccess();
  const slug = String(formData.get("__slug") ?? "");
  const id = String(formData.get("__id") ?? "");
  const res = getResource(slug);
  if (!res || !id) return;
  if (res.adminOnly) await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from(res.table).delete().eq("id", id);

  if (!error) {
    // M5: best-effort audit trail (never fails the mutation — handled inside).
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.resource.delete",
      targetTable: res.table,
      targetId: id,
      metadata: { resource: slug, id },
      severity: "warning",
    });
  }

  revalidatePath(`/manage/${slug}`);
}
