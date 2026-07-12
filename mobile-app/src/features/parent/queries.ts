// React Query hooks for the parent surface. Read side only — every money /
// provisioning write goes through src/lib/api.ts (BFF) inside the screens.
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchChildLeaderboardSummary,
  fetchChildSubscriptions,
  fetchChildren,
  fetchCities,
  fetchGrades,
  fetchOlympiadCatalog,
  fetchOlympiadPurchases,
  fetchParentFreeAccess,
  fetchSchools,
  fetchSubjectsPricing,
  type ChildRow,
} from "@/lib/data";
import { groupPricing } from "./commerce";
import type { Locale } from "@/i18n";

export const QK = {
  children: ["parent", "children"] as const,
  freeAccess: ["parent", "free-access"] as const,
  pricing: ["parent", "subjects-pricing"] as const,
  subscriptions: ["parent", "subscriptions"] as const,
  catalog: (locale: Locale) => ["parent", "oly-catalog", locale] as const,
  purchases: ["parent", "oly-purchases"] as const,
  grades: ["catalog", "grades"] as const,
  cities: ["catalog", "cities"] as const,
  schools: (cityId: string) => ["catalog", "schools", cityId] as const,
  leaderboard: (studentId: string) => ["parent", "lb", studentId] as const,
};

export function useChildren() {
  return useQuery({ queryKey: QK.children, queryFn: fetchChildren });
}

export function useParentFreeAccess() {
  return useQuery({ queryKey: QK.freeAccess, queryFn: fetchParentFreeAccess });
}

/** Per-subject pricing grouped to one option per subject. */
export function useSubjectOptions() {
  return useQuery({
    queryKey: QK.pricing,
    queryFn: async () => groupPricing(await fetchSubjectsPricing()),
  });
}

export function useChildSubscriptions() {
  return useQuery({ queryKey: QK.subscriptions, queryFn: fetchChildSubscriptions });
}

export function useOlympiadCatalog(locale: Locale, enabled = true) {
  return useQuery({
    queryKey: QK.catalog(locale),
    queryFn: () => fetchOlympiadCatalog(locale),
    enabled,
  });
}

export function useOlympiadPurchases(enabled = true) {
  return useQuery({ queryKey: QK.purchases, queryFn: fetchOlympiadPurchases, enabled });
}

export function useGrades() {
  return useQuery({ queryKey: QK.grades, queryFn: fetchGrades, staleTime: 10 * 60_000 });
}

export function useCities() {
  return useQuery({ queryKey: QK.cities, queryFn: fetchCities, staleTime: 10 * 60_000 });
}

/** Schools of the selected city (cascade; disabled until a city is chosen). */
export function useSchools(cityId: string) {
  return useQuery({
    queryKey: QK.schools(cityId || "-"),
    queryFn: () => fetchSchools(cityId),
    enabled: cityId.length > 0,
    staleTime: 10 * 60_000,
  });
}

/** One leaderboard summary per child (flag-gated by the caller). */
export function useLeaderboardSummaries(children: ChildRow[] | undefined, enabled: boolean) {
  return useQueries({
    queries: (children ?? []).map((c) => ({
      queryKey: QK.leaderboard(c.profile_id),
      queryFn: () => fetchChildLeaderboardSummary(c.profile_id),
      enabled,
      staleTime: 5 * 60_000,
    })),
  });
}

/** Invalidate everything a successful money/provisioning write can change. */
export function useInvalidateParentData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: QK.children });
    void qc.invalidateQueries({ queryKey: QK.subscriptions });
    void qc.invalidateQueries({ queryKey: QK.purchases });
    void qc.invalidateQueries({ queryKey: QK.freeAccess });
  };
}
