"use server";

// Mobile app version gate — Administrator-only. Edits the two seeded
// mobile_app_versions rows (ios/android) that the anon RPC get_mobile_config()
// serves to the mobile app. Writes go through the request-scoped session
// client; RLS (mobile_app_versions_admin) is the backstop. requireAdmin()
// runs first in every action.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";

export type MobileVersionRow = {
  id: string;
  platform: "ios" | "android";
  min_version: string;
  latest_version: string;
  force_update: boolean;
  store_url: string;
  message_az: string;
  message_en: string;
  message_ru: string;
  updated_at: string;
};

export type MobileVersionState =
  | { ok?: boolean; error?: string; platform?: string }
  | null;

// Server-side caps (mirror the DB checks; client attributes are UX only).
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const VERSION_MAX = 20;
const STORE_URL_MAX = 300;
const MESSAGE_MAX = 500;

const EDITABLE_FIELDS = [
  "min_version",
  "latest_version",
  "force_update",
  "store_url",
  "message_az",
  "message_en",
  "message_ru",
] as const;

export async function listMobileVersions(): Promise<MobileVersionRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("mobile_app_versions")
    .select(
      "id, platform, min_version, latest_version, force_update, store_url, message_az, message_en, message_ru, updated_at",
    )
    .order("platform");
  return (data ?? []) as MobileVersionRow[];
}

export async function updateMobileVersion(
  _prev: MobileVersionState,
  formData: FormData,
): Promise<MobileVersionState> {
  const ctx = await requireAdmin();

  const platform = String(formData.get("platform") ?? "");
  if (platform !== "ios" && platform !== "android") {
    return { error: "mobileapp.err.server" };
  }

  const minVersion = String(formData.get("min_version") ?? "").trim();
  const latestVersion = String(formData.get("latest_version") ?? "").trim();
  if (
    minVersion.length > VERSION_MAX ||
    latestVersion.length > VERSION_MAX ||
    !SEMVER_RE.test(minVersion) ||
    !SEMVER_RE.test(latestVersion)
  ) {
    return { error: "mobileapp.err.semver", platform };
  }

  const forceUpdate = formData.get("force_update") === "on";

  const storeUrl = String(formData.get("store_url") ?? "").trim();
  if (storeUrl.length > STORE_URL_MAX) {
    return { error: "mobileapp.err.length", platform };
  }
  if (storeUrl !== "" && !storeUrl.startsWith("https://")) {
    return { error: "mobileapp.err.url", platform };
  }

  const messageAz = String(formData.get("message_az") ?? "").trim();
  const messageEn = String(formData.get("message_en") ?? "").trim();
  const messageRu = String(formData.get("message_ru") ?? "").trim();
  if ([messageAz, messageEn, messageRu].some((m) => m.length > MESSAGE_MAX)) {
    return { error: "mobileapp.err.length", platform };
  }

  const payload = {
    min_version: minVersion,
    latest_version: latestVersion,
    force_update: forceUpdate,
    store_url: storeUrl,
    message_az: messageAz,
    message_en: messageEn,
    message_ru: messageRu,
  };

  const supabase = await createClient();

  // Only the two seeded rows are ever updated — never insert from the panel.
  const { data: existing } = await supabase
    .from("mobile_app_versions")
    .select(
      "id, min_version, latest_version, force_update, store_url, message_az, message_en, message_ru",
    )
    .eq("platform", platform)
    .maybeSingle();
  if (!existing) return { error: "mobileapp.err.server", platform };

  const changed = EDITABLE_FIELDS.filter(
    (f) => (existing as Record<string, unknown>)[f] !== payload[f],
  );
  if (changed.length === 0) return { ok: true, platform };

  const { error } = await supabase
    .from("mobile_app_versions")
    .update({
      ...payload,
      updated_by: ctx.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("platform", platform);
  if (error) {
    // Never return raw DB error text to the client — generic code only.
    console.error("[admin] mobile version update failed", platform, error.message);
    return { error: "mobileapp.err.server", platform };
  }

  // Best-effort audit trail: platform + changed field names only, never bodies.
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.mobile_version.update",
    targetTable: "mobile_app_versions",
    targetId: existing.id,
    metadata: { platform, fields: changed.join(",") },
  });

  revalidatePath("/mobile-app");
  return { ok: true, platform };
}
