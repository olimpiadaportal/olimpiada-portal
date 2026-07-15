// Arena (student) data layer — React Query hooks over the child's OWN
// RLS-scoped reads and RPCs, mirroring web-app/src/app/child/page.tsx +
// child/layout.tsx server queries. No service keys, no BFF: every read runs
// under the child JWT. Money/purchase surfaces never exist here.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/features/auth/authStore";
import { useMobileConfig } from "@/lib/configQueries";
import { ARENA_PALETTES, type ArenaPalette } from "@/theme/tokens";

export const QK = {
  self: (id: string) => ["arena", "self", id] as const,
  freeAccess: ["arena", "free-access"] as const,
  subjects: (id: string) => ["arena", "subjects", id] as const,
  pricedSubjects: ["arena", "priced-subjects"] as const,
  attempts: (id: string) => ["arena", "attempts", id] as const,
  streak: ["arena", "streak"] as const,
  rank: ["arena", "lb-rank"] as const,
  rankAllTime: ["arena", "lb-rank-all-time"] as const,
};

const ARENA_STALE_MS = 60_000;

/** True only for a signed-in STUDENT session (all arena queries gate on it). */
function useStudentProfileId(): string | null {
  const profileId = useAuthStore((s) => s.profileId);
  const role = useAuthStore((s) => s.role);
  return role === "student" ? profileId : null;
}

// ---- students self row (name + access + palette) ----------------------------

export type StudentSelf = {
  firstName: string;
  accessStatus: string;
  /** Whitelisted light-mode palette (web data-palette parity); default otherwise. */
  palette: ArenaPalette;
};

async function fetchStudentSelf(profileId: string): Promise<StudentSelf> {
  const { data, error } = await supabase
    .from("students")
    .select("first_name, access_status, palette")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  const raw = (data?.palette ?? "") as string;
  const palette = (ARENA_PALETTES as string[]).includes(raw)
    ? (raw as ArenaPalette)
    : "default";
  return {
    firstName: (data?.first_name as string | null) ?? "",
    accessStatus: (data?.access_status as string | null) ?? "inactive",
    palette,
  };
}

export function useStudentSelf() {
  const profileId = useStudentProfileId();
  return useQuery({
    queryKey: QK.self(profileId ?? "-"),
    queryFn: () => fetchStudentSelf(profileId as string),
    enabled: !!profileId,
    staleTime: ARENA_STALE_MS,
  });
}

// ---- access gate (web ChildDashboard parity) ---------------------------------

/** Round 12 per-parent/child free-access window; safe fallback = inactive. */
async function fetchMyFreeAccessActive(): Promise<boolean> {
  const { data, error } = await supabase.rpc("my_free_access_active");
  if (error) return false;
  return data === true;
}

export type ArenaAccess = {
  loading: boolean;
  error: boolean;
  /** Global giveaway window (server-resolved payment mode — never client-computed). */
  giveawayActive: boolean;
  /** giveaway OR scheduled free-access window. */
  freeNow: boolean;
  accessStatus: string;
  hasAccess: boolean;
  /** Trilingual locked-state key (unknown statuses degrade to inactive, web parity). */
  lockedKey: string;
  firstName: string;
};

export function useArenaAccess(): ArenaAccess {
  const config = useMobileConfig();
  const self = useStudentSelf();
  const profileId = useStudentProfileId();
  const free = useQuery({
    queryKey: QK.freeAccess,
    queryFn: fetchMyFreeAccessActive,
    enabled: !!profileId,
    staleTime: ARENA_STALE_MS,
  });

  const giveawayActive = config.data?.payment.mode === "giveaway";
  const freeNow = giveawayActive || free.data === true;
  const accessStatus = self.data?.accessStatus ?? "inactive";
  const hasAccess = accessStatus === "trialing" || accessStatus === "active" || freeNow;
  const lockedKey = ["inactive", "locked", "expired"].includes(accessStatus)
    ? `child.locked.${accessStatus}`
    : "child.locked.inactive";

  return {
    loading: self.isPending || free.isPending || config.isPending,
    error: self.isError,
    giveawayActive,
    freeNow,
    accessStatus,
    hasAccess,
    lockedKey,
    firstName: self.data?.firstName ?? "",
  };
}

// ---- practicable subjects ------------------------------------------------------

export type ArenaSubject = { id: string; name: string };

async function fetchMySubjects(profileId: string): Promise<ArenaSubject[]> {
  const { data, error } = await supabase
    .from("child_subscriptions")
    .select("status, subscription_subjects(subjects(id, name))")
    .eq("student_profile_id", profileId)
    .in("status", ["trialing", "active"]);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const s of (data ?? []) as any[]) {
    for (const ss of s.subscription_subjects ?? []) {
      if (ss.subjects) map.set(ss.subjects.id, ss.subjects.name);
    }
  }
  return Array.from(map, ([id, name]) => ({ id, name }));
}

/** Free windows unlock every actively-priced subject (public pricing RLS). */
async function fetchPricedSubjects(): Promise<ArenaSubject[]> {
  const { data, error } = await supabase
    .from("subjects_pricing")
    .select("subjects(id, name)")
    .eq("status", "active");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as any[]) {
    if (row.subjects) map.set(row.subjects.id, row.subjects.name);
  }
  return Array.from(map, ([id, name]) => ({ id, name }));
}

export function useMySubjects() {
  const profileId = useStudentProfileId();
  return useQuery({
    queryKey: QK.subjects(profileId ?? "-"),
    queryFn: () => fetchMySubjects(profileId as string),
    enabled: !!profileId,
    staleTime: ARENA_STALE_MS,
  });
}

export function usePricedSubjects(enabled: boolean) {
  const profileId = useStudentProfileId();
  return useQuery({
    queryKey: QK.pricedSubjects,
    queryFn: fetchPricedSubjects,
    enabled: enabled && !!profileId,
    staleTime: ARENA_STALE_MS,
  });
}

/** Subscribed subjects merged with the free-window set (web subjMap parity). */
export function mergeSubjects(
  subscribed: ArenaSubject[] | undefined,
  priced: ArenaSubject[] | undefined,
): ArenaSubject[] {
  const map = new Map<string, string>();
  for (const s of subscribed ?? []) map.set(s.id, s.name);
  for (const s of priced ?? []) map.set(s.id, s.name);
  return Array.from(map, ([id, name]) => ({ id, name }));
}

// ---- graded attempts → ministats / strength / recents ---------------------------

export type ArenaAttempt = {
  id: string;
  kind: string;
  score: number | null;
  max_score: number | null;
  subject_id: string | null;
  subjects: { name: string } | null;
};

async function fetchMyAttempts(profileId: string): Promise<ArenaAttempt[]> {
  const { data, error } = await supabase
    .from("test_attempts")
    .select("id, kind, score, max_score, subject_id, subjects(name)")
    .eq("student_profile_id", profileId)
    .eq("status", "graded")
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as ArenaAttempt[];
}

export function useMyAttempts() {
  const profileId = useStudentProfileId();
  return useQuery({
    queryKey: QK.attempts(profileId ?? "-"),
    queryFn: () => fetchMyAttempts(profileId as string),
    enabled: !!profileId,
    staleTime: ARENA_STALE_MS,
  });
}

// ---- streak (leaderboard engine RPC) ---------------------------------------------

export type StreakStatus = {
  current: number;
  best: number;
  state: "active" | "at_risk" | "lost";
  hoursUntilLoss: number | null;
};

/** Never fabricates: any error/malformed payload → zeros (web parity). */
async function fetchStreakStatus(): Promise<StreakStatus> {
  const { data, error } = await supabase.rpc("get_streak_status");
  if (error || !data || typeof data !== "object") {
    return { current: 0, best: 0, state: "lost", hoursUntilLoss: null };
  }
  const o = data as Record<string, unknown>;
  return {
    current: Number(o.current ?? 0) || 0,
    best: Number(o.best ?? 0) || 0,
    state: o.state === "active" || o.state === "at_risk" ? o.state : "lost",
    hoursUntilLoss: typeof o.hours_until_loss === "number" ? o.hours_until_loss : null,
  };
}

export function useStreakStatus() {
  const profileId = useStudentProfileId();
  return useQuery({
    queryKey: QK.streak,
    queryFn: fetchStreakStatus,
    enabled: !!profileId,
    staleTime: ARENA_STALE_MS,
  });
}

// ---- leaderboard rank (global points; month for the quick-look card, all-time
// for the hero rank ring) ------------------------------------------------------------
// The child-scoped RPC (get_child_leaderboard_summary is parent/admin-only; a
// child session must use get_my_leaderboard_rank — same as the web child home).

export type MyLbRank = { rank: number | null; total: number; value: number };

async function fetchMyLeaderboardRank(period: "month" | "all_time"): Promise<MyLbRank | null> {
  const { data, error } = await supabase.rpc("get_my_leaderboard_rank", {
    p_board: "points",
    p_scope: "global",
    p_scope_id: null,
    p_period: period,
  });
  if (error || !data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  return {
    rank: typeof o.rank === "number" ? o.rank : null,
    total: Number(o.total ?? 0) || 0,
    value: Number(o.value ?? 0) || 0,
  };
}

export function useMyLeaderboardRank(enabled: boolean) {
  const profileId = useStudentProfileId();
  return useQuery({
    queryKey: QK.rank,
    queryFn: () => fetchMyLeaderboardRank("month"),
    enabled: enabled && !!profileId,
    staleTime: ARENA_STALE_MS,
  });
}

/** Hero rank panel: REAL global ALL-TIME points rank (Round-21 web parity —
 * read regardless of the leaderboard flag, exactly like the web dashboard). */
export function useMyAllTimeRank() {
  const profileId = useStudentProfileId();
  return useQuery({
    queryKey: QK.rankAllTime,
    queryFn: () => fetchMyLeaderboardRank("all_time"),
    enabled: !!profileId,
    staleTime: ARENA_STALE_MS,
  });
}

// ---- pull-to-refresh -----------------------------------------------------------------

/** Refetch everything the arena home shows (arena reads + news + config). */
export function useRefreshArena() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["arena"] }),
      qc.invalidateQueries({ queryKey: ["news"] }),
      qc.invalidateQueries({ queryKey: ["mobile-config"] }),
    ]);
  };
}
