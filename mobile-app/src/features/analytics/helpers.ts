// Pure helpers + payload types for the parent analytics dashboard. Mirrors
// web-app/src/components/AnalyticsDashboard.tsx exactly where it matters:
// Round-18 rules are baked in — totals carry answered/correct/wrong/skipped
// SEPARATELY (wrong is answered-and-incorrect ONLY, never questions-correct),
// accuracy is answered-based and a null renders as 0%, and per_topic rows
// arrive already filtered to answered>0 server-side.

/** Analytics type (web ?mode= parity): drives the RPC p_scope. */
export type AnalyticsMode = "subjects" | "olympiads";

/** get_child_subject_dashboard → jsonb payload (defensive-optional).
 * p_scope='olympiads' additionally populates per_package (and echoes scope). */
export type DashPayload = {
  scope?: string | null;
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
  per_package?:
    | {
        package_id: string;
        title: string;
        attempts: number;
        answered: number;
        correct: number;
        wrong: number;
        skipped: number;
        accuracy: number | null;
      }[]
    | null;
};

/** get_child_leaderboard_summary payload (defensive-optional). Round 36: the
 * board value is a weighted percentage (pct_*); the RPC's points_* fields are
 * deprecated and never read. */
export type LbSummary = {
  pct_month?: number | null;
  pct_all_time?: number | null;
  questions_month?: number | null;
  questions_all_time?: number | null;
  attempts_month?: number | null;
  attempts_all_time?: number | null;
  provisional_month?: boolean | null;
  provisional_all_time?: boolean | null;
  min_attempts?: number | null;
  current_streak?: number | null;
  best_streak?: number | null;
  rank_month?: number | null;
  total_month?: number | null;
  rank_all_time?: number | null;
};

// Best / weakest topic ranking (Round 47). Mirrors
// web-app/src/lib/topicStanding.ts — keep the two in sync.
//
// The old code kept topics with >= MIN_TOPIC_SAMPLE answers and reduced to a
// max and a min. That produced a bare "—" when nothing qualified (indis-
// tinguishable from a broken feature) and, when exactly ONE topic qualified,
// showed the SAME topic as both best and weakest. Ranking is comparative: it
// needs two qualifying topics whose accuracies actually differ.

/** Minimum ANSWERED questions in one topic before its accuracy means anything. */
export const MIN_TOPIC_SAMPLE = 3;

/** Ranking is comparative: fewer than this many qualifying topics says nothing. */
export const MIN_TOPICS_TO_COMPARE = 2;

export type TopicRow = { topic: string; answered: number; accuracy: number };

export type TopicStanding =
  | { kind: "ready"; best: TopicRow; weak: TopicRow }
  | { kind: "needSample"; have: number; needed: number }
  | { kind: "needTopics"; qualified: number; needed: number }
  | { kind: "allEqual"; accuracy: number };

/** Rank topics into best/weakest, or report what is still missing. */
export function computeTopicStanding(rows: readonly TopicRow[]): TopicStanding {
  const qualified = rows.filter((r) => r.answered >= MIN_TOPIC_SAMPLE);

  if (qualified.length === 0) {
    const have = rows.reduce((max, r) => (r.answered > max ? r.answered : max), 0);
    return { kind: "needSample", have, needed: MIN_TOPIC_SAMPLE };
  }
  if (qualified.length < MIN_TOPICS_TO_COMPARE) {
    return { kind: "needTopics", qualified: qualified.length, needed: MIN_TOPICS_TO_COMPARE };
  }

  const sorted = [...qualified].sort(
    (a, b) => b.accuracy - a.accuracy || a.topic.localeCompare(b.topic, "en"),
  );
  const best = sorted[0]!;
  const weak = sorted[sorted.length - 1]!;
  if (best.accuracy === weak.accuracy) return { kind: "allEqual", accuracy: best.accuracy };
  return { kind: "ready", best, weak };
}

/** Hint shown under a card when no ranking exists yet; null once it does. */
export function topicStandingHint(
  standing: TopicStanding,
  t: (k: string) => string,
): string | null {
  switch (standing.kind) {
    case "ready":
      return null;
    case "needSample":
      // Global replace: "{n}" appears TWICE in these strings ("… at least
      // {n} answers ({a}/{n})") and String.replace with a string pattern only
      // swaps the first occurrence.
      return t("ana.topic.needSample")
        .replace(/\{a\}/g, String(standing.have))
        .replace(/\{n\}/g, String(standing.needed));
    case "needTopics":
      return t("ana.topic.needTopics").replace(/\{n\}/g, String(standing.needed));
    case "allEqual":
      return t("ana.topic.allEqual").replace(/\{p\}/g, String(Math.round(standing.accuracy)));
  }
}

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
    (num(lb.attempts_all_time) > 0 || num(lb.questions_all_time) > 0 || num(lb.best_streak) > 0)
  );
}

/** Honest empty-state check per mode (web parity): subjects mode keys off
 * graded QUESTIONS in the window; olympiads mode counts an attempt with zero
 * answered questions as activity too. */
export function dashHasData(d: DashPayload | null, mode: AnalyticsMode): boolean {
  const totals = d?.totals ?? {};
  return mode === "olympiads"
    ? num(totals.attempts) > 0 || num(totals.questions) > 0
    : num(totals.questions) > 0;
}

/**
 * Subjects-mode selection clamp (web page parity): "" = the child has no
 * unlocked subject (locked panel); "all" only when the child actually has >1
 * subject; an unknown/forged selection falls back to the single subject or
 * "all". Pure so jest exercises it directly.
 */
export function resolveSubjectSelection(
  activeIds: readonly string[],
  requested: string | null,
): string {
  if (activeIds.length === 0) return "";
  if (requested === "all" && activeIds.length > 1) return "all";
  if (requested && activeIds.includes(requested)) return requested;
  return activeIds.length === 1 ? activeIds[0] : "all";
}
