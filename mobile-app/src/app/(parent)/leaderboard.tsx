// Parent full leaderboard — native port of web /leaderboard (parent panel):
// the SAME top-50 board the student arena shows (points | streak, month |
// all_time, global/subject/grade/city/district/school scopes) but with
// CATALOG-driven filters — a parent is not scoped to one child, so grades come
// from the grades catalog, cities from the cities catalog and district/school
// cascade from the selected city. Every selection is clamped at render time
// against the ACTIVE catalogs before touching an RPC (web whitelist parity;
// forged/unknown ids fall back to the first catalog entry). Below the board:
// "Övladlarınızın mövqeyi" — the selected child's #rank/total + value under
// the CURRENT filters via get_child_leaderboard_position (the RPC re-verifies
// the parent↔child link in-body); multiple children get the Avatar chip picker.
import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { fetchActiveSubjects } from "@/lib/data";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { subjectLabel } from "@/lib/subjectLabel";
import { SelectField } from "@/features/profile/SelectField";
import { BoardRowList, lbFormatValue } from "@/features/ranking/BoardList";
import {
  fetchChildLeaderboardPosition,
  fetchLeaderboard,
  type Board,
  type LbArgs,
  type PeriodUrl,
  type Scope,
} from "@/features/ranking/data";
import {
  useChildren,
  useCities,
  useCityDistricts,
  useGrades,
  useSchools,
} from "@/features/parent/queries";
import { ChildChips, childDisplayName, ScreenScroll } from "@/features/parent/ui";

/** Token-themed filter chip (the parent-surface twin of ArenaChip). */
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: tokens.pillBg }}
      style={({ pressed }) => ({
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        minHeight: 40,
        justifyContent: "center",
        borderRadius: 999,
        backgroundColor: active ? tokens.accent : tokens.chipBg,
        borderWidth: 1,
        borderColor: active ? tokens.accent : tokens.border,
        opacity: pressed ? 0.85 : 1,
        overflow: "hidden",
      })}
    >
      <AppText variant="label" color={active ? "#ffffff" : tokens.chipText}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function ParentLeaderboard() {
  const { tokens } = useTheme();
  const { t, locale } = useT();
  const router = useRouter();
  const config = useMobileConfig();

  const leaderboardOn = config.data?.flags.leaderboard === true;

  // ---- catalogs (world-readable; the same sources the Add-Child flow uses) --
  const subjectsQ = useQuery({
    queryKey: ["catalog", "active-subjects"],
    queryFn: fetchActiveSubjects,
    enabled: leaderboardOn,
    staleTime: 10 * 60_000,
  });
  const gradesQ = useGrades();
  const citiesQ = useCities();
  const rayonsQ = useCityDistricts();

  const [board, setBoard] = useState<Board>("points");
  const [scopeSel, setScopeSel] = useState<Scope>("global");
  const [periodUrl, setPeriodUrl] = useState<PeriodUrl>("month");
  const [subjectSel, setSubjectSel] = useState<string | null>(null);
  const [gradeSel, setGradeSel] = useState<string | null>(null);
  const [citySel, setCitySel] = useState<string | null>(null);
  const [districtSel, setDistrictSel] = useState<string | null>(null);
  const [schoolSel, setSchoolSel] = useState<string | null>(null);
  const [childSel, setChildSel] = useState<string | null>(null);

  const activeSubjects = (
    (subjectsQ.data ?? []) as { id: string; code: string | null; name: string }[]
  ).filter((s) => !!s.id);
  const grades = ((gradesQ.data ?? []) as { id: string; level: number; name: string }[]).filter(
    (g) => !!g.id,
  );
  const cities = ((citiesQ.data ?? []) as { id: string; name: string }[]).filter((c) => !!c.id);
  const allRayons = rayonsQ.data ?? [];
  const hasDistricts = allRayons.length > 0;

  // ---- render-time whitelists (web parity — no state writes in effects) ----
  const scopeTabs: Scope[] = [
    "global",
    ...(activeSubjects.length > 0 ? (["subject"] as Scope[]) : []),
    ...(grades.length > 0 ? (["grade"] as Scope[]) : []),
    ...(cities.length > 0 ? (["city"] as Scope[]) : []),
    ...(cities.length > 0 && hasDistricts ? (["district"] as Scope[]) : []),
    ...(cities.length > 0 ? (["school"] as Scope[]) : []),
  ];
  const requestedScope: Scope = scopeTabs.find((s) => s === scopeSel) ?? "global";
  // The STREAK board is GLOBAL-only — the RPC rejects any other scope.
  const scope: Scope = board === "streak" ? "global" : requestedScope;

  // Forged/unknown selections clamp to the FIRST catalog entry so a scoped
  // board never renders blank and no raw string ever reaches an RPC.
  const subjectId =
    activeSubjects.find((s) => s.id === subjectSel)?.id ?? activeSubjects[0]?.id ?? null;
  const gradeId = grades.find((g) => g.id === gradeSel)?.id ?? grades[0]?.id ?? null;
  const cityId = cities.find((c) => c.id === citySel)?.id ?? cities[0]?.id ?? null;

  // City → district / city → school cascades; schools load only for their own
  // scope (the web page fetches its dependent catalogs the same lazy way).
  const cityRayons = allRayons.filter((d) => d.city_id === cityId);
  const schoolsQ = useSchools(scope === "school" ? (cityId ?? "") : "");
  const citySchools = ((schoolsQ.data ?? []) as { id: string; name: string }[]).filter(
    (s) => !!s.id,
  );
  const districtId =
    cityRayons.find((d) => d.id === districtSel)?.id ?? cityRayons[0]?.id ?? null;
  const schoolId =
    citySchools.find((s) => s.id === schoolSel)?.id ?? citySchools[0]?.id ?? null;

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

  // A scoped board whose catalog turned out empty has no valid id — render the
  // empty state without calling the RPCs (lb_rows rejects null scoped ids).
  const scopeUsable = scope === "global" || scopeId !== null;

  const args: LbArgs = { board, scope, scopeId, period };
  const argsKey = [args.board, args.scope, args.scopeId ?? "-", args.period] as const;

  const listQ = useQuery({
    queryKey: ["parent", "lb-list", ...argsKey],
    queryFn: () => fetchLeaderboard(args),
    enabled: leaderboardOn && scopeUsable,
  });

  // ---- the parent's own linked children + the selected child's position ----
  const childrenQ = useChildren();
  const kids = childrenQ.data ?? [];
  const childId =
    kids.find((k) => k.profile_id === childSel)?.profile_id ?? kids[0]?.profile_id ?? null;
  const posQ = useQuery({
    queryKey: ["parent", "lb-pos", childId ?? "-", ...argsKey],
    queryFn: () => fetchChildLeaderboardPosition(childId!, args),
    enabled: leaderboardOn && scopeUsable && !!childId,
  });

  // The board query is enabled-gated, so its own isRefetching flag can never
  // turn on while the scope is unusable — the hook's boolean always does.
  const { refreshing, onRefresh } = usePullRefresh([listQ, childrenQ, childId ? posQ : null]);

  if (config.data && !leaderboardOn) {
    return (
      <ScreenScroll>
        <GateNotice title={t("lb.title")} body={t("gate.leaderboardOff")} />
      </ScreenScroll>
    );
  }

  const scopeCatalogPending =
    scope === "subject"
      ? subjectsQ.isPending
      : scope === "grade"
        ? gradesQ.isPending
        : scope === "city"
          ? citiesQ.isPending
          : scope === "district"
            ? citiesQ.isPending || rayonsQ.isPending
            : scope === "school"
              ? citiesQ.isPending || schoolsQ.isPending
              : false;
  const boardLoading =
    config.isPending || scopeCatalogPending || (scopeUsable && listQ.isPending);
  const rows = scopeUsable ? (listQ.data ?? []) : [];

  const selectedChild = kids.find((k) => k.profile_id === childId) ?? null;
  const pos = posQ.data ?? null;
  const childMeta = selectedChild
    ? [
        selectedChild.grade
          ? formatGradeLabel(selectedChild.grade.level, locale, selectedChild.grade.name)
          : null,
        selectedChild.school?.name?.trim() || null,
      ]
        .filter((x): x is string => !!x && x !== "—")
        .join(" · ")
    : "";

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={onRefresh}>
      {/* Board switch: Points | Streak */}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Chip
          label={t("lb.board.points")}
          active={board === "points"}
          onPress={() => setBoard("points")}
        />
        <Chip
          label={`\u{1F525} ${t("lb.board.streak")}`}
          active={board === "streak"}
          onPress={() => setBoard("streak")}
        />
      </View>

      {board === "points" ? (
        <>
          {/* Scope chips — catalog-driven (parents see every scope). */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={t("lb.scope.global")}
            contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
          >
            {scopeTabs.map((s) => (
              <Chip
                key={s}
                label={t(`lb.scope.${s}`)}
                active={scope === s}
                onPress={() => setScopeSel(s)}
              />
            ))}
          </ScrollView>

          {/* Per-scope pickers — options come straight from the catalogs. */}
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

          {scope === "grade" && grades.length > 0 ? (
            <SelectField
              label={t("lb.colGrade")}
              value={gradeId ?? ""}
              options={grades.map((g) => ({
                id: g.id,
                label: formatGradeLabel(g.level, locale, g.name),
              }))}
              onChange={(id) => setGradeSel(id)}
              placeholder={t("lb.colGrade")}
            />
          ) : null}

          {(scope === "city" || scope === "district" || scope === "school") &&
          cities.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              <SelectField
                label={t("lb.colCity")}
                value={cityId ?? ""}
                options={cities.map((c) => ({ id: c.id, label: c.name }))}
                onChange={(id) => {
                  setCitySel(id);
                  // Switching city drops the dependent rayon/school so they
                  // re-clamp to the new city's catalog (web cascade parity).
                  setDistrictSel(null);
                  setSchoolSel(null);
                }}
                placeholder={t("lb.colCity")}
              />
              {scope === "district" && cityRayons.length > 0 ? (
                <SelectField
                  label={t("lb.colDistrict")}
                  value={districtId ?? ""}
                  options={cityRayons.map((d) => ({ id: d.id, label: d.name }))}
                  onChange={(id) => setDistrictSel(id)}
                  placeholder={t("lb.colDistrict")}
                />
              ) : null}
              {scope === "school" && citySchools.length > 0 ? (
                <SelectField
                  label={t("lb.colSchool")}
                  value={schoolId ?? ""}
                  options={citySchools.map((s) => ({ id: s.id, label: s.name }))}
                  onChange={(id) => setSchoolSel(id)}
                  placeholder={t("lb.colSchool")}
                />
              ) : null}
            </View>
          ) : null}

          {/* Period toggle: This month | All time */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Chip
              label={t("lb.period.month")}
              active={periodUrl === "month"}
              onPress={() => setPeriodUrl("month")}
            />
            <Chip
              label={t("lb.period.all")}
              active={periodUrl === "all"}
              onPress={() => setPeriodUrl("all")}
            />
          </View>
        </>
      ) : null}

      {/* Top-50 board — numeric ranks only (web Round-20: medals removed). */}
      {boardLoading ? (
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
        <Card>
          <EmptyState title={t("plb.board.empty")} />
        </Card>
      ) : (
        <Card style={{ padding: spacing.sm, gap: 0 }}>
          <BoardRowList
            rows={rows}
            board={board}
            t={t}
            locale={locale}
            colors={{
              ink: tokens.text,
              muted: tokens.muted,
              dim: tokens.muted,
              line: tokens.border,
              selfBg: tokens.chipBg,
              highlight: tokens.accent,
            }}
          />
        </Card>
      )}

      {/* "Övladlarınızın mövqeyi" — the selected child under the CURRENT
          filters; the chip picker appears once the family has 2+ children. */}
      <SectionHeader title={t("plb.pos.title")} />
      {childrenQ.isPending ? (
        <Skeleton height={72} />
      ) : childrenQ.isError ? (
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => void childrenQ.refetch()}
        />
      ) : kids.length === 0 ? (
        <Card style={{ gap: spacing.md }}>
          <AppText variant="muted">{t("plb.pos.noChildren")}</AppText>
          <Button
            title={t("parent.dash.addChild")}
            variant="ghost"
            onPress={() => router.push("/(parent)/add-child")}
          />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {kids.length > 1 ? (
            <ChildChips
              childrenList={kids}
              selectedId={childId}
              onSelect={setChildSel}
              accessibilityLabel={t("ana.childLabel")}
            />
          ) : null}
          {selectedChild ? (
            <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Avatar
                name={childDisplayName(selectedChild)}
                seed={selectedChild.profile_id}
                size={40}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" numberOfLines={1}>
                  {childDisplayName(selectedChild)}
                </AppText>
                <AppText variant="muted" style={{ fontSize: 12 }} numberOfLines={1}>
                  {childMeta || "—"}
                </AppText>
              </View>
              {!scopeUsable || (!posQ.isPending && (!pos || pos.rank === null)) ? (
                <AppText
                  variant="muted"
                  style={{ flexShrink: 1, textAlign: "right", fontSize: 12 }}
                >
                  {t("plb.pos.notInFilter")}
                </AppText>
              ) : posQ.isPending ? (
                <Skeleton height={32} width="25%" />
              ) : (
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <AppText variant="mono" color={tokens.accent} style={{ fontWeight: "700" }}>
                    #{pos!.rank}{" "}
                    <AppText variant="mono" color={tokens.muted} style={{ fontSize: 12 }}>
                      / {pos!.total}
                    </AppText>
                  </AppText>
                  <AppText variant="muted" style={{ fontSize: 12 }}>
                    {board === "points"
                      ? `${lbFormatValue(board, pos!.value, t)} ${t("lb.pointsUnit")}`
                      : lbFormatValue(board, pos!.value, t)}
                  </AppText>
                </View>
              )}
            </Card>
          ) : null}
        </View>
      )}
    </ScreenScroll>
  );
}
