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
  SITE_TYPOGRAPHY_KEY,
  TYPOGRAPHY_DEFAULTS,
  FONT_NAMES,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  STYLE_KEY_SUFFIX,
  styleKeyFor,
  FIELD_FONT_SIZE_OPTIONS,
  type SiteTypography,
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
  // Optional per-field font size (px) stored in the sibling `<key>#style` row;
  // null = default (no override).
  fontSize: number | null;
};

// Parses a `<key>#style` row's az payload ({"fontSize":24}) into a validated
// px size, or null. Tiny cap + try/catch: a corrupted row can never throw.
function parseStyleRow(az: string | null | undefined): number | null {
  if (typeof az !== "string" || !az || az.length > 200) return null;
  try {
    const parsed = JSON.parse(az) as { fontSize?: unknown };
    const n = Number(parsed?.fontSize);
    if (Number.isInteger(n) && n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX) return n;
    return null;
  } catch {
    return null;
  }
}

// Loads the curated content list, merging any saved overrides over the
// registry defaults. Always returns one item per registry entry, in registry
// order.
export async function listSiteContent(): Promise<SiteContentItem[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("site_content").select("key, az, en, ru");

  const rows = new Map<string, { key: string; az: string | null; en: string | null; ru: string | null }>();
  const styles = new Map<string, number>();
  for (const r of (data ?? []) as {
    key: string;
    az: string | null;
    en: string | null;
    ru: string | null;
  }[]) {
    if (r.key.endsWith(STYLE_KEY_SUFFIX)) {
      const size = parseStyleRow(r.az);
      if (size !== null) styles.set(r.key.slice(0, -STYLE_KEY_SUFFIX.length), size);
    } else {
      rows.set(r.key, r);
    }
  }

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
      fontSize: styles.get(entry.key) ?? null,
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

  // Optional per-field font size: "" = default (remove the style row); a value
  // must be one of the whitelisted select options (never a free number).
  const rawSize = String(formData.get("fontSize") ?? "").trim();
  const fontSize =
    rawSize === ""
      ? null
      : (FIELD_FONT_SIZE_OPTIONS as readonly number[]).includes(Number(rawSize))
        ? Number(rawSize)
        : undefined; // undefined = invalid → reject
  if (fontSize === undefined) return { error: "siteContent.err.server", key };

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

  // Sibling `<key>#style` row: carries the field's optional font size so the
  // TEXT columns stay plain strings (backward compatible with every existing
  // row/consumer). Default → delete the style row.
  const styleKey = styleKeyFor(key);
  const { error: styleErr } =
    fontSize === null
      ? await supabase.from("site_content").delete().eq("key", styleKey)
      : await supabase.from("site_content").upsert(
          {
            key: styleKey,
            group_key: entry.menu,
            section: entry.section,
            menu: entry.menu,
            az: JSON.stringify({ fontSize }),
            en: "",
            ru: "",
            updated_by: ctx.profileId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        );
  if (styleErr) {
    console.error("[admin] site_content style upsert failed", key, styleErr.message);
    return { error: "siteContent.err.server", key };
  }

  // Best-effort audit trail (small metadata only — never the bodies).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.site_content.update",
    targetTable: "site_content",
    metadata: { key, fontSize },
    severity: "info",
    success: true,
  });

  revalidatePath("/site-content");
  return { ok: true, key };
}

// =============================================================================
// Site typography ("Sayt şrifti") — sitewide font family + base sizes, stored
// as ONE system_settings row (`site.typography`). The web-app reads it via the
// service role; RLS keeps the table admin-only.
// =============================================================================

// Clamp a size into the allowed px range, falling back when not a number.
function clampSize(raw: unknown, fallback: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, n));
}

// Current typography setting (defaults when the row is missing/corrupted).
export async function loadSiteTypography(): Promise<SiteTypography> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_settings")
    .select("value_json")
    .eq("key", SITE_TYPOGRAPHY_KEY)
    .maybeSingle();

  const v = (data?.value_json ?? null) as Partial<SiteTypography> | null;
  if (!v || typeof v !== "object") return { ...TYPOGRAPHY_DEFAULTS };
  return {
    fontFamily: FONT_NAMES.includes(String(v.fontFamily))
      ? String(v.fontFamily)
      : TYPOGRAPHY_DEFAULTS.fontFamily,
    baseFontSize: clampSize(v.baseFontSize, TYPOGRAPHY_DEFAULTS.baseFontSize),
    headingFontSize: clampSize(v.headingFontSize, TYPOGRAPHY_DEFAULTS.headingFontSize),
    buttonFontSize: clampSize(v.buttonFontSize, TYPOGRAPHY_DEFAULTS.buttonFontSize),
  };
}

// Save the sitewide typography. Whitelist the font, clamp sizes 12–72 (client
// number inputs are UX only), upsert the single settings row, audit.
export async function saveSiteTypography(
  _prev: SiteContentState,
  formData: FormData,
): Promise<SiteContentState> {
  // Authorize FIRST — before reading any FormData.
  const ctx = await requireAdmin();

  const fontFamily = String(formData.get("fontFamily") ?? "").trim();
  if (!FONT_NAMES.includes(fontFamily)) {
    return { error: "siteContent.err.server", key: SITE_TYPOGRAPHY_KEY };
  }
  const value: SiteTypography = {
    fontFamily,
    baseFontSize: clampSize(formData.get("baseFontSize"), TYPOGRAPHY_DEFAULTS.baseFontSize),
    headingFontSize: clampSize(
      formData.get("headingFontSize"),
      TYPOGRAPHY_DEFAULTS.headingFontSize,
    ),
    buttonFontSize: clampSize(
      formData.get("buttonFontSize"),
      TYPOGRAPHY_DEFAULTS.buttonFontSize,
    ),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("system_settings").upsert(
    {
      key: SITE_TYPOGRAPHY_KEY,
      value_json: value,
      updated_by: ctx.profileId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) {
    console.error("[admin] site typography save failed", error.message);
    return { error: "siteContent.err.server", key: SITE_TYPOGRAPHY_KEY };
  }

  // Small metadata snapshot only (font name + three numbers — no bodies).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.site_content.typography_update",
    targetTable: "system_settings",
    metadata: { key: SITE_TYPOGRAPHY_KEY, ...value },
    severity: "info",
    success: true,
  });

  revalidatePath("/site-content");
  return { ok: true, key: SITE_TYPOGRAPHY_KEY };
}
