// Student leaderboard data — the live DB engine through the child's OWN
// authenticated client (SECURITY DEFINER RPCs, migrations 039/048; NOT service
// role). The client only ever sends whitelist-validated enums + ids the child
// actually has — never free-form strings — mirroring the web page contract.
import { supabase } from "@/lib/supabase";

export type Board = "points" | "streak";
export type Scope = "global" | "subject" | "grade" | "city" | "school";
export type PeriodUrl = "month" | "all";

/** get_leaderboard row (migration 048): server-formatted "Firstname L." +
 * city/school/grade context. Render as-is — NEVER re-derive names locally. */
export type LbRow = {
  rank: number;
  display_name: string;
  city: string | null;
  school: string | null;
  grade_level: number | null;
  value: number;
  is_self: boolean;
};

export type MyRank = { rank: number | null; total: number; value: number };

export type StreakStatus = {
  current: number;
  best: number;
  state: "active" | "at_risk" | "lost";
  hours_until_loss: number | null;
};

/** The child's own scope ids (grade/city/school tabs exist only when set). */
export type ScopeIds = {
  gradeId: string | null;
  cityId: string | null;
  schoolId: string | null;
};

export async function fetchScopeIds(profileId: string): Promise<ScopeIds> {
  const { data, error } = await supabase
    .from("students")
    .select("grade_id, district_id, school_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  const s = (data ?? {}) as {
    grade_id?: string | null;
    district_id?: string | null;
    school_id?: string | null;
  };
  return {
    gradeId: s.grade_id ?? null,
    cityId: s.district_id ?? null,
    schoolId: s.school_id ?? null,
  };
}

export type LbArgs = {
  board: Board;
  scope: Scope;
  scopeId: string | null;
  /** 'month' | 'all_time' (already translated from the UI period). */
  period: "month" | "all_time";
};

export async function fetchLeaderboard(args: LbArgs): Promise<LbRow[]> {
  const { data, error } = await supabase.rpc("get_leaderboard", {
    p_board: args.board,
    p_scope: args.scope,
    p_scope_id: args.scopeId,
    p_period: args.period,
    p_limit: 50,
  });
  if (error) throw error;
  return (data ?? []) as LbRow[];
}

export async function fetchMyRank(args: LbArgs): Promise<MyRank> {
  const { data, error } = await supabase.rpc("get_my_leaderboard_rank", {
    p_board: args.board,
    p_scope: args.scope,
    p_scope_id: args.scopeId,
    p_period: args.period,
  });
  if (error) throw error;
  const o = (data ?? {}) as Record<string, unknown>;
  return {
    rank: typeof o.rank === "number" ? o.rank : null,
    total: typeof o.total === "number" ? o.total : 0,
    value: typeof o.value === "number" ? o.value : 0,
  };
}

export async function fetchStreakStatus(): Promise<StreakStatus | null> {
  const { data, error } = await supabase.rpc("get_streak_status");
  if (error) return null;
  const o = (data ?? null) as Record<string, unknown> | null;
  if (!o) return null;
  const state = o.state === "active" || o.state === "at_risk" || o.state === "lost" ? o.state : "lost";
  return {
    current: typeof o.current === "number" ? o.current : 0,
    best: typeof o.best === "number" ? o.best : 0,
    state,
    hours_until_loss: typeof o.hours_until_loss === "number" ? o.hours_until_loss : null,
  };
}
