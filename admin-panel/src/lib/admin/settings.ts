"use server";

// Settings & feature flags — Administrator-only.
// All writes go through the request-scoped (anon-key + cookies) client; RLS is the
// backstop (system_settings / feature_flags are admin-only). requireAdmin() runs
// first. Only EXISTING rows are updated — these actions never insert new keys.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";

// Toggle a feature flag's `enabled` boolean. Plain form action (no return value).
export async function toggleFeatureFlag(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const key = String(formData.get("__key") ?? "").trim();
  const enabled = String(formData.get("__enabled") ?? "") === "true";
  if (!key) return;

  const supabase = await createClient();
  await supabase
    .from("feature_flags")
    .update({ enabled, updated_by: ctx.profileId, updated_at: new Date().toISOString() })
    .eq("key", key);

  revalidatePath("/settings");
}

export type SettingState = { error?: string; ok?: boolean; key?: string } | null;

// Update an existing system_settings row's value_json (parsed from a text field).
export async function updateSetting(
  _prev: SettingState,
  formData: FormData,
): Promise<SettingState> {
  const ctx = await requireAdmin();
  const key = String(formData.get("__key") ?? "").trim();
  const raw = String(formData.get("value_json") ?? "");
  if (!key) return { error: "settings.err.missing", key };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "settings.err.invalidJson", key };
  }

  const supabase = await createClient();

  // Only update an EXISTING row — never create a new setting from the UI.
  const { data: existing } = await supabase
    .from("system_settings")
    .select("key")
    .eq("key", key)
    .maybeSingle();
  if (!existing) return { error: "settings.err.notFound", key };

  const { error } = await supabase
    .from("system_settings")
    .update({ value_json: parsed, updated_by: ctx.profileId, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) return { error: error.message, key };

  revalidatePath("/settings");
  return { ok: true, key };
}
