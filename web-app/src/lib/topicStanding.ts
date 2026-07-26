// Best / weakest topic ranking for the parent analytics dashboard (Round 47).
//
// WHY THIS MODULE EXISTS — the "—" bug:
//   The old code kept only topics with >= MIN_TOPIC_SAMPLE answered questions
//   and then reduced that list to a max and a min. Two things went wrong:
//     1. When NO topic reached the sample the cards rendered a bare "—", which
//        reads as "broken feature" rather than "not enough data yet". A parent
//        cannot tell the difference, and there was nothing on screen saying
//        what would make the number appear.
//     2. When exactly ONE topic reached the sample, max and min were the SAME
//        row, so "best topic" and "weakest topic" both showed the same name —
//        which is nonsense. On the dev data set every single student hit case
//        1 or case 2, so the feature had never once produced a usable pair.
//
// Ranking best against weakest is inherently COMPARATIVE. It needs at least
// two topics with a real sample, and it needs their accuracies to actually
// differ — three topics all sitting on 60% have no "best" and no "weakest".
// This module returns a discriminated result so the UI can say precisely which
// of those conditions is still missing, in the user's language.
//
// Mirrored by mobile-app/src/features/analytics/helpers.ts — keep in sync.

/** Minimum ANSWERED questions in one topic before its accuracy means anything. */
export const MIN_TOPIC_SAMPLE = 3;

/** Ranking is comparative: fewer than this many qualifying topics says nothing. */
export const MIN_TOPICS_TO_COMPARE = 2;

export type TopicRow = {
  topic: string;
  /** Questions actually answered (skipped ones are already excluded upstream). */
  answered: number;
  /** 0–100, computed over answered questions only. */
  accuracy: number;
};

export type TopicStanding =
  /** Enough comparable data — render both cards. */
  | { kind: "ready"; best: TopicRow; weak: TopicRow }
  /** No topic has reached the sample yet. `have` is the best progress so far. */
  | { kind: "needSample"; have: number; needed: number }
  /** Exactly one topic qualifies — there is nothing to compare it against. */
  | { kind: "needTopics"; qualified: number; needed: number }
  /** Two or more qualify but every accuracy is identical — no ranking exists. */
  | { kind: "allEqual"; accuracy: number };

/**
 * Rank topics into a best/weakest pair, or explain what is still missing.
 *
 * Ties are broken by topic name so the result is stable across renders and
 * between server and client (no locale-sensitive comparison).
 */
export function computeTopicStanding(rows: readonly TopicRow[]): TopicStanding {
  const qualified = rows.filter((r) => r.answered >= MIN_TOPIC_SAMPLE);

  if (qualified.length === 0) {
    // Report the closest any topic got, so the hint can read "2 / 3".
    const have = rows.reduce((max, r) => (r.answered > max ? r.answered : max), 0);
    return { kind: "needSample", have, needed: MIN_TOPIC_SAMPLE };
  }

  if (qualified.length < MIN_TOPICS_TO_COMPARE) {
    return {
      kind: "needTopics",
      qualified: qualified.length,
      needed: MIN_TOPICS_TO_COMPARE,
    };
  }

  const sorted = [...qualified].sort(
    (a, b) => b.accuracy - a.accuracy || a.topic.localeCompare(b.topic, "en"),
  );
  const best = sorted[0]!;
  const weak = sorted[sorted.length - 1]!;

  // Every topic on the same accuracy → naming one "best" and another "weakest"
  // would be arbitrary and misleading.
  if (best.accuracy === weak.accuracy) {
    return { kind: "allEqual", accuracy: best.accuracy };
  }

  return { kind: "ready", best, weak };
}

/**
 * The hint shown under a best/weakest card when no ranking is available yet.
 * `dict` supplies the trilingual strings; `{n}` / `{a}` are filled here so the
 * UI layer stays free of string surgery. Returns null when a ranking exists.
 */
export function topicStandingHint(
  standing: TopicStanding,
  dict: Record<string, string>,
): string | null {
  switch (standing.kind) {
    case "ready":
      return null;
    case "needSample":
      // Global replace: "{n}" appears TWICE in these strings ("… at least
      // {n} answers ({a}/{n})") and String.replace with a string pattern only
      // swaps the first occurrence.
      return (dict["ana.topic.needSample"] ?? "")
        .replace(/\{a\}/g, String(standing.have))
        .replace(/\{n\}/g, String(standing.needed));
    case "needTopics":
      return (dict["ana.topic.needTopics"] ?? "").replace(
        /\{n\}/g,
        String(standing.needed),
      );
    case "allEqual":
      return (dict["ana.topic.allEqual"] ?? "").replace(
        /\{p\}/g,
        String(Math.round(standing.accuracy)),
      );
  }
}
