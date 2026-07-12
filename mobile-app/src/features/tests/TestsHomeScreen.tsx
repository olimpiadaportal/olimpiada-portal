// TEST ENGINE (M3) — tests home (web /child/test parity): subject cards from
// the child's ACCESS SET (subscription subjects + free windows), a prominent
// CONTINUE card for a live in_progress attempt, and the recent-attempts
// history with per-row status → runner/result. Locked children see the same
// "ask your parent" hint as the web arena.
import React, { useCallback, useRef } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import type { Locale } from "@/i18n";
import { useRecentAttempts, useSubjectAccess } from "./queries";
import { displayStatus, findLiveAttempt } from "./logic";
import { Eyebrow, Panel, StatusPill, tint, useArena } from "./ui";
import type { AttemptListRow } from "./types";

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

export function TestsHomeScreen() {
  const { t, locale } = useT();
  const { arena } = useArena();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const accessQ = useSubjectAccess();
  const attemptsQ = useRecentAttempts();

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
        <Skeleton height={92} />
        <Skeleton height={92} />
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
          {t("test.home.sub")}
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
            borderRadius: radius.lg,
            padding: spacing.lg,
            gap: spacing.sm,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <AppText variant="title" color={arena.ink}>
            {t("test.home.continueTitle")}
          </AppText>
          <AppText color={arena.muted} style={{ fontSize: 13 }}>
            {(live.subject_name ?? "—") + " · " + t("test.home.continueSub")}
          </AppText>
          <View
            style={{
              backgroundColor: arena.blue,
              borderRadius: radius.sm,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              alignSelf: "flex-start",
            }}
          >
            <AppText variant="label" color="#ffffff">
              {t("test.home.continueCta")}
            </AppText>
          </View>
        </Pressable>
      ) : null}

      {/* ---- Subjects ---- */}
      <AppText variant="title" color={arena.ink}>
        {t("test.home.subjects")}
      </AppText>
      {access.hasAccess && access.subjects.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          {access.subjects.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={s.name}
              onPress={() =>
                router.push({
                  pathname: "/(student)/test/[subjectId]",
                  params: { subjectId: s.id },
                })
              }
              style={({ pressed }) => ({
                backgroundColor: arena.panel,
                borderColor: arena.line,
                borderWidth: 1,
                borderRadius: radius.lg,
                padding: spacing.lg,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: tint(arena.blue, 0.16),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText variant="title" color={arena.blue}>
                  {s.name.trim()[0]?.toUpperCase() ?? "?"}
                </AppText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" color={arena.ink} style={{ fontSize: 16 }}>
                  {s.name}
                </AppText>
                <AppText color={arena.dim} style={{ fontSize: 12 }}>
                  {t("test.setup.qCount")} · {t("test.setup.duration")}
                </AppText>
              </View>
              <AppText variant="label" color={arena.lime}>
                {t("arena.go")}
              </AppText>
            </Pressable>
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

      {/* ---- Recent attempts ---- */}
      <AppText variant="title" color={arena.ink} style={{ marginTop: spacing.sm }}>
        {t("test.home.recent")}
      </AppText>
      <Panel arena={arena} style={{ padding: 0 }}>
        {recent.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <AppText color={arena.muted}>{t("test.home.noAttempts")}</AppText>
          </View>
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
        <AppText variant="label" color={arena.ink}>
          {row.subject_name ?? "—"}
        </AppText>
        <AppText color={arena.dim} style={{ fontSize: 12 }}>
          {fmtDate(when, locale)}
        </AppText>
      </View>
      {right}
    </View>
  );
}
