// React Query hooks for the parent surface. Read side only — every money /
// provisioning write goes through src/lib/api.ts (BFF) inside the screens.
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  fetchChildLeaderboardSummary,
  fetchChildSubscriptions,
  fetchChildren,
  fetchCities,
  fetchGrades,
  fetchOlympiadCatalog,
  fetchOlympiadPurchases,
  fetchParentFreeAccess,
  fetchSubjectsPricing,
  type ChildRow,
} from "@/lib/data";
import { groupPricing } from "./commerce";
import type { Locale } from "@/i18n";

// NAMING (web Round 21 parity): the `districts` table is the CITIES catalog
// (historic naming; School.district_id = the CITY). The intra-city rayon is
// `city_districts` / School.city_district_id / students.city_district_id.

export type CityDistrictRow = { id: string; name: string; city_id: string };

export type SchoolRow = {
  id: string;
  name: string;
  is_private: boolean | null;
  school_number: number | null;
  city_district_id: string | null;
};

/** All active rayons (public-read catalog); screens filter by the chosen city. */
async function fetchCityDistricts(): Promise<CityDistrictRow[]> {
  const { data, error } = await supabase
    .from("city_districts")
    .select("id, name, city_id")
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return (data ?? []) as CityDistrictRow[];
}

/** Schools of one city incl. their rayon — private first, then school number
 *  (web fetchSchools parity + the Round-21 city_district_id column). */
async function fetchSchoolsOfCity(cityId: string): Promise<SchoolRow[]> {
  const { data, error } = await supabase
    .from("schools")
    .select("id, name, is_private, school_number, city_district_id")
    .eq("district_id", cityId)
    .eq("status", "active")
    .order("is_private", { ascending: false })
    .order("school_number", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as SchoolRow[];
}

/** Real published pool counts per package (get_olympiad_pool_counts; a package
 *  with an empty pool returns NO row → the caller coalesces to 0). */
async function fetchOlympiadPoolCounts(packageIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (packageIds.length === 0) return counts;
  const { data, error } = await supabase.rpc("get_olympiad_pool_counts", {
    p_package_ids: packageIds,
  });
  if (error) throw error;
  for (const r of (data ?? []) as { package_id: string; question_count: number }[]) {
    counts.set(r.package_id, Number(r.question_count) || 0);
  }
  return counts;
}

export const QK = {
  children: ["parent", "children"] as const,
  freeAccess: ["parent", "free-access"] as const,
  pricing: ["parent", "subjects-pricing"] as const,
  subscriptions: ["parent", "subscriptions"] as const,
  catalog: (locale: Locale) => ["parent", "oly-catalog", locale] as const,
  purchases: ["parent", "oly-purchases"] as const,
  grades: ["catalog", "grades"] as const,
  cities: ["catalog", "cities"] as const,
  cityDistricts: ["catalog", "city-districts"] as const,
  schools: (cityId: string) => ["catalog", "schools", cityId] as const,
  poolCounts: (ids: string) => ["parent", "oly-pool-counts", ids] as const,
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

/** All active rayons (filtered per city by the caller — web wizard parity). */
export function useCityDistricts() {
  return useQuery({
    queryKey: QK.cityDistricts,
    queryFn: fetchCityDistricts,
    staleTime: 10 * 60_000,
  });
}

/** Schools of the selected city incl. rayon (cascade; disabled until a city
 *  is chosen). */
export function useSchools(cityId: string) {
  return useQuery({
    queryKey: QK.schools(cityId || "-"),
    queryFn: () => fetchSchoolsOfCity(cityId),
    enabled: cityId.length > 0,
    staleTime: 10 * 60_000,
  });
}

/** Real olympiad pool counts for the visible catalog (missing row = 0). */
export function useOlympiadPoolCounts(packageIds: string[]) {
  const key = [...packageIds].sort().join(",");
  return useQuery({
    queryKey: QK.poolCounts(key),
    queryFn: () => fetchOlympiadPoolCounts(key ? key.split(",") : []),
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
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
