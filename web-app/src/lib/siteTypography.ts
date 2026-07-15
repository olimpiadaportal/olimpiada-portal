// SERVER-ONLY reader for the admin-managed site typography (owner item 16).
//
// The admin panel's Website Content module ("Sayt şrifti") writes ONE
// system_settings row — `site.typography`:
//   {"fontFamily":"Mulish","baseFontSize":16,"headingFontSize":32,"buttonFontSize":15}
// This module reads it via the service-role client (the table is admin-only
// under RLS) with the same 60s unstable_cache policy as the other chrome
// settings in flags.ts.
//
// DRIFT WARNING: the font whitelist + safe stack MIRROR
// admin-panel/src/lib/admin/siteContentRegistry.ts — update both together.
//
// SAFE DEFAULT: `null` when the setting is missing/unreadable/unconfigured —
// the root layout then injects NOTHING, so the site renders exactly as today
// (global Arial stack from globals.css) until an admin opts in.
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export const SITE_TYPOGRAPHY_KEY = "site.typography";

export type SiteTypography = {
  fontFamily: string;
  baseFontSize: number;
  headingFontSize: number;
  buttonFontSize: number;
};

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 72;

// The Azerbaijani-safe stack every chosen family falls back to (ə Ə ğ Ğ ş Ş
// ç Ç ü Ü ö Ö ı İ always render even if the webfont fails or lacks a glyph).
export const SAFE_FONT_STACK =
  'Arial, Helvetica, "Segoe UI", system-ui, sans-serif';

// Curated library (Google-hosted families; Arial is the system default).
const GOOGLE_FONTS = new Set([
  "Mulish",
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Poppins",
  "Nunito",
  "Montserrat",
  "Source Sans 3",
  "Ubuntu",
  "Work Sans",
  "DM Sans",
  "Noto Sans",
  "Manrope",
  "Rubik",
  "Fira Sans",
  "IBM Plex Sans",
  "Quicksand",
  "Raleway",
]);

const FONT_WHITELIST = new Set(["Arial", ...GOOGLE_FONTS]);

function clampSize(raw: unknown): number | null {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return null;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, n));
}

/** Full CSS font-family value: chosen family + the safe fallback stack. */
export function fontStackFor(name: string): string {
  return name === "Arial" ? SAFE_FONT_STACK : `"${name}", ${SAFE_FONT_STACK}`;
}

/**
 * Google Fonts stylesheet URL for THE SELECTED font only (display=swap), or
 * null for Arial/system (nothing to load). The CSP already allows
 * fonts.googleapis.com (style-src) + fonts.gstatic.com (font-src).
 */
export function googleFontHref(name: string): string | null {
  if (!GOOGLE_FONTS.has(name)) return null;
  const fam = name.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@400;500;600;700&display=swap`;
}

const fetchSiteTypography = unstable_cache(
  async (): Promise<SiteTypography | null> => {
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from("system_settings")
        .select("value_json")
        .eq("key", SITE_TYPOGRAPHY_KEY)
        .maybeSingle();
      if (error || !data) return null;
      const v = (data as { value_json: unknown }).value_json as
        | Partial<SiteTypography>
        | null;
      if (!v || typeof v !== "object") return null;
      const fontFamily = String(v.fontFamily ?? "");
      if (!FONT_WHITELIST.has(fontFamily)) return null;
      return {
        fontFamily,
        baseFontSize: clampSize(v.baseFontSize) ?? 16,
        headingFontSize: clampSize(v.headingFontSize) ?? 32,
        buttonFontSize: clampSize(v.buttonFontSize) ?? 15,
      };
    } catch {
      return null;
    }
  },
  ["site-typography"],
  { revalidate: 60 },
);

/** Admin typography, or null when unconfigured (→ render exactly as today). */
export const getSiteTypography = cache(
  async (): Promise<SiteTypography | null> => {
    if (!isServiceRoleConfigured) return null;
    return fetchSiteTypography();
  },
);
