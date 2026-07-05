"use server";

// Website Content — Administrator-only, TEXT-ONLY CMS.
//
// `public.site_content` lets an admin override individual web-app i18n strings
// by `key` (the web-app reads the table via the service role and layers these
// on top of its built-in i18n). Writes go through the request-scoped
// (anon-key + cookies) client; RLS (site_content is admin-only) is the backstop.
// requireAdmin() runs FIRST on every action. Only keys present in the curated
// registry may ever be written from the panel.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  SITE_CONTENT_REGISTRY,
  SITE_CONTENT_BY_KEY,
} from "@/lib/admin/siteContentRegistry";

// Server-side cap per locale (defence-in-depth; the UI mirrors it).
const LOCALE_MAX = 2000;

export type SiteContentItem = {
  key: string;
  section: string;
  menu: string;
  multiline: boolean;
  // Text currently in effect: the saved override row if present, else the
  // registry defaults (the current live web-app text).
  current: { az: string; en: string; ru: string };
  // True when an override row exists (admin has replaced the default).
  isOverridden: boolean;
};

// Loads the curated content list, merging any saved overrides over the
// registry defaults. Always returns one item per registry entry, in registry
// order.
export async function listSiteContent(): Promise<SiteContentItem[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("site_content").select("key, az, en, ru");

  const rows = new Map(
    (
      (data ?? []) as {
        key: string;
        az: string | null;
        en: string | null;
        ru: string | null;
      }[]
    ).map((r) => [r.key, r]),
  );

  return SITE_CONTENT_REGISTRY.map((entry) => {
    const row = rows.get(entry.key);
    return {
      key: entry.key,
      section: entry.section,
      menu: entry.menu,
      multiline: !!entry.multiline,
      current: row
        ? { az: row.az ?? "", en: row.en ?? "", ru: row.ru ?? "" }
        : { ...entry.defaults },
      isOverridden: !!row,
    };
  });
}

// Mirrors the SettingState shape used by updateSetting so the client editor can
// drive it with useActionState and map error CODES to localized strings.
export type SiteContentState = { error?: string; ok?: boolean; key?: string } | null;

// Trim, then hard-cap a single locale value.
function clean(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, LOCALE_MAX);
}

// Upsert one content override row (az/en/ru) for a registry key.
export async function saveSiteContent(
  _prev: SiteContentState,
  formData: FormData,
): Promise<SiteContentState> {
  // Authorize FIRST — before reading any FormData.
  const ctx = await requireAdmin();

  const key = String(formData.get("__key") ?? "").trim();
  // Only curated keys may be written — a hand-crafted request cannot inject an
  // arbitrary i18n key into the table.
  const entry = SITE_CONTENT_BY_KEY[key];
  if (!entry) return { error: "siteContent.err.notFound", key };

  const az = clean(formData.get("az"));
  const en = clean(formData.get("en"));
  const ru = clean(formData.get("ru"));

  const supabase = await createClient();
  const { error } = await supabase.from("site_content").upsert(
    {
      key,
      group_key: entry.menu,
      section: entry.section,
      menu: entry.menu,
      az,
      en,
      ru,
      updated_by: ctx.profileId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) {
    // Never leak raw DB error text to the client — log detail, return a code.
    console.error("[admin] site_content upsert failed", key, error.message);
    return { error: "siteContent.err.server", key };
  }

  // Best-effort audit trail (small metadata only — never the bodies).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.site_content.update",
    targetTable: "site_content",
    metadata: { key },
    severity: "info",
    success: true,
  });

  revalidatePath("/site-content");
  return { ok: true, key };
}
