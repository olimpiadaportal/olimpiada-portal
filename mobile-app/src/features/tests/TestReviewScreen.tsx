// TEST ENGINE (M3) — post-grading answer review (web /child/test/review +
// TestReviewList parity). get_test_review is the ONLY payload carrying answer
// keys — owner + GRADED attempts only (the RPC raises otherwise → error state
// here). Filter tabs All/Correct/Wrong/SKIPPED (skipped ≠ wrong; counts from
// the same classification as the result breakdown); cards keep their REAL
// question number when filtered. The payload lives in the in-memory query
// cache only and is dropped the moment this screen closes (gcTime 0) — it is
// NEVER persisted to disk (anti-cheat rule).
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, CircleMinus, Lightbulb, X } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { radius, spacing, type ArenaTokens } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { publicStorageUrl } from "@/lib/data";
import { useAttemptRow, useTestReview } from "./queries";
import {
  LETTERS,
  classifyReviewQuestion,
  reviewCounts,
  type ReviewState,
} from "./logic";
import type { ReviewQuestion } from "./types";
import { QuestionImage } from "./QuestionImage";
import {
  ArenaButton,
  BackBar,
  Eyebrow,
  Panel,
  StatusPill,
  tint,
  useArena,
} from "./ui";

const TESTS_TAB = "/(student)/(tabs)/tests" as const;
const OLYMPIADS_TAB = "/(student)/(tabs)/olympiads" as const;

type Filter = "all" | ReviewState;

type Shaped = { q: ReviewQuestion; state: ReviewState; index: number };

export function TestReviewScreen({ attemptId }: { attemptId: string }) {
  const { t, locale } = useT();
  const { arena } = useArena();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // kind is not in the review payload — the own attempt row decides the exit
  // tab (olympiad reviews leave to Olympiads; web parity).
  const rowQ = useAttemptRow(attemptId);
  const reviewQ = useTestReview(attemptId, locale);
  const [filter, setFilter] = useState<Filter>("all");

  const isOlympiad = rowQ.data?.kind === "olympiad";
  const homeTab = isOlympiad ? OLYMPIADS_TAB : TESTS_TAB;

  const shaped: Shaped[] = useMemo(
    () =>
      (reviewQ.data?.questions ?? []).map((q, index) => ({
        q,
        state: classifyReviewQuestion(q),
        index,
      })),
    [reviewQ.data],
  );
  const counts = useMemo(
    () => reviewCounts(shaped.map((s) => s.state)),
    [shaped],
  );
  const visible = useMemo(
    () => shaped.filter((s) => filter === "all" || s.state === filter),
    [shaped, filter],
  );

  const pad = {
    paddingTop: insets.top + spacing.md,
    paddingLeft: spacing.lg + insets.left,
    paddingRight: spacing.lg + insets.right,
    paddingBottom: insets.bottom + spacing.xl,
  } as const;

  if (reviewQ.isPending || rowQ.isPending) {
    return (
      <View style={[pad, { flex: 1, backgroundColor: arena.bg, gap: spacing.lg }]}>
        <Skeleton height={16} width="30%" />
        <Skeleton height={26} width="60%" />
        <Skeleton height={40} />
        <Skeleton height={220} />
        <Skeleton height={220} />
      </View>
    );
  }

  // Not graded yet / not the owner → the RPC raises (web bounces home).
  if (reviewQ.isError || !reviewQ.data) {
    return (
      <View style={{ flex: 1, backgroundColor: arena.bg, justifyContent: "center", gap: spacing.lg }}>
        <ErrorRetry
          message={t("test.err.generic")}
          retryLabel={t("mob.retry")}
          onRetry={() => void reviewQ.refetch()}
        />
        <ArenaButton
          arena={arena}
          kind="ghost"
          title={t("test.run.back")}
          onPress={() => router.replace(homeTab)}
          style={{ marginHorizontal: spacing.xl }}
        />
      </View>
    );
  }

  const review = reviewQ.data;
  const score = Math.round(Number(review.score ?? 0));
  const max = Math.round(Number(review.max ?? 0));

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: t("test.review.filterAll"), count: counts.all },
    { id: "correct", label: t("test.review.filterCorrect"), count: counts.correct },
    { id: "wrong", label: t("test.review.filterWrong"), count: counts.wrong },
    { id: "skipped", label: t("test.review.filterSkipped"), count: counts.skipped },
  ];

  const header = (
    <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
      <BackBar
        arena={arena}
        label={t("test.review.backToResult")}
        onPress={() => {
          if (router.canGoBack()) router.back();
          else
            router.replace({
              pathname: "/(student)/test/result/[attemptId]",
              params: { attemptId },
            });
        }}
      />
      <View style={{ gap: spacing.sm }}>
        <Eyebrow arena={arena}>{t("test.result.eyebrow")}</Eyebrow>
        <AppText variant="heading" color={arena.ink}>
          {t("test.review.title")}
        </AppText>
        <AppText variant="mono" color={arena.muted} style={{ fontSize: 16 }}>
          {score}/{max}
        </AppText>
      </View>

      {/* ---- Filter tabs (All / Correct / Wrong / Skipped) ---- */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {tabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              onPress={() => setFilter(tab.id)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                borderWidth: 1,
                borderColor: active ? arena.blue : arena.line,
                backgroundColor: active ? arena.blue : arena.panel,
                borderRadius: 999,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.lg,
                minHeight: 40,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <AppText
                variant="label"
                color={active ? "#ffffff" : arena.muted}
                style={{ fontSize: 13 }}
              >
                {tab.label}
              </AppText>
              <View
                style={{
                  backgroundColor: active ? "rgba(255,255,255,0.22)" : arena.panel2,
                  borderRadius: 999,
                  paddingVertical: 1,
                  paddingHorizontal: spacing.sm,
                  minWidth: 22,
                  alignItems: "center",
                }}
              >
                <AppText
                  variant="mono"
                  color={active ? "#ffffff" : arena.dim}
                  style={{ fontSize: 12 }}
                >
                  {tab.count}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const footer = (
    <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
      <ArenaButton
        arena={arena}
        title={t("test.review.backToResult")}
        onPress={() => {
          if (router.canGoBack()) router.back();
          else
            router.replace({
              pathname: "/(student)/test/result/[attemptId]",
              params: { attemptId },
            });
        }}
      />
      <ArenaButton
        arena={arena}
        kind="ghost"
        title={isOlympiad ? t("test.result.backToOlympiads") : t("test.result.newTest")}
        onPress={() => router.replace(homeTab)}
      />
    </View>
  );

  return (
    // No pull-to-refresh: the review payload is handed over in memory and is
    // never persisted, so there is nothing a re-read could fetch.
    <FlatList
      style={{ flex: 1, backgroundColor: arena.bg }}
      contentContainerStyle={pad}
      data={visible}
      keyExtractor={(s) => s.q.question_id}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
      renderItem={({ item }) => <ReviewCard arena={arena} item={item} />}
    />
  );
}

function ReviewCard({ arena, item }: { arena: ArenaTokens; item: Shaped }) {
  const { t } = useT();
  const { q, state, index } = item;
  const selected = new Set(q.selected_option_ids ?? []);
  const stateColor =
    state === "correct" ? arena.lime : state === "wrong" ? arena.red : arena.gold;
  const pillIcon =
    state === "correct" ? (
      <Check size={12} color={arena.lime} strokeWidth={3} />
    ) : state === "wrong" ? (
      <X size={12} color={arena.red} strokeWidth={3} />
    ) : (
      <CircleMinus size={12} color={arena.dim} strokeWidth={2.5} />
    );

  return (
    <Panel
      arena={arena}
      style={{
        gap: spacing.md,
        borderColor: tint(stateColor, 0.35),
        // Verdict accent edge (web review-card parity).
        borderLeftWidth: 3,
        borderLeftColor: tint(stateColor, 0.8),
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Real position in the attempt, even when filtered (web parity). */}
        <AppText variant="mono" color={arena.dim} style={{ fontSize: 13 }}>
          Q{String(index + 1).padStart(2, "0")}
        </AppText>
        <StatusPill
          arena={arena}
          tone={state === "correct" ? "ok" : state === "wrong" ? "bad" : "off"}
          label={t(`test.review.${state}`)}
          icon={pillIcon}
        />
      </View>

      <AppText color={arena.ink} style={{ fontSize: 16, lineHeight: 23 }}>
        {q.body ?? ""}
      </AppText>
      {/* Question figure between body and options (web TestReviewList parity;
          close label mirrors the web review: test.img.close). */}
      {q.image?.bucket && q.image.path ? (
        <QuestionImage
          arena={arena}
          url={publicStorageUrl(q.image.bucket, q.image.path)}
          alt={t("test.img.alt")}
          hint={t("test.img.hint")}
          closeLabel={t("test.img.close")}
        />
      ) : null}
      {q.prompt ? (
        <AppText color={arena.muted} style={{ fontSize: 14, lineHeight: 20 }}>
          {q.prompt}
        </AppText>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {q.options.map((o, oi) => {
          const isSelected = selected.has(o.option_id);
          const border = o.is_correct
            ? tint(arena.lime, 0.6)
            : isSelected
              ? tint(arena.red, 0.6)
              : arena.line;
          const bg = o.is_correct
            ? tint(arena.lime, 0.1)
            : isSelected
              ? tint(arena.red, 0.1)
              : arena.panel2;
          const chipColor = o.is_correct ? arena.lime : isSelected ? arena.red : null;
          return (
            <View
              key={o.option_id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                borderWidth: 1,
                borderColor: border,
                backgroundColor: bg,
                borderRadius: radius.md,
                padding: spacing.md,
                minHeight: 48,
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: radius.sm,
                  backgroundColor: chipColor ? tint(chipColor, 0.16) : arena.panel,
                  borderWidth: chipColor ? 0 : 1,
                  borderColor: arena.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText
                  variant="label"
                  color={chipColor ?? arena.muted}
                  style={{ fontSize: 13 }}
                >
                  {LETTERS[oi] ?? String(oi + 1)}
                </AppText>
              </View>
              <AppText color={arena.ink} style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                {o.text ?? ""}
              </AppText>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                {isSelected ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    {!o.is_correct ? (
                      <X size={11} color={arena.red} strokeWidth={3} />
                    ) : null}
                    <AppText
                      color={o.is_correct ? arena.muted : arena.red}
                      style={{ fontSize: 11 }}
                    >
                      {t("test.review.your")}
                    </AppText>
                  </View>
                ) : null}
                {o.is_correct ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Check size={11} color={arena.lime} strokeWidth={3} />
                    <AppText variant="label" color={arena.lime} style={{ fontSize: 11 }}>
                      {t("test.review.correctAnswer")}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {q.explanation ? (
        <View
          style={{
            backgroundColor: arena.panel2,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: arena.line,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <Lightbulb size={14} color={arena.gold} strokeWidth={2} />
            <AppText variant="label" color={arena.ink} style={{ fontSize: 13 }}>
              {t("test.review.explanation")}
            </AppText>
          </View>
          <AppText color={arena.muted} style={{ fontSize: 14, lineHeight: 20 }}>
            {q.explanation}
          </AppText>
        </View>
      ) : null}
    </Panel>
  );
}
