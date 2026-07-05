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
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

/**
 * Returns whether a feature flag is enabled.
 *
 * Safe fallback = `true` (feature AVAILABLE): a missing flag row or an
 * unconfigured admin client must not hide features that work today. The gate
 * only closes when an explicit `enabled = false` row exists — i.e. when an
 * administrator has deliberately turned the feature off.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  if (!isServiceRoleConfigured) return true;
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

export const getContentOverrides = cache(async (): Promise<ContentOverrides> => {
  const out: ContentOverrides = {};
  if (!isServiceRoleConfigured) return out;
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
});

/**
 * Gate for OUTBOUND email notifications (admin Settings → notifications_email).
 * Nothing in the app sends email today — Supabase Auth's own emails (verify /
 * password reset) are sent by Supabase and are deliberately NOT gated here:
 * they are security flows, not notifications. Any future email sender
 * (subscription receipts, expiry warnings, news digests, …) MUST call this
 * first and skip sending when it returns false.
 */
export async function canSendEmailNotifications(): Promise<boolean> {
  return isFeatureEnabled("notifications_email");
}

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

export const getPublicSiteSettings = cache(async (): Promise<PublicSiteSettings> => {
  const out: PublicSiteSettings = {
    maintenanceMode: false,
    maintenanceMessage: {},
    supportEmail: "",
    supportPhone: "",
    social: { facebook: "", instagram: "", youtube: "", tiktok: "" },
  };
  if (!isServiceRoleConfigured) return out;
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
export const getLocaleSettings = cache(
  async (): Promise<{ enabled: Locale[]; fallback: Locale }> => {
    let enabled: Locale[] = [...locales];
    let fallback: Locale = defaultLocale;
    if (isServiceRoleConfigured) {
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
    }
    if (!enabled.includes(fallback)) {
      fallback = enabled.includes(defaultLocale) ? defaultLocale : enabled[0];
    }
    return { enabled, fallback };
  },
);
