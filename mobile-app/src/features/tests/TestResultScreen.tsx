// TEST ENGINE (M3) — result screen (web /child/test/result parity): big score
// + %, time used, correct/wrong/SKIPPED breakdown (skipped is NEVER folded
// into wrong), per-topic bars, review CTA. The result payload comes from the
// IDEMPOTENT submit RPC with p_answers:null (returns the stored result for a
// graded attempt; finalizes one whose deadline lapsed before the client could
// auto-submit). A LIVE in_progress attempt is sent back to the player —
// visiting this route early must never end a running test. Olympiad attempts
// (kind='olympiad') use olympiad wording and exit to the Olympiads tab.
import React, { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock,
  ListChecks,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { ProgressRing } from "@/components/ProgressRing";
import { SectionHeader } from "@/components/SectionHeader";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { spacing, radius } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useAttemptRow, useTestResult } from "./queries";
import { isLiveAttempt, usedMinutes } from "./logic";
import {
  ArenaButton,
  BackBar,
  Eyebrow,
  Notice,
  Panel,
  TopicBar,
  tint,
  useArena,
} from "./ui";

const TESTS_TAB = "/(student)/(tabs)/tests" as const;
const OLYMPIADS_TAB = "/(student)/(tabs)/olympiads" as const;

export function TestResultScreen({ attemptId }: { attemptId: string }) {
  const { t } = useT();
  const { arena } = useArena();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const rowQ = useAttemptRow(attemptId);
  const row = rowQ.data ?? null;

  const isOlympiad = row?.kind === "olympiad";
  const homeTab = isOlympiad ? OLYMPIADS_TAB : TESTS_TAB;
  const kindOk =
    row !== null &&
    (row.kind === "test" || row.kind === "daily" || row.kind === "olympiad");
  // Live = timed-future OR untimed practice (Round-20 null deadline): both
  // belong in the player — probing the idempotent submit here must never
  // finalize a running attempt.
  const live = row !== null && isLiveAttempt(row, Date.now());
  const closed = row !== null && row.status !== "graded" && row.status !== "in_progress";

  // A live attempt belongs in the player, not here.
  useEffect(() => {
    if (kindOk && live) {
      router.replace({
        pathname: "/(student)/test/run/[attemptId]",
        params: { attemptId },
      });
    }
  }, [kindOk, live, attemptId, router]);

  const resultQ = useTestResult(attemptId, kindOk && !live && !closed);

  const pad = {
    paddingTop: insets.top + spacing.md,
    paddingLeft: spacing.lg + insets.left,
    paddingRight: spacing.lg + insets.right,
    paddingBottom: insets.bottom + spacing.xl,
    gap: spacing.lg,
  } as const;

  if (rowQ.isPending || live || (resultQ.isPending && kindOk && !closed)) {
    return (
      <View style={[pad, { flex: 1, backgroundColor: arena.bg }]}>
        <Skeleton height={16} width="30%" />
        <Skeleton height={26} width="60%" />
        <Skeleton height={170} />
        <Skeleton height={90} />
        <Skeleton height={160} />
      </View>
    );
  }

  if (rowQ.isError || (kindOk && !closed && resultQ.isError)) {
    return (
      <View style={{ flex: 1, backgroundColor: arena.bg, justifyContent: "center" }}>
        <ErrorRetry
          message={t("test.err.generic")}
          retryLabel={t("mob.retry")}
          onRetry={() => {
            void rowQ.refetch();
            void resultQ.refetch();
          }}
        />
      </View>
    );
  }

  if (!kindOk || closed) {
    return (
      <View style={[pad, { flex: 1, backgroundColor: arena.bg }]}>
        <Notice arena={arena} warn>
          {t("test.home.noticeClosed")}
        </Notice>
        <ArenaButton
          arena={arena}
          kind="ghost"
          title={t("test.run.back")}
          onPress={() => router.replace(homeTab)}
        />
      </View>
    );
  }

  const { result, breakdown } = resultQ.data!;
  const score = Math.round(Number(result.score ?? 0));
  const max = Math.round(Number(result.max ?? 0));
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;

  const durationMin = Math.round(Number(row!.duration_seconds ?? 1500) / 60);
  const endIso = row!.submitted_at ?? result.submitted_at;
  const usedMin = usedMinutes(row!.started_at, endIso, durationMin);

  const topics = (result.topics ?? []).filter((tp) => tp.total > 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: arena.bg }} contentContainerStyle={pad}>
      <BackBar
        arena={arena}
        label={isOlympiad ? t("test.result.backToOlympiads") : t("test.result.newTest")}
        onPress={() => router.replace(homeTab)}
      />

      <View style={{ gap: spacing.sm }}>
        <Eyebrow arena={arena}>{t("test.result.eyebrow")}</Eyebrow>
        {/* Olympiad sessions use olympiad wording, not test wording. */}
        <AppText variant="heading" color={arena.ink}>
          {isOlympiad ? t("test.result.olympiadTitle") : t("test.result.title")}
        </AppText>
        <AppText color={arena.muted} style={{ fontSize: 14 }}>
          {isOlympiad
            ? [t("test.run.olympiad"), row!.subject_name ?? ""].filter(Boolean).join(" · ")
            : (row!.subject_name ?? "")}
        </AppText>
      </View>

      {/* ---- Score hero: animated ring (score/max) with % inside ---- */}
      <Panel arena={arena} style={{ alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl }}>
        <ProgressRing
          progress={max > 0 ? score / max : 0}
          size={148}
          strokeWidth={11}
          gradient
          trackColor={arena.panel2}
        >
          <AppText variant="display" color={arena.ink} style={{ fontVariant: ["tabular-nums"] }}>
            {pct}%
          </AppText>
          <AppText variant="mono" color={arena.muted} style={{ fontSize: 15 }}>
            {score}/{max}
          </AppText>
        </ProgressRing>
        {usedMin !== null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <Clock size={14} color={arena.muted} strokeWidth={2} />
            <AppText color={arena.muted} style={{ fontSize: 13 }}>
              {t("test.result.timeSpent")}: {usedMin} {t("test.result.minutes")} / {durationMin}{" "}
              {t("test.result.minutes")}
            </AppText>
          </View>
        ) : null}
      </Panel>

      {/* ---- Correct / wrong / skipped (skipped separate — Round-18 rule) ---- */}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        {(
          [
            [breakdown.correct, t("test.review.correct"), arena.lime, CircleCheck],
            [breakdown.wrong, t("test.review.wrong"), arena.red, CircleX],
            [breakdown.skipped, t("test.review.skipped"), arena.gold, CircleMinus],
          ] as const
        ).map(([value, label, color, Glyph]) => (
          <View
            key={label}
            style={{
              flex: 1,
              backgroundColor: tint(color, 0.1),
              borderColor: tint(color, 0.4),
              borderWidth: 1,
              borderRadius: radius.md,
              paddingVertical: spacing.md,
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            <Glyph size={18} color={color} strokeWidth={2} />
            <AppText variant="mono" color={color} style={{ fontSize: 22, fontWeight: "700" }}>
              {value}
            </AppText>
            <AppText color={arena.muted} style={{ fontSize: 12 }}>
              {label}
            </AppText>
          </View>
        ))}
      </View>

      {/* ---- CTAs ---- */}
      <View style={{ gap: spacing.md }}>
        <ArenaButton
          arena={arena}
          kind="gradient"
          title={t("test.result.review")}
          icon={<ListChecks size={16} color="#ffffff" strokeWidth={2.5} />}
          onPress={() =>
            router.push({
              pathname: "/(student)/test/review/[attemptId]",
              params: { attemptId },
            })
          }
        />
        <ArenaButton
          arena={arena}
          kind="ghost"
          title={isOlympiad ? t("test.result.backToOlympiads") : t("test.result.newTest")}
          onPress={() => router.replace(homeTab)}
        />
      </View>

      {/* ---- Per-topic breakdown ---- */}
      <SectionHeader
        title={t("test.result.topics")}
        color={arena.muted}
        style={{ marginTop: spacing.sm }}
      />
      <Panel arena={arena} style={{ gap: spacing.lg }}>
        {topics.length === 0 ? (
          <AppText color={arena.muted}>{t("test.result.noTopics")}</AppText>
        ) : (
          topics.map((tp, i) => {
            const tpct = tp.total > 0 ? Math.round((tp.correct / tp.total) * 100) : 0;
            return (
              <View key={tp.topic_id ?? `t${i}`} style={{ gap: spacing.xs }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: spacing.md,
                  }}
                >
                  <AppText color={arena.ink} style={{ flex: 1, fontSize: 14 }} numberOfLines={2}>
                    {tp.name ?? "—"}
                  </AppText>
                  <AppText variant="mono" color={arena.muted} style={{ fontSize: 13 }}>
                    {tp.correct}/{tp.total}
                  </AppText>
                </View>
                <TopicBar arena={arena} pct={tpct} />
              </View>
            );
          })
        )}
      </Panel>
    </ScrollView>
  );
}
