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
import { groupPricing, type SubjectOption } from "./commerce";
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

// Split out so `QK.entitled` can be built from the SAME array the invalidator
// passes to react-query. The nesting is load-bearing: invalidation is by key
// PREFIX, so useInvalidateParentData() — what the IAP panel calls the moment a
// purchase settles — already refetches every entitlement query without naming
// one. Inline the literal twice and the day someone renames the subscriptions
// key is the day a settled purchase stops reaching the screens.
const SUBSCRIPTIONS_KEY = ["parent", "subscriptions"] as const;

export const QK = {
  children: ["parent", "children"] as const,
  freeAccess: ["parent", "free-access"] as const,
  pricing: ["parent", "subjects-pricing"] as const,
  subscriptions: SUBSCRIPTIONS_KEY,
  entitled: (studentId: string) => [...SUBSCRIPTIONS_KEY, "entitled", studentId] as const,
  catalog: (locale: Locale, studentId: string | null) =>
    ["parent", "oly-catalog", locale, studentId] as const,
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

/** Round 40: CHILD-scoped catalog — keyed and fetched by the selected child's
 *  profile id, so switching chips refetches and shows ONLY that child's grade
 *  packages (my_question_count arrives per-child from the server). Stays
 *  disabled until a selection exists: no flash of the family union while the
 *  children list loads, and a childless parent never fetches at all. */
export function useOlympiadCatalog(
  locale: Locale,
  studentId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: QK.catalog(locale, studentId),
    queryFn: () => fetchOlympiadCatalog(locale, studentId ?? undefined),
    enabled: enabled && studentId !== null,
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

/**
 * The subjects one child holds a LIVE entitlement for (migration 168) —
 * whatever granted them: an Apple purchase, the web rail, a manual comp, a
 * school licence.
 *
 * THE WHOLE ROW IS KEPT, not just the id. The migration returns `code` and
 * `name` for exactly one reason: an entitlement is the ONLY trace an Apple
 * purchase leaves — it writes no `child_subscriptions` row and does not touch
 * `students.access_status` — so those two fields are the only thing a screen
 * can say a family who has just paid now HAS. Reducing the rows to ids is why
 * the offer disappeared and nothing took its place.
 *
 * child_entitled_subjects, NEVER my_accessible_subjects, and both reasons are
 * fatal here:
 *   1. my_accessible_subjects() is caller-scoped to current_profile_id(), which
 *      on a PARENT screen is the parent — it would answer about the wrong
 *      person entirely.
 *   2. It counts the giveaway window and the admin free-access interval as
 *      access, so while a promo runs it calls every subject accessible. Feeding
 *      that into the offer filter would hide all 21 products and leave a store
 *      reviewer with no purchase button — the Guideline 3.1.1 failure this rail
 *      exists to answer. Borrowed access is not ownership: it must neither
 *      suppress an offer nor be reported back as something the family owns.
 *
 * Safe fallback = EMPTY, the OPPOSITE of the usual gate posture and deliberate:
 * an empty list OFFERS the product. Hiding a purchase because an RPC hiccuped
 * costs a family the thing they came for; offering one they already hold costs
 * a refusal they can read. On the Home card the same empty list simply falls
 * back to `students.access_status`, i.e. to yesterday's pill.
 *
 * ONE reader for all three callers (the two purchase screens and the Home
 * cards): the parse and the failure posture above are the contract, and a
 * second copy is a second set of bugs.
 */
export async function fetchEntitledSubjects(
  studentProfileId: string,
): Promise<SubjectOption[]> {
  const { data, error } = await supabase.rpc("child_entitled_subjects", {
    p_student: studentProfileId,
  });
  if (error || !Array.isArray(data)) return [];
  // A jsonb array of { id, code, name }. Rows are FILTERED rather than cast: a
  // malformed one must neither hide an offer nor render as "undefined" under a
  // child's name. A missing code/name is survivable — subjectLabel() falls back
  // through the raw DB name to a dash — while a missing id is not, because it is
  // what the offer filter matches on.
  return (data as Record<string, unknown>[])
    .filter((row) => typeof row?.id === "string" && row.id !== "")
    .map((row) => ({
      id: row.id as string,
      code: typeof row.code === "string" ? row.code : null,
      name: typeof row.name === "string" ? row.name : "",
    }));
}

/**
 * Live entitlements for EVERY child on one screen — the Home cards' input,
 * returned positionally so the caller can zip it against its own list, exactly
 * like useLeaderboardSummaries above.
 *
 * ONE CALL PER CHILD, DELIBERATELY, and it is not a hidden N+1:
 *   - child_entitled_subjects(uuid) takes a single student. The only batched
 *     alternative available without a new migration is selecting
 *     `public.entitlements` straight from the client and re-implementing the
 *     "live" predicate here — scope, source <> 'trial', revoked_at, starts_at,
 *     ends_at. That predicate is copied verbatim from has_subject_access() in
 *     the migration precisely so the two can never disagree; a third copy in
 *     TypeScript would compare `ends_at` against the DEVICE clock, so a phone
 *     with a skewed date would decide for itself whether a family has access.
 *   - The per-child key is what makes the read nearly free in practice: the two
 *     purchase screens query the SAME key, so arriving back on Home from a
 *     settled purchase reuses the entitlement react-query just refetched
 *     instead of issuing anything at all.
 * Families have single-digit numbers of children, and the queries are handed to
 * usePullRefresh like every other source on the screen.
 *
 * NOT platform-gated. The purchase screens read this only for the iOS offer
 * filter and disable it elsewhere; the Home pill is a different question —
 * "what does this child hold" — and an entitlement-only grant (admin comp,
 * school licence) is just as invisible to `students.access_status` on Android.
 */
export function useEntitledSubjectsByChild(
  children: ChildRow[] | undefined,
  enabled = true,
) {
  return useQueries({
    queries: (children ?? []).map((c) => ({
      queryKey: QK.entitled(c.profile_id),
      queryFn: () => fetchEntitledSubjects(c.profile_id),
      enabled,
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
