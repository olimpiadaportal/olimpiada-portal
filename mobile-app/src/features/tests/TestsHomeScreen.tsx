// TEST ENGINE (M3, restyled M3.2) — tests home (web /child/test Round-20/21
// parity): subject cards from the child's ACCESS SET (subscription subjects +
// free windows) carrying the get_my_round_readiness pre-flight states
// (attempted / ready / not-ready — fail OPEN when a row is missing, exactly
// like the web), a prominent CONTINUE card for a live in_progress attempt, and
// the recent history (daily rounds + practice tests) with per-row status →
// runner/result. Locked children see the same "ask your parent" hint as the
// web arena. READY → Start fires start_daily_round_attempt('today') (RATED,
// timed — web startDailyRound parity); the per-card Practice entry keeps
// routing into the untimed topic-setup flow.
import React, { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Check,
  ChevronRight,
  Clock,
  Dumbbell,
  History,
  Play,
  RotateCcw,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { radius, spacing, type ArenaTokens } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import type { Locale } from "@/i18n";
import { subjectLabel } from "@/lib/subjectLabel";
import { startDailyRoundAttempt } from "./api";
import { useRecentAttempts, useRoundReadiness, useSubjectAccess } from "./queries";
import { displayStatus, findLiveAttempt, isLiveAttempt } from "./logic";
import { ArenaButton, Notice, Panel, StatusPill, Eyebrow, tint, useArena } from "./ui";
import type { AttemptListRow, RoundReadiness } from "./types";

const DATE_TAGS: Record<Locale, string> = {
  az: "az-Latn-AZ",
  en: "en-GB",
  ru: "ru-RU",
};

function fmtDate(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(DATE_TAGS[locale] ?? locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const LOCKED_KEYS = new Set(["inactive", "locked", "expired"]);

// Asia/Baku is UTC+4 year-round (no DST) — web /child/test parity for the
// "already attempted today" detection.
const BAKU_OFFSET_MS = 4 * 3_600_000;
const DAY_MS = 86_400_000;

function isTodayBaku(iso: string | null, nowMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return (
    Math.floor((t + BAKU_OFFSET_MS) / DAY_MS) === Math.floor((nowMs + BAKU_OFFSET_MS) / DAY_MS)
  );
}

/** Subject-card state matrix (live > attempted > not-ready > ready/fail-open). */
type CardState =
  | { type: "live"; attemptId: string }
  | { type: "attempted"; result: { id: string; score: number; max: number } | null }
  | { type: "notReady" }
  | { type: "ready" };

function subjectCardState(
  subjectId: string,
  rows: AttemptListRow[],
  readiness: RoundReadiness | undefined,
  nowMs: number,
): CardState {
  // Latest rated round attempt for this subject inside today's Baku day
  // (rows arrive newest-first) — the fallback/merge for readiness.attempted.
  const todayRated =
    rows.find(
      (r) =>
        r.kind === "daily" &&
        r.is_rated &&
        r.subject_id === subjectId &&
        isTodayBaku(r.started_at, nowMs),
    ) ?? null;

  if (todayRated && isLiveAttempt(todayRated, nowMs)) {
    return { type: "live", attemptId: todayRated.id };
  }
  if (readiness?.attempted === true || todayRated) {
    return {
      type: "attempted",
      result:
        todayRated && todayRated.status === "graded"
          ? {
              id: todayRated.id,
              score: Math.round(Number(todayRated.score ?? 0)),
              max: Math.round(Number(todayRated.max_score ?? 0)),
            }
          : null,
    };
  }
  // Missing readiness row (no grade / transient error) fails OPEN to Start.
  if (readiness && !readiness.ready) return { type: "notReady" };
  return { type: "ready" };
}

export function TestsHomeScreen() {
  const { t, locale } = useT();
  const { arena } = useArena();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const accessQ = useSubjectAccess();
  const attemptsQ = useRecentAttempts();
  // Round-21 pre-flight — never gates rendering (fail open while loading).
  const readinessQ = useRoundReadiness();

  // Refresh on RE-focus (returning from a finished/canceled attempt) — the
  // first focus rides on the initial fetch, so skip it.
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      void qc.invalidateQueries({ queryKey: ["tests", "attempts"] });
      void qc.invalidateQueries({ queryKey: ["tests", "access"] });
      void qc.invalidateQueries({ queryKey: ["tests", "readiness"] });
    }, [qc]),
  );

  const pad = {
    padding: spacing.lg,
    paddingBottom: insets.bottom + spacing.xl,
    gap: spacing.lg,
  } as const;

  if (accessQ.isPending || attemptsQ.isPending) {
    return (
      <View style={[pad, { flex: 1, backgroundColor: arena.bg }]}>
        <Skeleton height={22} width="55%" />
        <Skeleton height={14} width="85%" />
        <Skeleton height={108} />
        <Skeleton height={108} />
        <Skeleton height={160} />
      </View>
    );
  }

  if (accessQ.isError || attemptsQ.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: arena.bg, justifyContent: "center" }}>
        <ErrorRetry
          message={t("test.err.generic")}
          retryLabel={t("mob.retry")}
          onRetry={() => {
            void accessQ.refetch();
            void attemptsQ.refetch();
          }}
        />
      </View>
    );
  }

  const access = accessQ.data!;
  const rows = attemptsQ.data ?? [];
  const now = Date.now();
  const live = findLiveAttempt(rows, now);
  const recent = rows.filter((r) => r.id !== live?.id).slice(0, 10);
  const lockedKey = LOCKED_KEYS.has(access.access) ? access.access : "inactive";

  const readinessBySubject = new Map<string, RoundReadiness>();
  for (const r of readinessQ.data ?? []) readinessBySubject.set(r.subject_id, r);
  // Settled-but-empty readiness = no student/no grade (RPC contract) — an
  // honest note; errors/pending stay silent (fail open).
  const noGrade =
    readinessQ.data !== undefined &&
    readinessQ.data.length === 0 &&
    access.hasAccess &&
    access.subjects.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: arena.bg }}
      contentContainerStyle={pad}
      refreshControl={
        <RefreshControl
          refreshing={attemptsQ.isRefetching || accessQ.isRefetching}
          onRefresh={() => {
            void accessQ.refetch();
            void attemptsQ.refetch();
            void readinessQ.refetch();
          }}
          tintColor={arena.blue}
          colors={[arena.blue]}
        />
      }
    >
      {/* ---- Header ---- */}
      <View style={{ gap: spacing.sm }}>
        <Eyebrow arena={arena}>{t("test.home.eyebrow")}</Eyebrow>
        <AppText variant="heading" color={arena.ink}>
          {t("test.home.title")}
        </AppText>
        <AppText color={arena.muted} style={{ fontSize: 14, lineHeight: 20 }}>
          {t("test.home.sub2")}
        </AppText>
      </View>

      {/* ---- Continue card (live in_progress attempt) ---- */}
      {live ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("test.home.continueTitle")}
          onPress={() =>
            router.push({
              pathname: "/(student)/test/run/[attemptId]",
              params: { attemptId: live.id },
            })
          }
          style={({ pressed }) => ({
            backgroundColor: tint(arena.blue, 0.12),
            borderColor: tint(arena.blue, 0.55),
            borderWidth: 1,
            borderRadius: radius.xl,
            padding: spacing.lg,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.md,
              backgroundColor: arena.blue,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Play size={22} color="#ffffff" strokeWidth={2.5} fill="#ffffff" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" color={arena.ink} style={{ fontSize: 17 }}>
              {t("test.home.continueTitle")}
            </AppText>
            <AppText color={arena.muted} style={{ fontSize: 13 }} numberOfLines={2}>
              {subjectLabel(t, live.subject_code, live.subject_name) +
                " · " +
                t("test.home.continueSub")}
            </AppText>
          </View>
          <View
            style={{
              backgroundColor: arena.blue,
              borderRadius: 999,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
            }}
          >
            <AppText variant="label" color="#ffffff" style={{ fontSize: 13 }}>
              {t("test.home.continueCta")}
            </AppText>
          </View>
        </Pressable>
      ) : null}

      {/* ---- Subjects (today's rounds) ---- */}
      <SectionHeader title={t("test.rounds.today")} color={arena.muted} />
      {noGrade ? <Notice arena={arena}>{t("test.rounds.noGrade")}</Notice> : null}
      {access.hasAccess && access.subjects.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          {access.subjects.map((s) => (
            <SubjectCard
              key={s.id}
              arena={arena}
              subjectId={s.id}
              name={subjectLabel(t, s.code, s.name)}
              state={subjectCardState(s.id, rows, readinessBySubject.get(s.id), now)}
            />
          ))}
        </View>
      ) : access.hasAccess ? (
        <Panel arena={arena}>
          <AppText color={arena.muted}>{t("child.noSubjects")}</AppText>
        </Panel>
      ) : (
        // Locked: same "ask your parent" hint as the web arena.
        <Panel arena={arena} style={{ borderColor: tint(arena.gold, 0.5), gap: spacing.xs }}>
          <AppText variant="label" color={arena.ink}>
            {t(`child.locked.${lockedKey}`)}
          </AppText>
          <AppText color={arena.muted} style={{ fontSize: 13 }}>
            {t("child.lockedNote")}
          </AppText>
        </Panel>
      )}

      {/* ---- Previous day's rounds — unlimited UNTIMED practice replays
           (web /child/test section 2 parity: between today's cards and the
           history; one practice-only notice + a Replay row per subject). ---- */}
      <SectionHeader
        title={t("test.rounds.yesterday")}
        color={arena.muted}
        style={{ marginTop: spacing.sm }}
      />
      {access.hasAccess && access.subjects.length > 0 ? (
        <>
          <Notice arena={arena}>{t("test.rounds.practiceNote")}</Notice>
          <View style={{ gap: spacing.md }}>
            {access.subjects.map((s) => (
              <ReplayRow
                key={s.id}
                arena={arena}
                subjectId={s.id}
                name={subjectLabel(t, s.code, s.name)}
              />
            ))}
          </View>
        </>
      ) : (
        <Panel arena={arena}>
          <AppText color={arena.muted}>
            {access.hasAccess ? t("child.noSubjects") : t("child.lockedNote")}
          </AppText>
        </Panel>
      )}

      {/* ---- Recent attempts ---- */}
      <SectionHeader
        title={t("test.rounds.recent")}
        color={arena.muted}
        style={{ marginTop: spacing.sm }}
      />
      <Panel arena={arena} style={{ padding: 0 }}>
        {recent.length === 0 ? (
          <EmptyState
            title={t("test.home.noAttempts")}
            icon={<History size={26} color={arena.dim} strokeWidth={2} />}
          />
        ) : (
          recent.map((r, i) => (
            <AttemptRow
              key={r.id}
              row={r}
              last={i === recent.length - 1}
              now={now}
              locale={locale}
            />
          ))
        )}
      </Panel>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// One subject card: identity row + readiness state row + the always-active
// practice entry into the setup flow. READY → Start fires the RATED
// start_daily_round_attempt('today') RPC (web startDailyRound parity) and
// lands in the shared runner; the RPC re-enforces everything server-side and
// its error codes map back to the same trilingual notes the web shows.
// ---------------------------------------------------------------------------
function SubjectCard({
  arena,
  subjectId,
  name,
  state,
}: {
  arena: ArenaTokens;
  subjectId: string;
  name: string;
  state: CardState;
}) {
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const openSetup = () =>
    router.push({ pathname: "/(student)/test/[subjectId]", params: { subjectId } });

  const startRound = async () => {
    if (starting) return;
    setStarting(true);
    setCardError(null);
    try {
      const res = await startDailyRoundAttempt(subjectId);
      if (res.ok) {
        setStarting(false);
        router.push({
          pathname: "/(student)/test/run/[attemptId]",
          params: {
            attemptId: res.data.attempt_id,
            resumed: res.data.resumed ? "1" : "0",
          },
        });
        return;
      }
      if (res.already) {
        // Race fallback (web ?err=already): the day was consumed elsewhere —
        // refresh the pre-flight + history so the card flips to attempted.
        void qc.invalidateQueries({ queryKey: ["tests", "readiness"] });
        void qc.invalidateQueries({ queryKey: ["tests", "attempts"] });
      } else if (res.errorKey === "test.rounds.noRoundYet") {
        // Pool state changed since render — re-run the pre-flight.
        void qc.invalidateQueries({ queryKey: ["tests", "readiness"] });
      }
      setCardError(t(res.errorKey));
    } catch {
      setCardError(t("test.err.generic"));
    }
    setStarting(false);
  };

  return (
    <Panel arena={arena} style={{ gap: spacing.md }}>
      {/* Identity row */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: tint(arena.blue, 0.14),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText variant="title" color={arena.blue}>
            {name.trim()[0]?.toUpperCase() ?? "?"}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" color={arena.ink} style={{ fontSize: 16 }}>
            {name}
          </AppText>
          <AppText color={arena.dim} style={{ fontSize: 12 }}>
            {t("test.rounds.timedBadge")}
          </AppText>
        </View>
      </View>

      {/* State row */}
      {state.type === "ready" ? (
        <ArenaButton
          arena={arena}
          kind="gradient"
          title={t("test.rounds.start")}
          pendingTitle={t("test.setup.starting")}
          pending={starting}
          icon={<Play size={16} color="#ffffff" strokeWidth={2.5} fill="#ffffff" />}
          onPress={() => void startRound()}
        />
      ) : state.type === "live" ? (
        <ArenaButton
          arena={arena}
          title={t("test.home.continueCta")}
          icon={<Play size={16} color="#ffffff" strokeWidth={2.5} fill="#ffffff" />}
          onPress={() =>
            router.push({
              pathname: "/(student)/test/run/[attemptId]",
              params: { attemptId: state.attemptId },
            })
          }
        />
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          {state.type === "attempted" ? (
            <StatusPill
              arena={arena}
              tone="ok"
              label={t("test.rounds.attempted")}
              icon={<Check size={13} color={arena.lime} strokeWidth={3} />}
            />
          ) : (
            <StatusPill
              arena={arena}
              tone="off"
              label={t("test.rounds.notReady")}
              icon={<Clock size={13} color={arena.dim} strokeWidth={2.5} />}
            />
          )}
          {state.type === "attempted" && state.result ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("test.result.title")}
              hitSlop={10}
              onPress={() =>
                router.push({
                  pathname: "/(student)/test/result/[attemptId]",
                  params: { attemptId: state.result!.id },
                })
              }
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <AppText variant="mono" color={arena.lime} style={{ fontSize: 16 }}>
                {state.result.score}/{state.result.max}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      )}

      {/* Start-round error (mapped i18n key, never raw Postgres text). */}
      {cardError ? (
        <AppText color={arena.red} style={{ fontSize: 13 }}>
          {cardError}
        </AppText>
      ) : null}

      {/* Practice entry — ALWAYS active (untimed, unrated topic setup flow). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("test.rounds.practiceCta")}
        onPress={openSetup}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: arena.line,
          paddingTop: spacing.md,
          minHeight: 44,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Dumbbell size={16} color={arena.muted} strokeWidth={2} />
        <AppText variant="label" color={arena.ink} style={{ fontSize: 13 }}>
          {t("test.rounds.practiceCta")}
        </AppText>
        <AppText color={arena.dim} style={{ flex: 1, fontSize: 12 }} numberOfLines={1}>
          {t("test.rounds.practiceMeta")}
        </AppText>
        <ChevronRight size={16} color={arena.dim} strokeWidth={2} />
      </Pressable>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Previous-day replay row (M3.1, web section-2 parity): Replay fires
// start_daily_round_attempt(subject, 'yesterday') — an unlimited UNTIMED
// practice attempt (null deadline → the runner's ∞ no-limit pill + practice
// badge) that never affects points/streak/boards. Deliberately NO pre-flight
// existence check (the snapshot table is not client-readable — the web also
// click-then-maps): no_data_found lands inline as test.rounds.noYesterday.
// ---------------------------------------------------------------------------
function ReplayRow({
  arena,
  subjectId,
  name,
}: {
  arena: ArenaTokens;
  subjectId: string;
  name: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  // The mapped i18n KEY (translated at render) — never raw Postgres text.
  const [errKey, setErrKey] = useState<string | null>(null);

  const startReplay = async () => {
    if (starting) return;
    setStarting(true);
    setErrKey(null);
    try {
      const res = await startDailyRoundAttempt(subjectId, "yesterday");
      if (res.ok) {
        setStarting(false);
        router.push({
          pathname: "/(student)/test/run/[attemptId]",
          params: {
            attemptId: res.data.attempt_id,
            resumed: res.data.resumed ? "1" : "0",
          },
        });
        return;
      }
      setErrKey(res.errorKey);
    } catch {
      setErrKey("test.err.generic");
    }
    setStarting(false);
  };

  return (
    <Panel arena={arena} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: tint(arena.blue, 0.14),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText variant="title" color={arena.blue}>
            {name.trim()[0]?.toUpperCase() ?? "?"}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" color={arena.ink} style={{ fontSize: 16 }}>
            {name}
          </AppText>
          <AppText color={arena.dim} style={{ fontSize: 12 }} numberOfLines={1}>
            {t("kind.practice")} · {t("test.rounds.practiceMeta")}
          </AppText>
        </View>
        <ArenaButton
          arena={arena}
          kind="ghost"
          title={t("test.rounds.replay")}
          pendingTitle={t("test.setup.starting")}
          pending={starting}
          icon={<RotateCcw size={15} color={arena.ink} strokeWidth={2.5} />}
          onPress={() => void startReplay()}
        />
      </View>
      {/* Inline mapped note: noYesterday is informational (web tst-notice);
          anything else is the generic/access error tone. */}
      {errKey ? (
        errKey === "test.rounds.noYesterday" ? (
          <Notice arena={arena}>{t(errKey)}</Notice>
        ) : (
          <AppText color={arena.red} style={{ fontSize: 13 }}>
            {t(errKey)}
          </AppText>
        )
      ) : null}
    </Panel>
  );
}

function AttemptRow({
  row,
  last,
  now,
  locale,
}: {
  row: AttemptListRow;
  last: boolean;
  now: number;
  locale: Locale;
}) {
  const { t } = useT();
  const { arena } = useArena();
  const router = useRouter();

  const status = displayStatus(row, now);
  const when = row.submitted_at ?? row.started_at;

  let right: React.ReactNode;
  if (status === "graded") {
    right = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("test.result.title")}
        hitSlop={8}
        onPress={() =>
          router.push({
            pathname: "/(student)/test/result/[attemptId]",
            params: { attemptId: row.id },
          })
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <AppText variant="mono" color={arena.lime} style={{ fontSize: 16 }}>
          {Math.round(Number(row.score ?? 0))}/{Math.round(Number(row.max_score ?? 0))}
        </AppText>
      </Pressable>
    );
  } else if (status === "in_progress") {
    right = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("test.status.in_progress")}
        hitSlop={8}
        onPress={() =>
          router.push({
            pathname: "/(student)/test/run/[attemptId]",
            params: { attemptId: row.id },
          })
        }
      >
        <StatusPill arena={arena} tone="run" label={t("test.status.in_progress")} />
      </Pressable>
    );
  } else {
    right = (
      <StatusPill
        arena={arena}
        tone={status === "canceled" ? "off" : "bad"}
        label={t(`test.status.${status === "canceled" ? "canceled" : "expired"}`)}
      />
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: arena.line,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <AppText variant="label" color={arena.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
            {subjectLabel(t, row.subject_code, row.subject_name)}
          </AppText>
          {row.is_rated ? (
            <View
              style={{
                backgroundColor: tint(arena.lime, 0.14),
                borderColor: tint(arena.lime, 0.5),
                borderWidth: 1,
                borderRadius: 999,
                paddingVertical: 1,
                paddingHorizontal: spacing.sm,
              }}
            >
              <AppText variant="label" color={arena.lime} style={{ fontSize: 10 }}>
                {t("test.rounds.ratedChip")}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText color={arena.dim} style={{ fontSize: 12 }}>
          {fmtDate(when, locale)}
        </AppText>
      </View>
      {right}
    </View>
  );
}
