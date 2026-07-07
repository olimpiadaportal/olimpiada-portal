"use server";

// Settings & feature flags — Administrator-only.
// All writes go through the request-scoped (anon-key + cookies) client; RLS is the
// backstop (system_settings / feature_flags are admin-only). requireAdmin() runs
// first. Only EXISTING rows are updated — these actions never insert new keys.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  SETTING_META,
  LOCALE_OPTIONS,
  type SettingEditorKind,
} from "@/lib/admin/settings-meta";
import { getT } from "@/i18n/server";

// Server-side caps (defence-in-depth): raw JSON text, short strings, long text.
const RAW_JSON_MAX = 20000;
const SHORT_STRING_MAX = 300;
const LONG_STRING_MAX = 5000;

// Validates the parsed value against the key's editor kind from SETTING_META so
// a hand-crafted request can never store an arbitrary JSON shape.
function isValidForKind(kind: SettingEditorKind, parsed: unknown): boolean {
  switch (kind) {
    case "boolean":
      return typeof parsed === "boolean";
    case "email":
      return (
        typeof parsed === "string" &&
        parsed.length <= SHORT_STRING_MAX &&
        (parsed === "" || parsed.includes("@")) // light format check
      );
    case "url":
      return (
        typeof parsed === "string" &&
        parsed.length <= SHORT_STRING_MAX &&
        (parsed === "" || /^https?:\/\//i.test(parsed)) // light format check
      );
    case "phone":
    case "text":
      return typeof parsed === "string" && parsed.length <= SHORT_STRING_MAX;
    case "textarea":
      return typeof parsed === "string" && parsed.length <= LONG_STRING_MAX;
    case "trilingual":
      return (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        Object.entries(parsed as Record<string, unknown>).every(
          ([loc, v]) =>
            (LOCALE_OPTIONS as readonly string[]).includes(loc) &&
            typeof v === "string" &&
            v.length <= LONG_STRING_MAX,
        )
      );
    case "locale":
      return (
        typeof parsed === "string" &&
        (LOCALE_OPTIONS as readonly string[]).includes(parsed)
      );
    case "locales":
      return (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(
          (v) =>
            typeof v === "string" &&
            (LOCALE_OPTIONS as readonly string[]).includes(v),
        )
      );
    case "number":
      return typeof parsed === "number" && Number.isFinite(parsed);
    default:
      return false;
  }
}

// Toggle a feature flag's `enabled` boolean. Plain form action (no return value).
export async function toggleFeatureFlag(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const key = String(formData.get("__key") ?? "").trim();
  const enabled = String(formData.get("__enabled") ?? "") === "true";
  if (!key) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("feature_flags")
    .update({ enabled, updated_by: ctx.profileId, updated_at: new Date().toISOString() })
    .eq("key", key);

  if (!error) {
    // Best-effort audit trail (never fails the mutation — handled inside).
    // feature_flags keys are text, not uuid → the key goes into metadata.
    await writeAuditLog({
      actorProfileId: ctx.profileId,
      action: "admin.settings.flag_toggle",
      targetTable: "feature_flags",
      metadata: { key, enabled },
    });
  }

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

  // Unknown key (not in SETTING_META) → reject: only keys the UI knows how to
  // render/validate may ever be written from the panel.
  const meta = SETTING_META[key];
  if (!meta) return { error: "settings.err.notFound", key };

  // Cap the raw JSON text before parsing.
  if (raw.length > RAW_JSON_MAX) {
    const t = await getT();
    return { error: t("err.tooLong"), key };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "settings.err.invalidJson", key };
  }

  // Shape validation against the key's editor kind (boolean/string/trilingual/…).
  if (!isValidForKind(meta.kind, parsed)) {
    return { error: "settings.err.invalidJson", key };
  }

  // Key-specific rule: the giveaway window length must be a whole number of
  // days within 1..730 (same bounds the DB enforces for admin grants). Rejects
  // fractions, zero, negatives and out-of-range values outright.
  if (
    key === "giveaway.duration_days" &&
    (!Number.isInteger(parsed) || (parsed as number) < 1 || (parsed as number) > 730)
  ) {
    return { error: "settings.err.invalidJson", key };
  }

  // Generic numeric range rule: any "number" setting with min/max bounds in
  // SETTING_META is hard-validated here (client min/max attributes are UX only).
  // Covers the leaderboard points-formula keys (per_correct 1..1000,
  // daily cap 0..100000, olympiad multiplier 0.1..10).
  if (meta.kind === "number") {
    const n = parsed as number; // isValidForKind already guaranteed finite number
    if (
      (meta.min !== undefined && n < meta.min) ||
      (meta.max !== undefined && n > meta.max)
    ) {
      return { error: "settings.err.invalidJson", key };
    }
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
  if (error) {
    console.error("[admin] setting update failed", key, error.message);
    const t = await getT();
    return { error: t("err.server"), key };
  }

  // Best-effort audit trail. system_settings keys are text, not uuid → the key
  // + a SMALL value snapshot go into metadata (strings capped in the helper).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.settings.update",
    targetTable: "system_settings",
    metadata: { key, value: raw },
  });

  revalidatePath("/settings");
  // The leaderboard points-formula keys are edited on /leaderboard, not on
  // /settings — refresh that page too so the saved values re-render there.
  if (key.startsWith("leaderboard.")) revalidatePath("/leaderboard");
  return { ok: true, key };
}

// -----------------------------------------------------------------------------
// Friendly presentation metadata (no persistence-shape changes).
//
// These maps let the UI show human names + descriptions and pick the right
// typed input for each known key. The typed editors assemble the exact JSON
// shape the DB stores and post it as `value_json` (there is no raw-JSON editor;
// keys absent from SETTING_META are simply not rendered). i18n keys are
// resolved in the page/components via t(); the raw keys/JSON shapes stored in
// the DB never change.
// -----------------------------------------------------------------------------

// Presentation metadata (FLAG_META / SETTING_META / LOCALE_OPTIONS + their types)
// lives in ./settings-meta.ts — a "use server" file may only export async
// functions, so those constant maps cannot be declared here.
