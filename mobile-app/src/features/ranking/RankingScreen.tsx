// Student RANKING tab — native port of web /child/leaderboard:
//   * board switch Points | Streak (streak is GLOBAL-only + all-time),
//   * scope chips offered ONLY for ids the child actually has (global always;
//     subject whenever the platform has an active subject; grade/city/school
//     when the students row carries the id),
//   * period toggle This month | All time (points only),
//   * subject scope = single-select over ALL active subjects with a clamped
//     default (forged/missing selection falls back to the FIRST subject —
//     Round-18 contract),
//   * top-50 list with medal top-3, server-formatted "Firstname L." names and
//     the city/school/grade context line (render as-is, never re-derive),
//   * self-row highlight + the sticky my-rank card, and the streak status card
//     with at-risk urgency.
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { Segmented } from "@/components/Segmented";
import { useTheme } from "@/theme/ThemeProvider";
import { arenaTokens, radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { fetchActiveSubjects } from "@/lib/data";
import { SelectField } from "@/features/profile/SelectField";
import { ScreenScroll } from "@/features/parent/ui";
import { useAuthStore } from "@/features/auth/authStore";
import { useArenaPalette } from "@/features/profile/useArenaPalette";
import {
  fetchLeaderboard,
  fetchMyRank,
  fetchScopeIds,
  fetchStreakStatus,
  type Board,
  type LbArgs,
  type LbRow,
  type PeriodUrl,
  type Scope,
} from "./data";

const MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"]; // 🥇 🥈 🥉

function ChipButton({
  label,
  active,
  onPress,
  activeBg,
  activeFg,
  bg,
  fg,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeBg: string;
  activeFg: string;
  bg: string;
  fg: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        backgroundColor: active ? activeBg : bg,
        borderRadius: 999,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}
    >
      <AppText variant="label" color={active ? activeFg : fg} style={{ fontSize: 13 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function RankingScreen() {
  const { theme, tokens } = useTheme();
  const { t, locale } = useT();
  const config = useMobileConfig();
  const profileId = useAuthStore((s) => s.profileId);
  const palette = useArenaPalette();
  const arena = arenaTokens(theme, palette);

  const leaderboardOn = config.data?.flags.leaderboard === true;

  const scopeIdsQ = useQuery({
    queryKey: ["student", "lb-scope-ids", profileId],
    queryFn: () => fetchScopeIds(profileId!),
    enabled: leaderboardOn && !!profileId,
    staleTime: 5 * 60_000,
  });
  const subjectsQ = useQuery({
    queryKey: ["catalog", "active-subjects"],
    queryFn: fetchActiveSubjects,
    enabled: leaderboardOn,
    staleTime: 10 * 60_000,
  });

  const [board, setBoard] = useState<Board>("points");
  const [scopeSel, setScopeSel] = useState<Scope>("global");
  const [periodUrl, setPeriodUrl] = useState<PeriodUrl>("month");
  const [subjectSel, setSubjectSel] = useState<string | null>(null);

  const activeSubjects = useMemo(
    () =>
      ((subjectsQ.data ?? []) as { id: string; name: string }[]).filter((s) => !!s.id),
    [subjectsQ.data],
  );
  const gradeId = scopeIdsQ.data?.gradeId ?? null;
  const cityId = scopeIdsQ.data?.cityId ?? null;
  const schoolId = scopeIdsQ.data?.schoolId ?? null;

  // Scope tabs — ONLY the scopes this child actually has (web whitelist).
  const scopeTabs = useMemo(() => {
    const tabs: { key: Scope; id: string | null }[] = [{ key: "global", id: null }];
    if (activeSubjects.length > 0) tabs.push({ key: "subject", id: null });
    if (gradeId) tabs.push({ key: "grade", id: gradeId });
    if (cityId) tabs.push({ key: "city", id: cityId });
    if (schoolId) tabs.push({ key: "school", id: schoolId });
    return tabs;
  }, [activeSubjects.length, gradeId, cityId, schoolId]);

  // Whitelist clamping happens at RENDER time (no state writes in effects —
  // loop-safe): an unavailable selection falls back to global; the STREAK
  // board is GLOBAL-only + all-time; the subject id clamps to the catalog.
  const requestedScope: Scope =
    scopeTabs.find((s) => s.key === scopeSel)?.key ?? "global";
  const scope: Scope = board === "streak" ? "global" : requestedScope;
  const subjectId =
    activeSubjects.find((s) => s.id === subjectSel)?.id ?? activeSubjects[0]?.id ?? null;
  const scopeId: string | null =
    scope === "global"
      ? null
      : scope === "subject"
        ? subjectId
        : scope === "grade"
          ? gradeId
          : scope === "city"
            ? cityId
            : schoolId;
  const period: LbArgs["period"] =
    board === "streak" ? "all_time" : periodUrl === "all" ? "all_time" : "month";

  const args: LbArgs = { board, scope, scopeId, period };
  const argsKey = [args.board, args.scope, args.scopeId ?? "-", args.period] as const;

  const listQ = useQuery({
    queryKey: ["student", "lb-list", ...argsKey],
    queryFn: () => fetchLeaderboard(args),
    enabled: leaderboardOn && !!profileId && !scopeIdsQ.isPending,
  });
  const meQ = useQuery({
    queryKey: ["student", "lb-me", ...argsKey],
    queryFn: () => fetchMyRank(args),
    enabled: leaderboardOn && !!profileId && !scopeIdsQ.isPending,
  });
  const streakQ = useQuery({
    queryKey: ["student", "lb-streak"],
    queryFn: fetchStreakStatus,
    enabled: leaderboardOn && !!profileId && board === "streak",
  });

  if (config.data && !leaderboardOn) {
    return (
      <ScreenScroll>
        <GateNotice title={t("lb.title")} body={t("gate.leaderboardOff")} />
      </ScreenScroll>
    );
  }

  const loading = config.isPending || scopeIdsQ.isPending || listQ.isPending;
  const rows = listQ.data ?? [];
  const me = meQ.data ?? null;
  const streak = board === "streak" ? streakQ.data ?? null : null;

  const onRefresh = () => {
    void listQ.refetch();
    void meQ.refetch();
    if (board === "streak") void streakQ.refetch();
  };

  const fmtValue = (v: number): string =>
    board === "points" ? String(Math.round(Number(v))) : `${Number(v)} ${t("lb.days")}`;

  // City · school · grade context under the participant name (points board).
  const ctxOf = (r: LbRow): string =>
    [
      r.city?.trim() || null,
      r.school?.trim() || null,
      r.grade_level != null ? formatGradeLabel(r.grade_level, locale) : null,
    ]
      .filter((p): p is string => !!p)
      .join(" · ");

  const emptyKey =
    board === "streak" ? "lb.empty.streak" : periodUrl === "month" ? "lb.empty.month" : "lb.empty.all";

  let streakMsg = "";
  if (streak) {
    if (streak.state === "at_risk") {
      const h = Math.max(1, Math.round(Number(streak.hours_until_loss ?? 0)));
      streakMsg = t("lb.streak.atRisk").replace("{h}", String(h));
    } else if (streak.state === "active") {
      streakMsg = t("lb.streak.active");
    } else {
      streakMsg = t("lb.streak.lost");
    }
  }

  const selectedSubjectName =
    scope === "subject"
      ? activeSubjects.find((s) => s.id === subjectId)?.name ?? null
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: arena.bg }}>
      <View style={{ flex: 1 }}>
        <ScreenScroll onRefresh={onRefresh} refreshing={listQ.isRefetching}>
          <AppText variant="muted" color={arena.muted} style={{ letterSpacing: 1.2, fontSize: 12 }}>
            {t("lb.eyebrow").toUpperCase()}
          </AppText>

          {/* Board tabs: Points | Streak */}
          <Segmented
            options={[
              { value: "points" as Board, label: t("lb.board.points") },
              { value: "streak" as Board, label: `\u{1F525} ${t("lb.board.streak")}` },
            ]}
            value={board}
            onChange={setBoard}
          />

          {board === "points" ? (
            <>
              {/* Scope chips — only what this child actually has. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                accessibilityLabel={t("lb.scope.global")}
                contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
              >
                {scopeTabs.map((s) => (
                  <ChipButton
                    key={s.key}
                    label={t(`lb.scope.${s.key}`)}
                    active={scope === s.key}
                    onPress={() => setScopeSel(s.key)}
                    activeBg={tokens.accent}
                    activeFg="#ffffff"
                    bg={tokens.chipBg}
                    fg={tokens.chipText}
                  />
                ))}
              </ScrollView>

              {/* Subject picker — ALL active subjects, clamped default. */}
              {scope === "subject" && activeSubjects.length > 0 ? (
                <SelectField
                  label={t("lb.subjectLabel")}
                  value={subjectId ?? ""}
                  options={activeSubjects.map((s) => ({ id: s.id, label: s.name }))}
                  onChange={(id) => setSubjectSel(id)}
                  placeholder={t("lb.subjectLabel")}
                />
              ) : null}

              {/* Period toggle: This month | All time */}
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <ChipButton
                  label={t("lb.period.month")}
                  active={periodUrl === "month"}
                  onPress={() => setPeriodUrl("month")}
                  activeBg={tokens.accent}
                  activeFg="#ffffff"
                  bg={tokens.chipBg}
                  fg={tokens.chipText}
                />
                <ChipButton
                  label={t("lb.period.all")}
                  active={periodUrl === "all"}
                  onPress={() => setPeriodUrl("all")}
                  activeBg={tokens.accent}
                  activeFg="#ffffff"
                  bg={tokens.chipBg}
                  fg={tokens.chipText}
                />
              </View>

              {selectedSubjectName ? (
                <AppText variant="muted">
                  {t("lb.subjectLabel")}: <AppText variant="label">{selectedSubjectName}</AppText>
                </AppText>
              ) : null}
            </>
          ) : null}

          {/* Streak status card (streak board only, above the list). */}
          {board === "streak" && streak ? (
            <Card
              style={{
                gap: spacing.md,
                borderColor: streak.state === "at_risk" ? tokens.warn : tokens.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xl }}>
                <AppText style={{ fontSize: 34 }}>{"\u{1F525}"}</AppText>
                <View>
                  <AppText variant="title" style={{ fontSize: 20 }}>
                    {streak.current} {t("lb.days")}
                  </AppText>
                  <AppText variant="muted" style={{ fontSize: 12 }}>
                    {t("lb.streak.current")}
                  </AppText>
                </View>
                <View>
                  <AppText variant="title" style={{ fontSize: 20 }} color={arena.gold}>
                    {streak.best} {t("lb.days")}
                  </AppText>
                  <AppText variant="muted" style={{ fontSize: 12 }}>
                    {t("lb.streak.best")}
                  </AppText>
                </View>
              </View>
              {streakMsg ? (
                <AppText
                  variant="muted"
                  color={streak.state === "at_risk" ? tokens.warn : tokens.muted}
                >
                  {streakMsg}
                </AppText>
              ) : null}
            </Card>
          ) : null}

          {/* Top-50 board */}
          {loading ? (
            <View style={{ gap: spacing.md }}>
              <Skeleton height={52} />
              <Skeleton height={52} />
              <Skeleton height={52} />
              <Skeleton height={52} />
            </View>
          ) : listQ.isError ? (
            <ErrorRetry
              message={t("mob.boot.error")}
              retryLabel={t("mob.retry")}
              onRetry={onRefresh}
            />
          ) : rows.length === 0 ? (
            <EmptyState title={t(emptyKey)} />
          ) : (
            <Card style={{ padding: spacing.sm, gap: 0 }}>
              {rows.map((r, i) => {
                const ctx = board === "points" ? ctxOf(r) : "";
                return (
                  <View
                    key={`${r.rank}-${i}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.sm,
                      backgroundColor: r.is_self ? tokens.chipBg : "transparent",
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: tokens.border,
                    }}
                  >
                    <View style={{ width: 34, alignItems: "center" }}>
                      {r.rank <= 3 ? (
                        <AppText style={{ fontSize: 20 }} accessibilityLabel={String(r.rank)}>
                          {MEDALS[r.rank - 1]}
                        </AppText>
                      ) : (
                        <AppText variant="mono" color={tokens.muted}>
                          {String(r.rank).padStart(2, "0")}
                        </AppText>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label" numberOfLines={1}>
                        {(r.display_name ?? "").trim() || "—"}
                        {r.is_self ? (
                          <AppText variant="label" color={tokens.accent}>
                            {" "}
                            · {t("lb.you")}
                          </AppText>
                        ) : null}
                      </AppText>
                      {ctx ? (
                        <AppText variant="muted" style={{ fontSize: 11 }} numberOfLines={1}>
                          {ctx}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText variant="mono" color={r.is_self ? tokens.accent : tokens.text}>
                      {fmtValue(r.value)}
                    </AppText>
                  </View>
                );
              })}
            </Card>
          )}
        </ScreenScroll>
      </View>

      {/* Sticky "Your rank" card for the CURRENT board/scope/period. */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          backgroundColor: arena.bg,
          borderTopWidth: 1,
          borderTopColor: tokens.border,
        }}
      >
        <Card
          accessibilityLabel={t("lb.myRank.title")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
            paddingVertical: spacing.md,
          }}
        >
          <View style={{ gap: 2, flexShrink: 1 }}>
            <AppText variant="muted" style={{ fontSize: 12 }}>
              {t("lb.myRank.title")}
            </AppText>
            {me && me.rank !== null ? (
              <AppText variant="title" style={{ fontSize: 18 }}>
                #{me.rank}{" "}
                <AppText variant="muted" style={{ fontSize: 13 }}>
                  / {me.total}
                </AppText>
              </AppText>
            ) : (
              <AppText variant="muted">{t("lb.myRank.none")}</AppText>
            )}
          </View>
          <AppText variant="mono" color={tokens.accent} style={{ fontSize: 16 }}>
            {me
              ? board === "points"
                ? `${Math.round(Number(me.value))} ${t("lb.pointsUnit")}`
                : `${Number(me.value)} ${t("lb.days")}`
              : "—"}
          </AppText>
        </Card>
      </View>
    </View>
  );
}
