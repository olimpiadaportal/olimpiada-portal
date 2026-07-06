// SERVER-ONLY feature-flag / system-setting reader.
//
// public.feature_flags and public.system_settings are admin-only under RLS, so
// the request-scoped (anon + cookie) client cannot read them from public / child
// pages. We therefore read them through the SERVICE-ROLE admin client, which
// bypasses RLS. These are read-only lookups (no writes), used purely to GATE
// already-public behavior:
//   - isFeatureEnabled('news_public')            -> show/hide the public news UI
//   - getSystemSetting('leaderboard.public_display_names') -> names vs anonymized
//
// Everything degrades to a SAFE fallback when the admin client is not configured
// or the row is missing, so gating never throws and never hides a working feature
// by accident.
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

// M25: the admin-edited public CHROME (site_content overrides, public site
// settings, locale settings, feature flags) used to be re-read from the DB on
// EVERY request. The fetchers below are wrapped in unstable_cache(revalidate:
// 60) so each key hits the DB at most once a minute. RULES: nothing cookie- or
// header-bound may run inside a cached function (locale resolution stays
// outside, in i18n/server), and MONEY GATES (payment mode, free-access) are
// deliberately NOT cached — they live in paymentMode.ts / freeAccess.ts.

/**
 * Returns whether a feature flag is enabled.
 *
 * Safe fallback = `true` (feature AVAILABLE): a missing flag row or an
 * unconfigured admin client must not hide features that work today. The gate
 * only closes when an explicit `enabled = false` row exists — i.e. when an
 * administrator has deliberately turned the feature off.
 */
const fetchFlagEnabled = unstable_cache(
  async (key: string): Promise<boolean> => {
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from("feature_flags")
        .select("enabled")
        .eq("key", key)
        .maybeSingle();
      if (error || !data) return true;
      return (data as { enabled: boolean | null }).enabled === true;
    } catch {
      return true;
    }
  },
  ["feature-flag-enabled"],
  { revalidate: 60 },
);

export async function isFeatureEnabled(key: string): Promise<boolean> {
  if (!isServiceRoleConfigured) return true;
  return fetchFlagEnabled(key);
}

/**
 * Returns the parsed `value_json` for a system setting, or `undefined` when the
 * setting is missing / unreadable. Callers decide their own safe default for an
 * `undefined` result (e.g. leaderboard anonymization defaults to privacy-safe).
 */
export async function getSystemSetting(key: string): Promise<any> {
  if (!isServiceRoleConfigured) return undefined;
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("system_settings")
      .select("value_json")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return undefined;
    return (data as { value_json: unknown }).value_json;
  } catch {
    return undefined;
  }
}

/**
 * Admin-managed TRILINGUAL site-text OVERRIDES (admin "Site Content & Design").
 * Reads every public.site_content row via the service-role client (the table is
 * admin-only under RLS) and returns a { key -> {az,en,ru} } map. Empty per-locale
 * strings mean "no override" and are dropped by the consumer (getT), so the app's
 * built-in i18n keeps working. ONE query per request (React cache). Safe fallback
 * = empty map (unconfigured/unreadable never breaks text rendering).
 */
export type ContentOverrides = Record<string, { az: string; en: string; ru: string }>;

const fetchContentOverrides = unstable_cache(
  async (): Promise<ContentOverrides> => {
    const out: ContentOverrides = {};
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from("site_content")
        .select("key, az, en, ru");
      if (error || !data) return out;
      for (const row of data as { key: string; az: string; en: string; ru: string }[]) {
        out[row.key] = {
          az: typeof row.az === "string" ? row.az : "",
          en: typeof row.en === "string" ? row.en : "",
          ru: typeof row.ru === "string" ? row.ru : "",
        };
      }
      return out;
    } catch {
      return out;
    }
  },
  ["site-content-overrides"],
  { revalidate: 60 },
);

export const getContentOverrides = cache(async (): Promise<ContentOverrides> => {
  if (!isServiceRoleConfigured) return {};
  return fetchContentOverrides();
});

// NOTE: any future email sender (receipts, expiry warnings, digests, …) must
// gate on isFeatureEnabled("notifications_email") before sending. Supabase
// Auth's own emails (verify / password reset) are security flows and are NOT
// gated. (The old canSendEmailNotifications wrapper was removed as dead code.)

/**
 * Public-site settings surfaced by the redesigned admin Settings (Round 6):
 * maintenance mode + trilingual message, support contact, social links.
 * ONE query per request (React cache). Every field has a safe fallback so an
 * unconfigured/missing row can never break rendering.
 */
export type PublicSiteSettings = {
  maintenanceMode: boolean;
  maintenanceMessage: Partial<Record<Locale, string>>;
  supportEmail: string;
  supportPhone: string;
  social: { facebook: string; instagram: string; youtube: string; tiktok: string };
};

const fetchPublicSiteSettings = unstable_cache(
  async (): Promise<PublicSiteSettings> => {
  const out: PublicSiteSettings = {
    maintenanceMode: false,
    maintenanceMessage: {},
    supportEmail: "",
    supportPhone: "",
    social: { facebook: "", instagram: "", youtube: "", tiktok: "" },
  };
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value_json")
      .in("key", [
        "platform.maintenance_mode",
        "platform.maintenance_message",
        "contact.support_email",
        "contact.support_phone",
        "social.facebook",
        "social.instagram",
        "social.youtube",
        "social.tiktok",
      ]);
    if (error || !data) return out;
    const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
    for (const row of data as { key: string; value_json: unknown }[]) {
      switch (row.key) {
        case "platform.maintenance_mode":
          out.maintenanceMode = row.value_json === true;
          break;
        case "platform.maintenance_message":
          if (row.value_json && typeof row.value_json === "object") {
            const m = row.value_json as Record<string, unknown>;
            for (const l of locales) {
              const v = str(m[l]);
              if (v) out.maintenanceMessage[l] = v;
            }
          }
          break;
        case "contact.support_email":
          out.supportEmail = str(row.value_json);
          break;
        case "contact.support_phone":
          out.supportPhone = str(row.value_json);
          break;
        case "social.facebook":
          out.social.facebook = str(row.value_json);
          break;
        case "social.instagram":
          out.social.instagram = str(row.value_json);
          break;
        case "social.youtube":
          out.social.youtube = str(row.value_json);
          break;
        case "social.tiktok":
          out.social.tiktok = str(row.value_json);
          break;
      }
    }
    return out;
  } catch {
    return out;
  }
  },
  ["public-site-settings"],
  { revalidate: 60 },
);

export const getPublicSiteSettings = cache(async (): Promise<PublicSiteSettings> => {
  if (!isServiceRoleConfigured) {
    return {
      maintenanceMode: false,
      maintenanceMessage: {},
      supportEmail: "",
      supportPhone: "",
      social: { facebook: "", instagram: "", youtube: "", tiktok: "" },
    };
  }
  return fetchPublicSiteSettings();
});

/**
 * Admin-controlled locale availability (Round 6): `platform.supported_locales`
 * (string array) decides which UI languages the web-app OFFERS, and
 * `platform.default_locale` which one is the fallback. Read in ONE query and
 * memoized per request with React cache() — getLocale()/getT() run in every
 * server component, so this must not multiply DB reads.
 *
 * Safe fallbacks: all locales / az. Guarantees: `enabled` is never empty and
 * always contains `fallback` (a misconfigured row can't brick the UI).
 */
const fetchLocaleSettings = unstable_cache(
  async (): Promise<{ enabled: Locale[]; fallback: Locale }> => {
    let enabled: Locale[] = [...locales];
    let fallback: Locale = defaultLocale;
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value_json")
        .in("key", ["platform.supported_locales", "platform.default_locale"]);
      if (!error && data) {
        for (const row of data as { key: string; value_json: unknown }[]) {
          if (row.key === "platform.supported_locales" && Array.isArray(row.value_json)) {
            const filtered = locales.filter((l) => (row.value_json as unknown[]).includes(l));
            if (filtered.length > 0) enabled = filtered;
          }
          if (
            row.key === "platform.default_locale" &&
            typeof row.value_json === "string" &&
            (locales as readonly string[]).includes(row.value_json)
          ) {
            fallback = row.value_json as Locale;
          }
        }
      }
    } catch {
      // keep fallbacks
    }
    if (!enabled.includes(fallback)) {
      fallback = enabled.includes(defaultLocale) ? defaultLocale : enabled[0];
    }
    return { enabled, fallback };
  },
  ["locale-settings"],
  { revalidate: 60 },
);

export const getLocaleSettings = cache(
  async (): Promise<{ enabled: Locale[]; fallback: Locale }> => {
    if (!isServiceRoleConfigured) {
      return { enabled: [...locales], fallback: defaultLocale };
    }
    return fetchLocaleSettings();
  },
);
