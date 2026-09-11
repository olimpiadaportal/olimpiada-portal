// React Query hooks for the admin control plane: get_mobile_config() (flags/
// maintenance/version/payment mode), get_mobile_content() (CMS text overrides)
// and the admin-managed subject display names. Both RPCs are anon-callable
// whitelist readers — the app never touches feature_flags/system_settings/
// site_content directly. The subject names are the exception and deliberately
// so: subjects/subject_translations are PUBLIC-READ tables, so that hook reads
// them directly (see its own comment).
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { isSupabaseConfigured } from "./env";
import { parseMobileConfig, type MobileConfig } from "./mobileConfig";
import type { Locale } from "@/i18n";
import {
  SUBJECT_NAMES_SELECT,
  buildSubjectNameDict,
  type SubjectNameRow,
} from "./subjectNames";

const CONFIG_STALE_MS = 5 * 60_000;
// M3.1 maintenance cadence (web ≤5s splash-poll parity, adapted to mobile):
// while the app is FOREGROUNDED the config refetches every 30s so an admin
// maintenance flip is noticed without a re-foreground; while the maintenance
// gate is actually up (maintenance.on) it polls every 5s so the app exits
// maintenance promptly when the admin turns it off. The interval is fully
// disabled while the app is backgrounded (AppState gate below +
// refetchIntervalInBackground:false); the boot fetch and the RootGate
// foreground invalidation are unchanged.
const ACTIVE_POLL_MS = 30_000;
const MAINTENANCE_POLL_MS = 5_000;

// Shared AppState mirror (one RN listener per subscriber, no re-render churn):
// the refetch interval only runs while the app is active.
function subscribeAppState(onChange: () => void): () => void {
  const sub = AppState.addEventListener("change", onChange);
  return () => sub.remove();
}
function isAppActive(): boolean {
  return AppState.currentState === "active";
}

export function useMobileConfig() {
  const appActive = useSyncExternalStore(subscribeAppState, isAppActive);
  return useQuery<MobileConfig>({
    queryKey: ["mobile-config"],
    enabled: isSupabaseConfigured,
    staleTime: CONFIG_STALE_MS,
    // Foreground-only cadence: maintenance-on → 5s, otherwise 30s (see above).
    refetchInterval: appActive
      ? (query) =>
          query.state.data?.maintenance.on ? MAINTENANCE_POLL_MS : ACTIVE_POLL_MS
      : false,
    refetchIntervalInBackground: false,
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

/**
 * ADMIN-MANAGED SUBJECT DISPLAY NAMES for the current locale (migration 171),
 * shaped as the `subj.db.<code>` dictionary entries subjectLabel() reads
 * BEFORE the shipped catalog. This is what makes a rename in the admin panel
 * reach the app; before it existed the bundled catalog won and the rename was
 * invisible on every screen.
 *
 * Read straight off the tables rather than through an RPC, unlike its two
 * neighbours above: `subjects` and `subject_translations` are PUBLIC-READ under
 * RLS (the same posture the anonymous /subjects and olympiad-catalog surfaces
 * rely on), so there is no privileged row to whitelist and no reason for a
 * function to exist.
 *
 * A failure resolves to `undefined` data, which useT() turns into an empty
 * layer — the bundled az/en/ru catalog then renders exactly as it does today.
 * That is the required behaviour for a binary that is already in testers'
 * hands when the migration has not been applied yet.
 */
export function useSubjectNames(locale: Locale) {
  return useQuery<Record<string, string>>({
    queryKey: ["subject-names", locale],
    enabled: isSupabaseConfigured,
    staleTime: CONFIG_STALE_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select(SUBJECT_NAMES_SELECT);
      if (error) throw error;
      return buildSubjectNameDict(
        (data ?? []) as unknown as SubjectNameRow[],
        locale,
      );
    },
  });
}
