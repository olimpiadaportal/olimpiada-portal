// Pure helpers + payload types for the parent analytics dashboard. Mirrors
// web-app/src/components/AnalyticsDashboard.tsx exactly where it matters:
// Round-18 rules are baked in — totals carry answered/correct/wrong/skipped
// SEPARATELY (wrong is answered-and-incorrect ONLY, never questions-correct),
// accuracy is answered-based and a null renders as 0%, and per_topic rows
// arrive already filtered to answered>0 server-side.

/** get_child_subject_dashboard → jsonb payload (defensive-optional). */
export type DashPayload = {
  totals?: {
    attempts?: number | null;
    questions?: number | null;
    answered?: number | null;
    correct?: number | null;
    wrong?: number | null;
    skipped?: number | null;
    accuracy?: number | null;
  } | null;
  time_spent_minutes?: number | null;
  last_activity?: string | null;
  weekly_activity?: { date: string; attempts: number }[] | null;
  accuracy_trend?: { date: string; accuracy: number | null }[] | null;
  per_topic?:
    | {
        topic_id: string;
        topic: string;
        answered: number;
        correct: number;
        wrong: number;
        skipped: number;
        accuracy: number | null;
      }[]
    | null;
  mistakes?:
    | {
        topic: string;
        subtopic: string;
        wrong: number;
        accuracy: number | null;
      }[]
    | null;
};

/** get_child_leaderboard_summary payload (defensive-optional). */
export type LbSummary = {
  points_month?: number | null;
  points_all_time?: number | null;
  current_streak?: number | null;
  best_streak?: number | null;
  rank_month?: number | null;
  total_month?: number | null;
  rank_all_time?: number | null;
};

/** Best/weakest topic need a minimum ANSWERED sample before they mean anything. */
export const MIN_TOPIC_SAMPLE = 3;

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** dd.mm.yyyy from an ISO date/timestamp string (deterministic, no locale APIs). */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}.${m}.${y}`;
}

/** dd.mm short label for chart axes. */
export function fmtDayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return m && d ? `${d}.${m}` : "";
}

/** Weekday dict key ("mon".."sun") for an ISO date, UTC-stable. */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export function dayKey(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "mon" : DAY_KEYS[d.getUTCDay()];
}

export function lbHasActivity(lb: LbSummary | null): boolean {
  return (
    !!lb &&
    (num(lb.points_all_time) > 0 || num(lb.points_month) > 0 || num(lb.best_streak) > 0)
  );
}
