// Student ARENA home — native port of the Round-21 web dashboard
// (web-app/src/app/child/page.tsx): hero (welcome + today CTA → Tests tab)
// beside the rank panel showing the REAL all-time global rank inside a
// gradient ProgressRing, real ministats from graded attempts, the decorative
// ticker, the flag-gated monthly leaderboard quick-look + subject strengths,
// and the recent-rounds strip. The old today's-rounds mirror and the news
// mini panel are gone (rounds live on the Tests tab, news on the News tab).
// Pull-to-refresh refetches everything.
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  View,
  type DimensionValue,
} from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { ProgressRing } from "@/components/ProgressRing";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { formatPercent } from "@/lib/formatPercent";
import { subjectLabel } from "@/lib/subjectLabel";
import { useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
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

/** Ministat cell (web .arena-ministat: mono value over tiny uppercase key).
 * The value stays one line; the label may wrap to 2 centered lines so long
 * keys ("SERIYA · REKORD 0") never ellipsize on narrow phones. */
function MiniStat({ value, label }: { value: string; label: string }) {
  const { arena } = useArena();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <AppText
        color={arena.ink}
        numberOfLines={1}
        // Numbers never truncate: wide values ("#123 / 456") scale down on
        // narrow phones instead of ellipsizing.
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        style={{ fontFamily: MONO, fontSize: 20, fontWeight: "700" }}
      >
        {value}
      </AppText>
      <AppText
        color={arena.dim}
        numberOfLines={2}
        style={{
          fontFamily: MONO,
          fontSize: 9,
          lineHeight: 12,
          textTransform: "uppercase",
          letterSpacing: 1,
          textAlign: "center",
        }}
      >
        {label}
      </AppText>
    </View>
  );
}

/** Marquee pace (px/s) — matches the web ticker's calm 28s linear loop. */
const TICKER_SPEED = 35;

/** Decorative live ticker (web .arena-ticker): the line rendered twice in a
 * nowrap track, translateX 0 → -one-copy-width, linear, looped — a seamless
 * auto-scroll. Reduce-motion renders the static single-line version instead.
 * The horizontal ScrollView (scroll disabled) only lifts the width constraint
 * so each copy measures its full single-line width; it also clips overflow. */
function Ticker({ points, accuracy, rounds }: { points: number; accuracy: number; rounds: number }) {
  const { arena } = useArena();
  const { t } = useT();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [runWidth, setRunWidth] = useState(0);
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (live) setReduceMotion(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const stats = ` · ${t("arena.statPoints")} ${points} · ${t("arena.statAccuracy")} ${accuracy}% · ${t("arena.statRounds")} ${rounds} · `;

  // A stat/locale change re-measures the copy (onLayout) and restarts the
  // loop from 0 so the two copies never drift apart.
  useEffect(() => {
    if (reduceMotion || runWidth <= 0) return;
    shift.setValue(0);
    const loop = Animated.loop(
      Animated.timing(shift, {
        toValue: -runWidth,
        duration: (runWidth / TICKER_SPEED) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, runWidth, shift]);

  const textStyle = { fontFamily: MONO, fontSize: 11, letterSpacing: 1 } as const;
  // One copy of the line; tickerLive/tickerToday are lime bold (web <b>).
  const run = (measure: boolean) => (
    <AppText
      color={arena.dim}
      numberOfLines={1}
      onLayout={measure ? (e) => setRunWidth(Math.ceil(e.nativeEvent.layout.width)) : undefined}
      style={[textStyle, { flexShrink: 0 }]}
    >
      <AppText color={arena.lime} style={[textStyle, { fontWeight: "700" }]}>
        {t("arena.tickerLive")}
      </AppText>
      {stats}
      <AppText color={arena.lime} style={[textStyle, { fontWeight: "700" }]}>
        {t("arena.tickerToday")}
      </AppText>
      {" · OlympIQ · "}
    </AppText>
  );

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: arena.line,
        paddingVertical: spacing.sm,
        overflow: "hidden",
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {reduceMotion ? (
        <AppText color={arena.dim} numberOfLines={1} style={textStyle}>
          {t("arena.tickerLive")} · {t("arena.statPoints")} {points} · {t("arena.statAccuracy")}{" "}
          {accuracy}% · {t("arena.statRounds")} {rounds} · {t("arena.tickerToday")} · OlympIQ
        </AppText>
      ) : (
        <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <Animated.View
            style={{ flexDirection: "row", transform: [{ translateX: shift }] }}
          >
            {run(true)}
            {run(false)}
          </Animated.View>
        </ScrollView>
      )}
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
  const { t, locale } = useT();
  const router = useRouter();
  const { arena } = useArena();
  const config = useMobileConfig();
  const access = useArenaAccess();
  const subjectsQ = useMySubjects();
  // Enabled for an ENTITLED child too, not just a free window: the published
  // catalogue is where the code+name of an entitled subject come from (the
  // access RPC returns bare ids).
  //
  // A SUBSCRIBED CHILD MAKES THIS FETCH TOO, and the gate was never going to
  // spare them: subscriptions are MIRRORED into entitlements (011
  // fn_entitlement_map_subject, fired by trg_entitlements_from_sub_subjects /
  // trg_entitlements_from_child_subs; 013 check 114_entitlements_parity is the
  // standing alarm that the two stay in step), so my_accessible_subjects() names
  // a subscriber's subjects and `entitledNow` is true for them. What the gate
  // actually skips is the child with NO live access at all — a locked or expired
  // account, where the catalogue would only feed a list they may not open.
  //
  // Which is why the round trip stays. It is what makes an entitled child's
  // subjects appear at all, and `pricedQ.isLoading` below is what holds the
  // skeleton until it lands; "optimising" the gate to `freeNow` would paint a
  // paying child an unlocked arena with nothing in it.
  const pricedQ = usePricedSubjects(access.freeNow || access.entitledNow);
  const attemptsQ = useMyAttempts();
  const streakQ = useStreakStatus();
  const leaderboardOn = config.data?.flags.leaderboard === true;
  const rankQ = useMyLeaderboardRank(leaderboardOn);
  // Hero ring: all-time global rank — read like the web regardless of the flag.
  const allTimeQ = useMyAllTimeRank();
  const refreshArena = useRefreshArena();
  // useRefreshArena already awaits the whole arena/news/config key tree, so it
  // is the single source this screen needs.
  const { refreshing, onRefresh } = usePullRefresh([refreshArena]);

  if (!isSupabaseConfigured) {
    return (
      <View style={{ flex: 1, backgroundColor: arena.bg, justifyContent: "center" }}>
        <EmptyState title={t("mob.boot.error")} />
      </View>
    );
  }

  // ---- loading / error (skeletons, never spinners) ----
  // `pricedQ.isLoading`, never `isPending`: a DISABLED query stays pending
  // forever, so isPending here would hang the skeleton for every subscribed
  // child. isLoading is true only while it is actually fetching — which is
  // exactly the window in which an entitled child would otherwise be painted
  // unlocked with an empty subject list before the catalogue lands.
  if (access.loading || subjectsQ.isPending || pricedQ.isLoading || attemptsQ.isPending) {
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
  // What the published catalogue contributes on top of the subscribed list. A
  // free window contributes ALL of it; an entitlement contributes exactly the
  // subjects my_accessible_subjects() named, and nothing else on this screen
  // reads `entitlements` — an in-app purchase writes that one row and neither a
  // child_subscriptions row nor an access_status, so useMySubjects() comes back
  // EMPTY for a purchase-only child. Without this arm the hero declares the
  // arena unlocked, offers no "start round" button and never names the subject
  // that was just bought.
  //
  // Same shape as the Tests home (features/tests/api.ts fetchSubjectAccess):
  // the RPC returns ids only, so code+name are resolved here and the ids merely
  // NARROW the list. The narrowing is the whole point — merging the catalogue
  // wholesale for an entitled child would offer subjects that
  // start_daily_round_attempt then refuses. fetchPricedSubjects() has already
  // applied the grade filter (keepTaughtSubjects) to what arrives here, so that
  // rule still runs last and covers both arms.
  const unlocked = access.freeNow
    ? pricedQ.data
    : access.entitledNow
      ? (pricedQ.data ?? []).filter((s) => access.accessibleSubjectIds.includes(s.id))
      : undefined;
  const subjects = mergeSubjects(subjectsQ.data, unlocked);
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
  const lbProvisional = !!lbMe && lbMe.is_provisional;
  const lbMonthPct = formatPercent(lbMe?.value ?? 0, locale);
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

  const goTests = () => router.push("/(student)/(tabs)/tests");
  const goRanking = () => router.push("/(student)/(tabs)/ranking");

  return (
    <ArenaScroll refreshing={refreshing} onRefresh={onRefresh}>
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
            {/* Provisional all-time: never a number in the ring — say so. */}
            {allTime?.is_provisional ? t("plb.provisionalShort") : t("plb.notRanked")}
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
      <Ticker points={points} accuracy={accuracy} rounds={roundsCount} />

      {/* ---- Locked card (web .arena-locked, same trilingual texts) ---- */}
      {!access.hasAccess ? (
        <ArenaPanel style={{ borderLeftWidth: 3, borderLeftColor: arena.gold, gap: 6 }}>
          <AppText color={arena.ink} style={{ fontWeight: "700" }}>
            {t(access.lockedKey)}
          </AppText>
          <AppText color={arena.muted}>{t("child.lockedNote")}</AppText>
        </ArenaPanel>
      ) : subjects.length === 0 ? (
        /* ACCESS, BUT NOTHING TO OPEN — and this combination used to render
           NOTHING AT ALL: the hero drops its "start round" button (it needs a
           subject), and the locked card above is skipped precisely because the
           child DOES have access. A child whose family had just paid got a
           dashboard that said nothing about it.

           It is reachable whenever the entitled subject survives the access
           read and not the grade rule that runs last — a legacy purchase of a
           subject this grade does not study, or a subject whose curriculum has
           not reached this grade yet. The purchase surfaces now apply the same
           rule (features/iap/catalog.ts) so no NEW sale can land here, and this
           panel is what an old one looks like instead of a blank screen.

           Same sentence as the Tests tab in the same state (child.noSubjects),
           because it is the same fact and a child must not be told two
           different stories on two tabs. Not child.lockedNote — "ask your
           parent to activate a subscription" would read as a payment that
           failed, to a family whose payment worked. */
        <ArenaPanel style={{ borderLeftWidth: 3, borderLeftColor: arena.gold }}>
          <AppText color={arena.muted}>{t("child.noSubjects")}</AppText>
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
            {/* Long az/ru heading wraps here instead of pushing the link off. */}
            <View style={{ flexShrink: 1 }}>
              <ArenaEyebrow color={arena.muted}>
                {"\u{1F3C6}"} {t("plb.title")}
              </ArenaEyebrow>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t("plb.seeFull")} onPress={goRanking} hitSlop={8}>
              <AppText color={arena.lime} variant="label">
                {t("plb.seeFull")} →
              </AppText>
            </Pressable>
          </View>
          {rankQ.isPending ? (
            <Skeleton height={48} />
          ) : lbRanked || lbProvisional ? (
            <>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <MiniStat
                  value={lbRanked ? `#${lbMe!.rank} / ${lbMe!.total}` : "—"}
                  label={t("plb.rankThisMonth")}
                />
                <MiniStat value={lbMonthPct} label={t("plb.pct")} />
                <MiniStat
                  value={`\u{1F525} ${streakCurrent}`}
                  label={`${t("plb.streak")} · ${t("plb.best")} ${streakBest}`}
                />
              </View>
              {lbProvisional ? (
                <AppText color={arena.muted} style={{ fontSize: 12 }}>
                  {t("plb.provisionalShort")}
                </AppText>
              ) : null}
            </>
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
          strength.map((s) => (
            <StrengthBar key={s.id} name={subjectLabel(t, s.code, s.name)} pct={s.pct} />
          ))
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
                  {subjectLabel(t, r.subjects?.code, r.subjects?.name)} · {t(`kind.${r.kind}`)}
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
