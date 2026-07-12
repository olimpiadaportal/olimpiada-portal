// TEST ENGINE (M3) — React Query hooks. Sensitive attempt data is MEMORY-ONLY
// (the app has no query persister today; the meta.noPersist markers make the
// exclusion explicit if one ever lands — master plan §11: attempts/review are
// never cached to disk). The review payload additionally uses gcTime 0 so the
// answer keys leave memory the moment the screen closes.
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/authStore";
import { useMobileConfig } from "@/lib/configQueries";
import type { Locale } from "@/i18n";
import {
  fetchAttemptRow,
  fetchBreakdownRows,
  fetchRecentAttempts,
  fetchSetupTopics,
  fetchSubjectAccess,
  fetchTestAttempt,
  fetchTestReview,
  submitTestAttempt,
} from "./api";
import { isGiveawayNow, resultBreakdown } from "./logic";

export const TQK = {
  access: (profileId: string, giveaway: boolean) =>
    ["tests", "access", profileId, giveaway] as const,
  attempts: (profileId: string) => ["tests", "attempts", profileId] as const,
  setup: (subjectId: string, profileId: string) =>
    ["tests", "setup", subjectId, profileId] as const,
  attempt: (attemptId: string, locale: Locale) =>
    ["tests", "attempt", attemptId, locale] as const,
  attemptRow: (attemptId: string, profileId: string) =>
    ["tests", "attempt-row", attemptId, profileId] as const,
  result: (attemptId: string) => ["tests", "result", attemptId] as const,
  review: (attemptId: string, locale: Locale) =>
    ["tests", "review", attemptId, locale] as const,
};

/** Server-resolved giveaway mode with client-side lazy window expiry. */
export function useGiveawayActive(): { active: boolean; settled: boolean } {
  const config = useMobileConfig();
  return {
    active: isGiveawayNow(
      config.data?.payment.mode,
      config.data?.payment.giveawayEndsAt ?? null,
      Date.now(),
    ),
    settled: !config.isPending,
  };
}

/** The child's subject-access set (subscriptions + free windows; web parity). */
export function useSubjectAccess() {
  const profileId = useAuthStore((s) => s.profileId);
  const { active: giveaway, settled } = useGiveawayActive();
  return useQuery({
    queryKey: TQK.access(profileId ?? "-", giveaway),
    queryFn: () => fetchSubjectAccess(profileId as string, giveaway),
    enabled: !!profileId && settled,
    staleTime: 60_000,
    meta: { noPersist: true },
  });
}

export function useRecentAttempts() {
  const profileId = useAuthStore((s) => s.profileId);
  return useQuery({
    queryKey: TQK.attempts(profileId ?? "-"),
    queryFn: () => fetchRecentAttempts(profileId as string),
    enabled: !!profileId,
    staleTime: 15_000,
    meta: { noPersist: true },
  });
}

export function useSetupTopics(subjectId: string) {
  const profileId = useAuthStore((s) => s.profileId);
  return useQuery({
    queryKey: TQK.setup(subjectId, profileId ?? "-"),
    queryFn: () => fetchSetupTopics(subjectId, profileId as string),
    enabled: !!profileId && subjectId.length > 0,
    staleTime: 5 * 60_000,
  });
}

/**
 * The runner's rehydration payload. gcTime 0 → dropped the moment the runner
 * unmounts, so reopening the route ALWAYS refetches fresh server state
 * (TRUE resume: saved answers/flags + a fresh remaining_seconds).
 */
export function useTestAttempt(attemptId: string, locale: Locale, enabled: boolean) {
  return useQuery({
    queryKey: TQK.attempt(attemptId, locale),
    queryFn: () => fetchTestAttempt(attemptId, locale),
    enabled,
    staleTime: Infinity, // never background-refetch under a running attempt
    gcTime: 0,
    retry: 1,
    meta: { noPersist: true },
  });
}

/** Own attempt row for result/review guards (kind, status, time context). */
export function useAttemptRow(attemptId: string, enabled = true) {
  const profileId = useAuthStore((s) => s.profileId);
  return useQuery({
    queryKey: TQK.attemptRow(attemptId, profileId ?? "-"),
    queryFn: () => fetchAttemptRow(attemptId, profileId as string),
    enabled: enabled && !!profileId && attemptId.length > 0,
    staleTime: 0,
    meta: { noPersist: true },
  });
}

/**
 * Result payload via the idempotent submit RPC (p_answers:null — returns the
 * stored result for a graded attempt / finalizes one past its deadline: the
 * web result-page contract) + the answered/skipped breakdown from own rows.
 */
export function useTestResult(attemptId: string, enabled: boolean) {
  return useQuery({
    queryKey: TQK.result(attemptId),
    queryFn: async () => {
      const [result, rows] = await Promise.all([
        submitTestAttempt(attemptId, null),
        fetchBreakdownRows(attemptId),
      ]);
      return { result, breakdown: resultBreakdown(rows) };
    },
    enabled: enabled && attemptId.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
    meta: { noPersist: true },
  });
}

/**
 * ANSWER-KEY payload (graded only). Memory-only AND gcTime 0: it is never
 * persisted anywhere and leaves the query cache as soon as the review screen
 * unmounts (anti-cheat rule, master plan §13).
 */
export function useTestReview(attemptId: string, locale: Locale, enabled = true) {
  return useQuery({
    queryKey: TQK.review(attemptId, locale),
    queryFn: () => fetchTestReview(attemptId, locale),
    enabled: enabled && attemptId.length > 0,
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    meta: { noPersist: true },
  });
}
