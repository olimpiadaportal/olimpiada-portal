// Student RANKING tab — native port of web /child/leaderboard (Round-20/21):
//   * board switch Points | Streak (streak is GLOBAL-only + all-time),
//   * scope chips offered ONLY for ids the child actually has (global always;
//     subject whenever the platform has an active subject; grade/city/school
//     when the students row carries the id; DISTRICT when the child's own
//     rayon resolves via school → schools.city_district_id, falling back to
//     students.city_district_id),
//   * period toggle This month | All time (points only),
//   * subject scope = single-select over ALL active subjects with a clamped
//     default (forged/missing selection falls back to the FIRST subject —
//     Round-18 contract),
//   * top-50 list with NUMERIC ranks ONLY (no medals — web Round-20 rule),
//     Avatar initials, server-formatted "Firstname L." names and the
//     city/district/school/grade context line (render as-is, never re-derive),
//   * self-row highlight + the sticky my-rank card, and the streak status card
//     with at-risk urgency. Everything arena-palette-aware.
import React, { useMemo, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { radius, shadow, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { fetchActiveSubjects } from "@/lib/data";
import { subjectLabel } from "@/lib/subjectLabel";
import { SelectField } from "@/features/profile/SelectField";
import { useAuthStore } from "@/features/auth/authStore";
import { useArena } from "@/features/arena/useArena";
import { ArenaChip, ArenaEyebrow, ArenaPanel, ArenaScroll } from "@/features/arena/ui";
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

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export function RankingScreen() {
  const { arena, theme } = useArena();
  const { t, locale } = useT();
  const config = useMobileConfig();
  const profileId = useAuthStore((s) => s.profileId);

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
      ((subjectsQ.data ?? []) as { id: string; code: string | null; name: string }[]).filter(
        (s) => !!s.id,
      ),
    [subjectsQ.data],
  );
  const gradeId = scopeIdsQ.data?.gradeId ?? null;
  const cityId = scopeIdsQ.data?.cityId ?? null;
  const districtId = scopeIdsQ.data?.districtId ?? null;
  const schoolId = scopeIdsQ.data?.schoolId ?? null;

  // Scope tabs — ONLY the scopes this child actually has (web whitelist).
  // The district chip is the child's OWN rayon and hides when none resolves.
  const scopeTabs = useMemo(() => {
    const tabs: { key: Scope; id: string | null }[] = [{ key: "global", id: null }];
    if (activeSubjects.length > 0) tabs.push({ key: "subject", id: null });
    if (gradeId) tabs.push({ key: "grade", id: gradeId });
    if (cityId) tabs.push({ key: "city", id: cityId });
    if (districtId) tabs.push({ key: "district", id: districtId });
    if (schoolId) tabs.push({ key: "school", id: schoolId });
    return tabs;
  }, [activeSubjects.length, gradeId, cityId, districtId, schoolId]);

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
            : scope === "district"
              ? districtId
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
      <ArenaScroll>
        <GateNotice title={t("lb.title")} body={t("gate.leaderboardOff")} />
      </ArenaScroll>
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

  // Context under the participant name, exactly what the web table shows
  // (points: city/district/school/grade; streak: district only — its sole
  // context column since migration 058).
  const ctxOf = (r: LbRow): string =>
    (board === "points"
      ? [
          r.city?.trim() || null,
          r.district?.trim() || null,
          r.school?.trim() || null,
          r.grade_level != null ? formatGradeLabel(r.grade_level, locale) : null,
        ]
      : [r.district?.trim() || null]
    )
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

  const selectedSubjectRow =
    scope === "subject"
      ? (activeSubjects.find((s) => s.id === subjectId) ?? null)
      : null;
  const selectedSubjectName = selectedSubjectRow
    ? subjectLabel(t, selectedSubjectRow.code, selectedSubjectRow.name)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: arena.bg }}>
      <View style={{ flex: 1 }}>
        <ArenaScroll onRefresh={onRefresh} refreshing={listQ.isRefetching}>
          <ArenaEyebrow>{t("lb.eyebrow")}</ArenaEyebrow>

          {/* Board tabs: Points | Streak (web .arena-tabs) */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ArenaChip
              label={t("lb.board.points")}
              active={board === "points"}
              onPress={() => setBoard("points")}
            />
            <ArenaChip
              label={`\u{1F525} ${t("lb.board.streak")}`}
              active={board === "streak"}
              onPress={() => setBoard("streak")}
            />
          </View>

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
                  <ArenaChip
                    key={s.key}
                    label={t(`lb.scope.${s.key}`)}
                    active={scope === s.key}
                    onPress={() => setScopeSel(s.key)}
                  />
                ))}
              </ScrollView>

              {/* Subject picker — ALL active subjects, clamped default. */}
              {scope === "subject" && activeSubjects.length > 0 ? (
                <SelectField
                  label={t("lb.subjectLabel")}
                  value={subjectId ?? ""}
                  options={activeSubjects.map((s) => ({
                    id: s.id,
                    label: subjectLabel(t, s.code, s.name),
                  }))}
                  onChange={(id) => setSubjectSel(id)}
                  placeholder={t("lb.subjectLabel")}
                />
              ) : null}

              {/* Period toggle: This month | All time */}
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <ArenaChip
                  label={t("lb.period.month")}
                  active={periodUrl === "month"}
                  onPress={() => setPeriodUrl("month")}
                />
                <ArenaChip
                  label={t("lb.period.all")}
                  active={periodUrl === "all"}
                  onPress={() => setPeriodUrl("all")}
                />
              </View>

              {selectedSubjectName ? (
                <AppText color={arena.muted}>
                  {t("lb.subjectLabel")}:{" "}
                  <AppText variant="label" color={arena.ink}>
                    {selectedSubjectName}
                  </AppText>
                </AppText>
              ) : null}
            </>
          ) : null}

          {/* Streak status card (streak board only, above the list). */}
          {board === "streak" && streak ? (
            <ArenaPanel
              style={{
                gap: spacing.md,
                borderColor: streak.state === "at_risk" ? arena.red : arena.line,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xl }}>
                <AppText style={{ fontSize: 34 }}>{"\u{1F525}"}</AppText>
                <View>
                  <AppText
                    color={arena.ink}
                    style={{ fontFamily: MONO, fontSize: 22, fontWeight: "900" }}
                  >
                    {streak.current} {t("lb.days")}
                  </AppText>
                  <AppText color={arena.dim} style={{ fontSize: 12 }}>
                    {t("lb.streak.current")}
                  </AppText>
                </View>
                <View>
                  <AppText
                    color={arena.gold}
                    style={{ fontFamily: MONO, fontSize: 22, fontWeight: "900" }}
                  >
                    {streak.best} {t("lb.days")}
                  </AppText>
                  <AppText color={arena.dim} style={{ fontSize: 12 }}>
                    {t("lb.streak.best")}
                  </AppText>
                </View>
              </View>
              {streakMsg ? (
                <AppText color={streak.state === "at_risk" ? arena.red : arena.muted}>
                  {streakMsg}
                </AppText>
              ) : null}
            </ArenaPanel>
          ) : null}

          {/* Top-50 board — numeric ranks only (web Round-20: medals removed). */}
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
            <ArenaPanel style={{ padding: spacing.sm, gap: 0 }}>
              {rows.map((r, i) => {
                const ctx = ctxOf(r);
                const name = (r.display_name ?? "").trim() || "—";
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
                      backgroundColor: r.is_self ? arena.panel2 : "transparent",
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: arena.line,
                    }}
                  >
                    <View style={{ width: 34, alignItems: "center" }}>
                      <AppText
                        color={r.rank <= 3 ? arena.lime : arena.muted}
                        style={{
                          fontFamily: MONO,
                          fontVariant: ["tabular-nums"],
                          fontWeight: r.rank <= 3 ? "900" : "400",
                        }}
                      >
                        {String(r.rank)}
                      </AppText>
                    </View>
                    <Avatar name={name} seed={r.is_self ? profileId : name} size={34} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label" color={arena.ink} numberOfLines={1}>
                        {name}
                        {r.is_self ? (
                          <AppText variant="label" color={arena.lime}>
                            {" "}
                            · {t("lb.you")}
                          </AppText>
                        ) : null}
                      </AppText>
                      {ctx ? (
                        <AppText color={arena.dim} style={{ fontSize: 11 }} numberOfLines={1}>
                          {ctx}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText
                      color={r.is_self ? arena.lime : arena.ink}
                      style={{ fontFamily: MONO, fontVariant: ["tabular-nums"], fontWeight: "700" }}
                    >
                      {fmtValue(r.value)}
                    </AppText>
                  </View>
                );
              })}
            </ArenaPanel>
          )}
        </ArenaScroll>
      </View>

      {/* Sticky "Your rank" card for the CURRENT board/scope/period. */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          backgroundColor: arena.bg,
          borderTopWidth: 1,
          borderTopColor: arena.line,
        }}
      >
        <View
          accessibilityLabel={t("lb.myRank.title")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
            backgroundColor: arena.panel,
            borderWidth: 1,
            borderColor: arena.line,
            borderRadius: radius.lg,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            ...shadow("float", theme === "dark" ? "rgba(0, 0, 0, 0.5)" : "rgba(22, 32, 58, 0.14)"),
          }}
        >
          <View style={{ gap: 2, flexShrink: 1 }}>
            <AppText color={arena.dim} style={{ fontSize: 12 }}>
              {t("lb.myRank.title")}
            </AppText>
            {me && me.rank !== null ? (
              <AppText
                color={arena.ink}
                style={{ fontFamily: MONO, fontSize: 18, fontWeight: "900" }}
              >
                #{me.rank}{" "}
                <AppText color={arena.muted} style={{ fontSize: 13 }}>
                  / {me.total}
                </AppText>
              </AppText>
            ) : (
              <AppText color={arena.muted}>{t("lb.myRank.none")}</AppText>
            )}
          </View>
          <AppText
            color={arena.lime}
            style={{ fontFamily: MONO, fontVariant: ["tabular-nums"], fontSize: 16, fontWeight: "700" }}
          >
            {me
              ? board === "points"
                ? `${Math.round(Number(me.value))} ${t("lb.pointsUnit")}`
                : `${Number(me.value)} ${t("lb.days")}`
              : "—"}
          </AppText>
        </View>
      </View>
    </View>
  );
}
