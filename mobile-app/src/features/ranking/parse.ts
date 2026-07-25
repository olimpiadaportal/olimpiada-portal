// Pure payload mappers + row/rank types for the percentage leaderboard
// (Round 36, migration 081). Kept free of the supabase import so jest can
// exercise them directly. The server is authoritative: ranked rows come first
// with COMPETITION ranks (ties share 1,2,2,2,6,…), then provisional rows with
// rank=null — never re-sort client-side, never derive rank from a rounded
// value.

/** get_leaderboard row: value = UNROUNDED percentage (0..100) on the percent
 * board, days on the streak board. */
export type LbRow = {
  rank: number | null;
  display_name: string;
  city: string | null;
  district: string | null;
  school: string | null;
  grade_level: number | null;
  value: number;
  is_self: boolean;
  is_provisional: boolean;
  questions: number;
  correct: number;
  attempts: number;
};

/** get_my_leaderboard_rank / get_child_leaderboard_position jsonb — rank is
 * null when provisional or absent; total counts RANKED students only. */
export type MyRank = {
  rank: number | null;
  total: number;
  value: number;
  is_provisional: boolean;
  questions: number;
  attempts: number;
  min_attempts: number;
};

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Defensive normalization of a rank payload; any malformed field → safe zero. */
export function parseRankPayload(data: unknown): MyRank {
  const o = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    rank: typeof o.rank === "number" ? o.rank : null,
    total: toNum(o.total),
    value: toNum(o.value),
    is_provisional: o.is_provisional === true,
    questions: toNum(o.questions),
    attempts: toNum(o.attempts),
    min_attempts: toNum(o.min_attempts),
  };
}

/** Board rows normalized IN SERVER ORDER (no client re-sorting). */
export function parseLbRows(data: unknown): LbRow[] {
  return (Array.isArray(data) ? data : []).map((raw) => {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      rank: typeof o.rank === "number" ? o.rank : null,
      display_name: toStr(o.display_name) ?? "",
      city: toStr(o.city),
      district: toStr(o.district),
      school: toStr(o.school),
      grade_level: typeof o.grade_level === "number" ? o.grade_level : null,
      value: toNum(o.value),
      is_self: o.is_self === true,
      is_provisional: o.is_provisional === true,
      questions: toNum(o.questions),
      correct: toNum(o.correct),
      attempts: toNum(o.attempts),
    };
  });
}
