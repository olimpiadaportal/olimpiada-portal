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
  // locale is part of the key on purpose: setLocale() only mutates the zustand
  // store and never touches the query cache, so a locale-less key would keep
  // serving the previous language until staleTime expired (migration 114).
  setup: (subjectId: string, profileId: string, locale: Locale) =>
    ["tests", "setup", subjectId, profileId, locale] as const,
  attempt: (attemptId: string, locale: Locale) =>
    ["tests", "attempt", attemptId, locale] as const,
  attemptRow: (attemptId: string, profileId: string) =>
    ["tests", "attempt-row", attemptId, profileId] as const,
  result: (attemptId: string, locale: Locale) =>
    ["tests", "result", attemptId, locale] as const,
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

export function useSetupTopics(subjectId: string, locale: Locale) {
  const profileId = useAuthStore((s) => s.profileId);
  return useQuery({
    queryKey: TQK.setup(subjectId, profileId ?? "-", locale),
    queryFn: () => fetchSetupTopics(subjectId, profileId as string, locale),
    enabled: !!profileId && subjectId.length > 0,
    staleTime: 5 * 60_000,
  });
}

/**
 * The runner's rehydration payload. gcTime 0 → dropped the moment the runner
 * unmounts, so reopening the route ALWAYS refetches fresh server state
 * (TRUE resume: saved answers/flags + a fresh remaining_seconds).
 *
 * What the RUNNER then displays is this payload merged with the in-memory
 * draft (logic.ts hydrateAnswers/hydrateFlags): only still-unsaved local edits
 * override it, and a settled draft value only fills a question the payload has
 * no selection for. So a fresh server answer — the same attempt continued in
 * the web app — is what the child sees, while nothing typed on this device is
 * ever rolled back by a remount.
 *
 * `refetchOnMount: "always"` closes the one hole gcTime 0 leaves open: the
 * sweep is a setTimeout(0) macrotask that `addObserver` cancels, so a remount
 * inside the same scheduler flush finds the OLD entry still there — and
 * staleTime Infinity would then pin the runner to a pre-submit snapshot
 * forever. Refetching on mount makes that case self-heal instead. staleTime
 * Infinity still holds for the mounted lifetime: a running attempt is never
 * background-refetched out from under the child.
 */
export function useTestAttempt(attemptId: string, locale: Locale, enabled: boolean) {
  return useQuery({
    queryKey: TQK.attempt(attemptId, locale),
    queryFn: () => fetchTestAttempt(attemptId, locale),
    enabled,
    staleTime: Infinity, // never background-refetch under a running attempt
    gcTime: 0,
    refetchOnMount: "always",
    retry: 1,
    meta: { noPersist: true },
  });
}

/**
 * Own attempt row for result/review guards (kind, status, time context).
 *
 * staleTime 0 = every mount re-reads it. Consumers that can NAVIGATE on this
 * row (the result screen's "still live → back to the player" bounce) must gate
 * on `isFetchedAfterMount`, because the runner warms this same key with
 * `in_progress` and that copy survives the navigation to the result screen.
 */
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
export function useTestResult(attemptId: string, locale: Locale, enabled: boolean) {
  return useQuery({
    queryKey: TQK.result(attemptId, locale),
    queryFn: async () => {
      const [result, rows] = await Promise.all([
        submitTestAttempt(attemptId, null, locale),
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
