// Student ARENA home — native port of web-app/src/app/child/page.tsx:
// access gate first (trialing/active/free window vs the trilingual locked
// card), hero + today's-rounds CTA, real ministats from graded attempts,
// flag-gated leaderboard quick-look (child-scoped RPCs), subject strength
// bars and the latest-news mini panel (shared news cache; article opens as an
// in-tab modal, the parent-tab pattern). Pull-to-refresh refetches everything.
import React, { useState } from "react";
import { Modal, Platform, Pressable, View, type DimensionValue } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { isSupabaseConfigured } from "@/lib/env";
import { fetchNews, publicStorageUrl } from "@/lib/data";
import { ArticleView } from "@/features/news/ArticleView";
import { useArena } from "@/features/arena/useArena";
import {
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
  useMyLeaderboardRank,
  useMySubjects,
  usePricedSubjects,
  useRefreshArena,
  useStreakStatus,
  type ArenaAttempt,
  type ArenaSubject,
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

/** One practicable subject row (web .arena-round + Go button). */
function SubjectRound({ subject, onGo }: { subject: ArenaSubject; onGo: () => void }) {
  const { arena } = useArena();
  const { t } = useT();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: arena.panel2,
        borderWidth: 1,
        borderColor: arena.line,
        borderRadius: 12,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: arena.bg2,
          borderWidth: 1,
          borderColor: arena.line,
        }}
      >
        <AppText color={arena.lime} style={{ fontFamily: MONO, fontSize: 16, fontWeight: "900" }}>
          {subject.name.trim()[0]?.toUpperCase() ?? "?"}
        </AppText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText color={arena.ink} numberOfLines={1} style={{ fontWeight: "700" }}>
          {subject.name}
        </AppText>
        <AppText
          color={arena.muted}
          style={{ fontFamily: MONO, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          25 {t("arena.questionsShort")}
        </AppText>
      </View>
      <ArenaButton title={t("arena.go")} small onPress={onGo} />
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

/** Latest-news mini panel (web ChildNewsPanel: 3 thumb+title rows + View all). */
function NewsMiniPanel({
  onOpenArticle,
  onViewAll,
}: {
  onOpenArticle: (slug: string) => void;
  onViewAll: () => void;
}) {
  const { arena } = useArena();
  const { t, locale } = useT();
  // Shares the news tab's cache key, so home and the tab stay in sync.
  const q = useQuery({
    queryKey: ["news", locale],
    queryFn: () => fetchNews(locale),
    enabled: isSupabaseConfigured,
    staleTime: 5 * 60_000,
  });
  const items = (q.data ?? []).slice(0, 3);

  return (
    <ArenaPanel>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.md,
        }}
      >
        <AppText color={arena.ink} style={{ fontWeight: "700" }}>
          {t("news.latest")}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t("news.viewAll")} onPress={onViewAll} hitSlop={8}>
          <AppText color={arena.lime} variant="label">
            {t("news.viewAll")}
          </AppText>
        </Pressable>
      </View>

      {q.isPending && isSupabaseConfigured ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </View>
      ) : items.length === 0 ? (
        <AppText color={arena.muted} style={{ marginTop: spacing.md }}>
          {t("news.none")}
        </AppText>
      ) : (
        items.map((it, i) => {
          const cover = it.cover ? publicStorageUrl(it.cover.bucket, it.cover.path) : null;
          return (
            <Pressable
              key={it.id}
              accessibilityRole="button"
              accessibilityLabel={it.title}
              onPress={() => onOpenArticle(it.slug)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingVertical: spacing.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: arena.line,
                marginTop: i === 0 ? spacing.sm : 0,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {cover ? (
                <Image
                  source={{ uri: cover }}
                  style={{ width: 52, height: 52, borderRadius: 8 }}
                  contentFit="cover"
                  transition={100}
                  accessible={false}
                />
              ) : (
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 8,
                    backgroundColor: arena.panel2,
                  }}
                />
              )}
              <AppText color={arena.ink} numberOfLines={2} style={{ flex: 1, fontWeight: "600" }}>
                {it.title}
              </AppText>
            </Pressable>
          );
        })
      )}
    </ArenaPanel>
  );
}

export default function StudentArena() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { arena } = useArena();
  const config = useMobileConfig();
  const access = useArenaAccess();
  const subjectsQ = useMySubjects();
  const pricedQ = usePricedSubjects(access.freeNow);
  const attemptsQ = useMyAttempts();
  const streakQ = useStreakStatus();
  const leaderboardOn = config.data?.flags.leaderboard === true;
  const rankQ = useMyLeaderboardRank(leaderboardOn);
  const refreshArena = useRefreshArena();

  const [refreshing, setRefreshing] = useState(false);
  const [articleSlug, setArticleSlug] = useState<string | null>(null);

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
        <Skeleton height={130} />
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
  const goSubject = (id: string) =>
    router.push({ pathname: "/(student)/test/[subjectId]", params: { subjectId: id } });

  return (
    <>
      <ArenaScroll refreshing={refreshing} onRefresh={() => void onRefresh()}>
        {/* ---- Hero (web .arena-hero-left) ---- */}
        <View
          style={{
            backgroundColor: arena.panel2,
            borderWidth: 1,
            borderColor: arena.line,
            borderRadius: radius.lg,
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
                <AppText color="#0a0e1a" style={{ fontSize: 10, fontWeight: "700" }}>
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

        {/* ---- Rank panel + ministats (web .arena-rank-panel) ---- */}
        <ArenaPanel style={{ gap: spacing.md }}>
          <ArenaEyebrow>{t("arena.rankLabel")}</ArenaEyebrow>
          <AppText
            color={arena.lime}
            style={{ fontFamily: MONO, fontSize: 44, fontWeight: "900", lineHeight: 48 }}
          >
            {lbRanked ? `#${lbMe!.rank}` : "—"}
          </AppText>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
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

        {/* ---- Leaderboard quick-look (flag-gated, web .lbq-card) ---- */}
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

        {/* ---- Locked card (web .arena-locked, same trilingual texts) ---- */}
        {!access.hasAccess ? (
          <ArenaPanel style={{ borderLeftWidth: 3, borderLeftColor: arena.gold, gap: 6 }}>
            <AppText color={arena.ink} style={{ fontWeight: "700" }}>
              {t(access.lockedKey)}
            </AppText>
            <AppText color={arena.muted}>{t("child.lockedNote")}</AppText>
          </ArenaPanel>
        ) : null}

        {/* ---- Today's rounds ---- */}
        <ArenaSectionH title={t("arena.todaysRounds")} />
        {access.hasAccess && subjects.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {subjects.map((s) => (
              <SubjectRound key={s.id} subject={s} onGo={() => goSubject(s.id)} />
            ))}
          </View>
        ) : (
          <ArenaPanel>
            <AppText color={arena.muted}>
              {access.hasAccess ? t("child.noSubjects") : t("child.lockedNote")}
            </AppText>
          </ArenaPanel>
        )}

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

        {/* ---- Subject strength ---- */}
        <ArenaSectionH title={t("arena.subjectStrength")} />
        <ArenaPanel style={{ gap: spacing.lg }}>
          {strength.length === 0 ? (
            <AppText color={arena.muted}>{t("arena.noStrength")}</AppText>
          ) : (
            strength.map((s) => <StrengthBar key={s.id} name={s.name} pct={s.pct} />)
          )}
        </ArenaPanel>

        {/* ---- News mini panel ---- */}
        <ArenaSectionH title={t("news.latest")} />
        <NewsMiniPanel
          onOpenArticle={setArticleSlug}
          onViewAll={() => router.push("/(student)/(tabs)/news")}
        />
      </ArenaScroll>

      {/* In-tab article modal (parent news-tab pattern; beacon fires inside ArticleView). */}
      <Modal
        visible={articleSlug !== null}
        animationType="slide"
        onRequestClose={() => setArticleSlug(null)}
      >
        <View style={{ flex: 1, backgroundColor: arena.bg, paddingTop: insets.top }}>
          {articleSlug ? (
            <ArticleView slug={articleSlug} onBack={() => setArticleSlug(null)} />
          ) : null}
        </View>
      </Modal>
    </>
  );
}
