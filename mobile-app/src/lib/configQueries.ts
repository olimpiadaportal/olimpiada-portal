// React Query hooks for the admin control plane: get_mobile_config() (flags/
// maintenance/version/payment mode) and get_mobile_content() (CMS text
// overrides). Both RPCs are anon-callable whitelist readers — the app never
// touches feature_flags/system_settings/site_content directly.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { isSupabaseConfigured } from "./env";
import { parseMobileConfig, type MobileConfig } from "./mobileConfig";
import type { Locale } from "@/i18n";

const CONFIG_STALE_MS = 5 * 60_000;

export function useMobileConfig() {
  return useQuery<MobileConfig>({
    queryKey: ["mobile-config"],
    enabled: isSupabaseConfigured,
    staleTime: CONFIG_STALE_MS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_mobile_config");
      if (error) throw error;
      return parseMobileConfig(data);
    },
  });
}

export function useContentOverrides(locale: Locale) {
  return useQuery<Record<string, string>>({
    queryKey: ["mobile-content", locale],
    enabled: isSupabaseConfigured,
    staleTime: CONFIG_STALE_MS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_mobile_content", {
        p_locale: locale,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if (typeof v === "string" && v.length > 0) out[k] = v;
      }
      return out;
    },
  });
}
