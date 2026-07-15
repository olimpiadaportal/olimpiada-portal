// Student ARENA home — native port of the Round-21 web dashboard
// (web-app/src/app/child/page.tsx): hero (welcome + today CTA → Tests tab)
// beside the rank panel showing the REAL all-time global rank inside a
// gradient ProgressRing, real ministats from graded attempts, the decorative
// ticker, the flag-gated monthly leaderboard quick-look + subject strengths,
// and the recent-rounds strip. The old today's-rounds mirror and the news
// mini panel are gone (rounds live on the Tests tab, news on the News tab).
// Pull-to-refresh refetches everything.
import React, { useState } from "react";
import { Platform, Pressable, View, type DimensionValue } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { ProgressRing } from "@/components/ProgressRing";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { isSupabaseConfigured } from "@/lib/env";
import { useArena } from "@/features/arena/useArena";
import {
  ARENA_BTN_INK,
  ArenaButton,
  ArenaEyebrow,
  ArenaPanel,
  ArenaScroll,
  ArenaSectionH,
} from "@/features/arena/ui";
import {
  mergeSubjects,
  useArenaAccess,
  useMyAttempts,
  useMyAllTimeRank,
  useMyLeaderboardRank,
  useMySubjects,
  usePricedSubjects,
  useRefreshArena,
  useStreakStatus,
  type ArenaAttempt,
} from "@/features/arena/queries";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** Ministat cell (web .arena-ministat: mono value over tiny uppercase key). */
function MiniStat({ value, label }: { value: string; label: string }) {
  const { arena } = useArena();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <AppText color={arena.ink} style={{ fontFamily: MONO, fontSize: 20, fontWeight: "700" }}>
        {value}
      </AppText>
      <AppText
        color={arena.dim}
        numberOfLines={1}
        style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}
      >
        {label}
      </AppText>
    </View>
  );
}

/** Subject strength bar (web .arena-strength / .arena-bar). */
function StrengthBar({ name, pct }: { name: string; pct: number }) {
  const { arena } = useArena();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
        <AppText color={arena.ink} numberOfLines={1} style={{ fontFamily: MONO, fontSize: 13, flexShrink: 1 }}>
          {name}
        </AppText>
        <AppText color={arena.lime} style={{ fontFamily: MONO, fontSize: 13, fontWeight: "700" }}>
          {pct}%
        </AppText>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: 999,
          backgroundColor: arena.bg2,
          borderWidth: 1,
          borderColor: arena.line,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%` as DimensionValue,
            height: "100%",
            borderRadius: 999,
            backgroundColor: arena.blue,
          }}
        />
      </View>
    </View>
  );
}

export default function StudentArena() {
  const { t } = useT();
  const router = useRouter();
  const { arena } = useArena();
  const config = useMobileConfig();
  const access = useArenaAccess();
  const subjectsQ = useMySubjects();
  const pricedQ = usePricedSubjects(access.freeNow);
  const attemptsQ = useMyAttempts();
  const streakQ = useStreakStatus();
  const leaderboardOn = config.data?.flags.leaderboard === true;
  const rankQ = useMyLeaderboardRank(leaderboardOn);
  // Hero ring: all-time global rank — read like the web regardless of the flag.
  const allTimeQ = useMyAllTimeRank();
  const refreshArena = useRefreshArena();

  const [refreshing, setRefreshing] = useState(false);

  if (!isSupabaseConfigured) {
    return (
      <View style={{ flex: 1, backgroundColor: arena.bg, justifyContent: "center" }}>
        <EmptyState title={t("mob.boot.error")} />
      </View>
    );
  }

  // ---- loading / error (skeletons, never spinners) ----
  if (access.loading || subjectsQ.isPending || attemptsQ.isPending) {
    return (
      <ArenaScroll>
        <Skeleton height={170} />
        <Skeleton height={190} />
        <Skeleton height={40} />
        <Skeleton height={110} />
        <Skeleton height={180} />
      </ArenaScroll>
    );
  }
  if (access.error || subjectsQ.isError || attemptsQ.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: arena.bg, justifyContent: "center" }}>
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => void refreshArena()}
        />
      </View>
    );
  }

  // ---- derived data (web ChildDashboard math, ported 1:1) ----
  const subjects = mergeSubjects(subjectsQ.data, access.freeNow ? pricedQ.data : undefined);
  const graded: ArenaAttempt[] = attemptsQ.data ?? [];

  let totalScore = 0;
  let totalMax = 0;
  const perSubject = new Map<string, { score: number; max: number }>();
  for (const a of graded) {
    const sc = Number(a.score ?? 0);
    const mx = Number(a.max_score ?? 0);
    totalScore += sc;
    totalMax += mx;
    if (a.subject_id) {
      const cur = perSubject.get(a.subject_id) ?? { score: 0, max: 0 };
      cur.score += sc;
      cur.max += mx;
      perSubject.set(a.subject_id, cur);
    }
  }
  const points = Math.round(totalScore);
  const accuracy = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const roundsCount = graded.length;
  const strength = subjects.map((s) => {
    const d = perSubject.get(s.id);
    return { ...s, pct: d && d.max > 0 ? Math.round((d.score / d.max) * 100) : 0 };
  });
  const recent = graded.slice(0, 5);

  const lbMe = rankQ.data ?? null;
  const lbRanked = !!lbMe && lbMe.rank !== null;
  const lbMonthPoints = lbMe ? Math.round(lbMe.value) : 0;
  // All-time hero rank (honest "—" until first ranked, web parity).
  const allTime = allTimeQ.data ?? null;
  const allTimeRanked = !!allTime && allTime.rank !== null;
  // Ring sweep = rank position among all ranked players (rank 1 → full ring);
  // purely rank-relative, 0 when not ranked yet.
  const ringProgress = allTimeRanked
    ? Math.max(0.04, Math.min(1, 1 - (allTime!.rank! - 1) / Math.max(allTime!.total, 1)))
    : 0;
  const streak = streakQ.data ?? null;
  const streakCurrent = streak?.current ?? 0;
  const streakBest = streak?.best ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshArena();
    } finally {
      setRefreshing(false);
    }
  };

  const goTests = () => router.push("/(student)/(tabs)/tests");
  const goRanking = () => router.push("/(student)/(tabs)/ranking");

  return (
    <ArenaScroll refreshing={refreshing} onRefresh={() => void onRefresh()}>
      {/* ---- Hero (web .arena-hero-left): welcome + today CTA → Tests tab ---- */}
      <View
        style={{
          backgroundColor: arena.panel2,
          borderWidth: 1,
          borderColor: arena.line,
          borderRadius: radius.xl,
          padding: spacing.xl,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
          <ArenaEyebrow>{t("arena.heroEyebrow")}</ArenaEyebrow>
          {access.giveawayActive ? (
            <View
              style={{
                backgroundColor: arena.gold,
                borderRadius: 999,
                paddingHorizontal: spacing.sm,
                paddingVertical: 2,
              }}
            >
              <AppText color={ARENA_BTN_INK} style={{ fontSize: 10, fontWeight: "700" }}>
                {t("gvw.chip")}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText color={arena.ink} style={{ fontSize: 26, fontWeight: "900", lineHeight: 31 }}>
          {t("child.hello")}
          {access.firstName ? `, ${access.firstName}` : ""} — {t("arena.heroTitle")}
        </AppText>
        <View style={{ flexDirection: "row", gap: spacing.md, flexWrap: "wrap" }}>
          {access.hasAccess && subjects.length > 0 ? (
            <>
              <ArenaButton title={t("arena.startRound")} onPress={goTests} />
              {leaderboardOn ? (
                <ArenaButton title={t("arena.join")} variant="ghost" onPress={goRanking} />
              ) : null}
            </>
          ) : leaderboardOn ? (
            <ArenaButton title={t("arena.nav.rank")} variant="ghost" onPress={goRanking} />
          ) : null}
        </View>
      </View>

      {/* ---- Rank panel (web .arena-rank-panel): REAL all-time global rank in
              a gradient ring + ministats ---- */}
      <ArenaPanel style={{ gap: spacing.lg, alignItems: "center" }}>
        <ArenaEyebrow>{t("arena.rankLabel")}</ArenaEyebrow>
        <ProgressRing
          progress={ringProgress}
          size={132}
          strokeWidth={9}
          gradient
          trackColor={arena.bg2}
        >
          <AppText
            color={arena.lime}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontFamily: MONO,
              fontSize: allTimeRanked && allTime!.rank! >= 1000 ? 26 : 32,
              fontWeight: "900",
              maxWidth: 96,
              textAlign: "center",
            }}
          >
            {allTimeRanked ? `#${allTime!.rank}` : "—"}
          </AppText>
        </ProgressRing>
        {!allTimeRanked ? (
          <AppText color={arena.muted} style={{ fontSize: 13, textAlign: "center" }}>
            {t("plb.notRanked")}
          </AppText>
        ) : null}
        <View style={{ flexDirection: "row", gap: spacing.md, alignSelf: "stretch" }}>
          <MiniStat value={String(points)} label={t("arena.statPoints")} />
          <MiniStat value={`${accuracy}%`} label={t("arena.statAccuracy")} />
          <MiniStat value={String(roundsCount)} label={t("arena.statRounds")} />
        </View>
      </ArenaPanel>

      {/* ---- At-risk streak note (mobile surfacing of get_streak_status) ---- */}
      {streak?.state === "at_risk" && streakCurrent > 0 ? (
        <ArenaPanel style={{ borderLeftWidth: 3, borderLeftColor: arena.red }}>
          <AppText color={arena.red} style={{ fontWeight: "600" }}>
            {"\u{1F525}"} {t("mob.arena.streakAtRisk")}
          </AppText>
        </ArenaPanel>
      ) : null}

      {/* ---- Ticker (decorative, web .arena-ticker) ---- */}
      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: arena.line,
          paddingVertical: spacing.sm,
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <AppText
          color={arena.dim}
          numberOfLines={1}
          style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1 }}
        >
          {t("arena.tickerLive")} · {t("arena.statPoints")} {points} · {t("arena.statAccuracy")}{" "}
          {accuracy}% · {t("arena.statRounds")} {roundsCount} · {t("arena.tickerToday")} · OlympIQ
        </AppText>
      </View>

      {/* ---- Locked card (web .arena-locked, same trilingual texts) ---- */}
      {!access.hasAccess ? (
        <ArenaPanel style={{ borderLeftWidth: 3, borderLeftColor: arena.gold, gap: 6 }}>
          <AppText color={arena.ink} style={{ fontWeight: "700" }}>
            {t(access.lockedKey)}
          </AppText>
          <AppText color={arena.muted}>{t("child.lockedNote")}</AppText>
        </ArenaPanel>
      ) : null}

      {/* ---- Monthly leaderboard quick-look (flag-gated, web .lbq-card) ---- */}
      {leaderboardOn ? (
        <ArenaPanel style={{ gap: spacing.md }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.md,
            }}
          >
            <ArenaEyebrow color={arena.muted}>
              {"\u{1F3C6}"} {t("plb.title")}
            </ArenaEyebrow>
            <Pressable accessibilityRole="button" accessibilityLabel={t("plb.seeFull")} onPress={goRanking} hitSlop={8}>
              <AppText color={arena.lime} variant="label">
                {t("plb.seeFull")} →
              </AppText>
            </Pressable>
          </View>
          {rankQ.isPending ? (
            <Skeleton height={48} />
          ) : lbRanked ? (
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <MiniStat value={`#${lbMe!.rank} / ${lbMe!.total}`} label={t("plb.rankThisMonth")} />
              <MiniStat value={String(lbMonthPoints)} label={t("plb.points")} />
              <MiniStat
                value={`\u{1F525} ${streakCurrent}`}
                label={`${t("plb.streak")} · ${t("plb.best")} ${streakBest}`}
              />
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
              <AppText color={arena.muted} style={{ flex: 1 }}>
                {t("plb.notRanked")}
              </AppText>
              <MiniStat
                value={`\u{1F525} ${streakCurrent}`}
                label={`${t("plb.streak")} · ${t("plb.best")} ${streakBest}`}
              />
            </View>
          )}
        </ArenaPanel>
      ) : null}

      {/* ---- Subject strength ---- */}
      <ArenaSectionH title={t("arena.subjectStrength")} />
      <ArenaPanel style={{ gap: spacing.lg }}>
        {strength.length === 0 ? (
          <AppText color={arena.muted}>{t("arena.noStrength")}</AppText>
        ) : (
          strength.map((s) => <StrengthBar key={s.id} name={s.name} pct={s.pct} />)
        )}
      </ArenaPanel>

      {/* ---- Recent rounds ---- */}
      {recent.length > 0 ? (
        <>
          <ArenaSectionH title={t("arena.recentRounds")} />
          <ArenaPanel style={{ gap: spacing.md }}>
            {recent.map((r) => (
              <View
                key={r.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.md,
                }}
              >
                <AppText color={arena.ink} numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>
                  {r.subjects?.name ?? "—"} · {t(`kind.${r.kind}`)}
                </AppText>
                <AppText color={arena.lime} style={{ fontFamily: MONO, fontWeight: "700" }}>
                  {Math.round(Number(r.score ?? 0))}/{Math.round(Number(r.max_score ?? 0))}
                </AppText>
              </View>
            ))}
          </ArenaPanel>
        </>
      ) : null}
    </ArenaScroll>
  );
}
