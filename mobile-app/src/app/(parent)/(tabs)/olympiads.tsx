// OLYMPIADS tab: cover cards with a bottom gradient scrim, child selector,
// per-child "unlocked" pills and a detail sheet (grab handle, icon KeyRows).
// Question counts are the REAL published pool sizes (get_olympiad_pool_counts
// — the legacy questions_per_attempt column is display-only).
//
// BROWSE-ONLY (docs/STORE_PAYMENTS_COMPLIANCE.md, owner 2026-08-18 — the demo
// payment mode is deleted): the whole purchase path is GONE from this tab —
// no price chip, no "Əldə et" button, no confirm sheet, no purchase call. One
// binary serves both roles, so Google's consumption-only test covers the
// PARENT tabs too; packages are obtained outside the app and simply appear
// here once they are unlocked for the child. Apple rejected this app under
// Guideline 3.1.1 on 2026-08-31; restoring a Get/Purchase CTA here is the
// violation, not the fix. __tests__/olympiad-ownership.test.ts pins that.
//
// Migration 163: the catalog RPC no longer filters on the sales window alone,
// so a package the family OWNS stays on this screen after it is archived or
// its window closes (it used to vanish while the child kept solving it). The
// card's pills are resolved by resolveOlympiadCardState — an owned package
// reads OWNED, never "sales ended".
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  BookOpen,
  CalendarDays,
  CircleHelp,
  Clock3,
  GraduationCap,
  Medal,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { formatGradeLabel, formatGradeRangeLabel } from "@/lib/gradeLabel";
import { subjectLabel } from "@/lib/subjectLabel";
import { publicStorageUrl, type OlympiadPackageRow } from "@/lib/data";
import { fmtDate } from "@/features/parent/commerce";
import {
  useChildren,
  useOlympiadCatalog,
  useOlympiadPoolCounts,
  useOlympiadPurchases,
} from "@/features/parent/queries";
import { ChildChips, KeyRow, Pill, ScreenScroll, SheetShell } from "@/features/parent/ui";
import {
  buildOlympiadDetailRows,
  resolveOlympiadCardState,
  sharedGradeValue,
  type OlympiadCardState,
} from "@/features/olympiads/details";
import { TypeMarquee } from "@/features/olympiads/TypeMarquee";

function Chip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        // DB-driven labels (subject/grade names) can outgrow a 320pt card:
        // cap the chip and truncate instead of overflowing the wrap row.
        maxWidth: "100%",
        backgroundColor: tokens.chipBg,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: 3,
      }}
    >
      {icon ?? null}
      <AppText
        variant="label"
        color={tokens.chipText}
        numberOfLines={1}
        style={{ fontSize: 12, flexShrink: 1 }}
      >
        {label}
      </AppText>
    </View>
  );
}

/** Cover area: image (or brand-gradient fallback) + bottom scrim with the
 *  title. Scrim ink is the fixed contrast contract (#0a0e1a → white text) so
 *  it reads on any cover photo in any theme. The price chip that used to sit
 *  beside the title is gone — no amount renders anywhere in this app. */
function CoverHeader({
  pkg,
  pills,
}: {
  pkg: OlympiadPackageRow;
  /** Already-translated status pills from resolveOlympiadCardState. */
  pills: { key: string; label: string; tone: "ok" | "muted" }[];
}) {
  return (
    <View style={{ width: "100%", aspectRatio: 16 / 9 }}>
      {pkg.cover ? (
        <Image
          source={{ uri: publicStorageUrl(pkg.cover.bucket, pkg.cover.path) }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          accessibilityLabel={pkg.title}
          recyclingKey={pkg.id}
          transition={150}
        />
      ) : (
        <LinearGradient
          colors={[...gradients.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
        >
          <Medal size={44} color="rgba(255,255,255,0.9)" strokeWidth={1.8} />
        </LinearGradient>
      )}

      {/* Status pills float on the cover's top edge. They describe STATE only
          (owned / sales ended / already held) — none of them is tappable and
          none of them is a purchase affordance. */}
      {pills.length > 0 && (
        <View
          style={{
            position: "absolute",
            top: spacing.sm,
            right: spacing.sm,
            flexDirection: "row",
            // A 320pt cover fits two pills; a third wraps instead of running
            // off the image.
            flexWrap: "wrap",
            justifyContent: "flex-end",
            maxWidth: "70%",
            gap: spacing.sm,
          }}
        >
          {pills.map((p) => (
            <Pill key={p.key} label={p.label} tone={p.tone} />
          ))}
        </View>
      )}

      <LinearGradient
        colors={["transparent", "rgba(10,14,26,0.78)"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xxl,
          paddingBottom: spacing.md,
          flexDirection: "row",
          alignItems: "flex-end",
          gap: spacing.md,
        }}
      >
        <AppText
          variant="title"
          color="#ffffff"
          numberOfLines={2}
          style={{ flex: 1, fontSize: 18 }}
        >
          {pkg.title}
        </AppText>
      </LinearGradient>
    </View>
  );
}

export default function ParentOlympiads() {
  const { tokens } = useTheme();
  const { t, locale } = useT();
  const router = useRouter();

  const config = useMobileConfig();
  const olympiadOn = config.data?.flags.olympiadModule === true;
  const children = useChildren();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = children.data ?? [];
  const selected = list.find((c) => c.profile_id === selectedId) ?? list[0] ?? null;

  // Round 40: the catalog is scoped to the SELECTED child — the query key
  // carries the child's profile id, so tapping another chip refetches and the
  // list swaps to THAT child's grade packages. Disabled until the children
  // list has loaded and a selection exists (never a family-union flash).
  const catalog = useOlympiadCatalog(locale, selected?.profile_id ?? null, olympiadOn);
  const purchases = useOlympiadPurchases(olympiadOn);
  const poolCounts = useOlympiadPoolCounts((catalog.data ?? []).map((p) => p.id));
  // poolCounts drives the REAL question count on every card, so a pull that
  // skipped it would leave the most load-bearing number stale. The catalog
  // entry is conditional: with no selection (childless parent) the query is
  // disabled and a pull must not force-fetch the family union.
  const { refreshing, onRefresh } = usePullRefresh([
    children,
    selected ? catalog : null,
    purchases,
    poolCounts,
  ]);

  const [detail, setDetail] = useState<OlympiadPackageRow | null>(null);
  // Render-stable "now" for the past-event check (impure calls stay out of render).
  const [now] = useState(() => Date.now());

  const ownedForSelected = new Set(
    (purchases.data ?? [])
      .filter((p) => p.student_profile_id === selected?.profile_id)
      .map((p) => p.olympiad_package_id),
  );

  if (config.data && !olympiadOn) {
    return (
      <ScreenScroll>
        <GateNotice title={t("poly.title")} body={t("gate.olympiadOff")} />
      </ScreenScroll>
    );
  }

  // Boot skeleton covers config + children only: the child-scoped catalog is
  // DISABLED (pending forever) for a childless parent, so gating on it would
  // strand that parent on the skeleton instead of the add-child empty state.
  const loading = config.isPending || children.isPending;
  const catalogLoading = selected !== null && catalog.isPending;

  // Owned / on-sale / held, resolved in one pure place (details.ts) so the
  // rule "an owned package reads OWNED, not unavailable" is testable and lives
  // next to the sale-window reasoning rather than being re-derived per card.
  const cardState = (pkg: OlympiadPackageRow): OlympiadCardState =>
    resolveOlympiadCardState(pkg, ownedForSelected.has(pkg.id), now);

  // REAL pool size (missing row / still loading → 0, web coalesce parity).
  // Round 34: the catalog RPC computes the caller-relevant published count
  // (children's grade pools) server-side; the pool-counts RPC stays the
  // fallback for legacy rows that predate the target-grade backfill.
  const questionCount = (pkg: OlympiadPackageRow) =>
    pkg.my_question_count > 0 ? pkg.my_question_count : poolCounts.data?.get(pkg.id) ?? 0;

  // Migration 106: duration is stored per target grade. A parent's catalog
  // spans every child's grade, so when those grades disagree there is no single
  // honest number and the chip is dropped rather than showing one of them.
  const durationOf = (pkg: OlympiadPackageRow) =>
    sharedGradeValue(pkg.grades, pkg.duration_minutes, "duration_minutes");

  return (
    <ScreenScroll onRefresh={onRefresh} refreshing={refreshing}>
      <AppText variant="muted">{t("poly.subtitle")}</AppText>

      {loading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={36} width="70%" />
          <Skeleton height={220} />
          <Skeleton height={220} />
        </View>
      ) : children.isError || catalog.isError ? (
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={onRefresh}
        />
      ) : (
        <>
          {list.length === 0 ? (
            <EmptyState
              title={t("parent.dash.noChildren")}
              icon={<Medal size={26} color={tokens.muted} strokeWidth={2} />}
              action={{
                label: t("poly.addChild"),
                onPress: () => router.push("/(parent)/add-child"),
              }}
            />
          ) : (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="eyebrow">{t("poly.chooseChild")}</AppText>
              <ChildChips
                childrenList={list}
                selectedId={selected?.profile_id ?? null}
                onSelect={setSelectedId}
                accessibilityLabel={t("poly.chooseChild")}
              />
            </View>
          )}

          {/* One constant, mode-independent statement of fact: packages are
              not obtained here. (The old payments-off / web-account notices
              existed only to explain a missing Buy button.) */}
          <Card>
            <AppText variant="muted">{t("mob.oly.notInApp")}</AppText>
          </Card>

          {catalogLoading ? (
            // Chip switch / first child load: keep the selector mounted and
            // skeleton only the list area while THIS child's catalog arrives.
            <View style={{ gap: spacing.md }}>
              <Skeleton height={220} />
              <Skeleton height={220} />
            </View>
          ) : (catalog.data ?? []).length === 0 ? (
            <EmptyState
              title={t("poly.none")}
              icon={<Medal size={26} color={tokens.muted} strokeWidth={2} />}
            />
          ) : (
            <View style={{ gap: spacing.lg }}>
              {(catalog.data ?? []).map((pkg) => {
                const state = cardState(pkg);
                return (
                  <Card key={pkg.id} style={{ padding: 0, overflow: "hidden" }}>
                    <CoverHeader
                      pkg={pkg}
                      pills={state.pills.map((p) => ({
                        key: p.key,
                        label: t(p.labelKey),
                        tone: p.tone,
                      }))}
                    />
                    <View style={{ padding: spacing.lg, gap: spacing.md }}>
                      {/* Round 43: the olympiad type headlines the card body as
                          an overflow-aware marquee. */}
                      {pkg.typeName ? (
                        <TypeMarquee text={pkg.typeName} color={tokens.accent} />
                      ) : null}
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                        {pkg.subject?.name ? (
                          <Chip
                            icon={<BookOpen size={13} color={tokens.chipText} strokeWidth={2} />}
                            label={subjectLabel(t, pkg.subject.code, pkg.subject.name)}
                          />
                        ) : null}
                        {pkg.grades.length > 0 || pkg.grade ? (
                          <Chip
                            icon={
                              <GraduationCap size={13} color={tokens.chipText} strokeWidth={2} />
                            }
                            label={
                              pkg.grades.length > 0
                                ? formatGradeRangeLabel(
                                    pkg.grades.map((g) => g.level),
                                    locale,
                                  )
                                : formatGradeLabel(pkg.grade!.level, locale, pkg.grade!.name)
                            }
                          />
                        ) : null}
                        <Chip
                          icon={<CircleHelp size={13} color={tokens.chipText} strokeWidth={2} />}
                          label={`${questionCount(pkg)} ${t("poly.questions")}`}
                        />
                        {durationOf(pkg) !== null ? (
                          <Chip
                            icon={<Clock3 size={13} color={tokens.chipText} strokeWidth={2} />}
                            label={`${durationOf(pkg)} ${t("mob.unit.min")}`}
                          />
                        ) : null}
                      </View>
                      <KeyRow
                        icon={<CalendarDays size={16} color={tokens.muted} strokeWidth={2} />}
                        label={t("oly4.date")}
                        value={
                          pkg.event_starts_at
                            ? fmtDate(pkg.event_starts_at, locale, true)
                            : t("oly4.dateTbd")
                        }
                      />
                      <Button
                        title={t("poly.details")}
                        variant="ghost"
                        style={{ minHeight: 44, paddingVertical: spacing.sm }}
                        onPress={() => setDetail(pkg)}
                      />
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* ---- detail sheet (grab handle from SheetShell, icon KeyRows) ---- */}
      <SheetShell
        visible={detail !== null}
        onClose={() => setDetail(null)}
        closeLabel={t("poly.modal.close")}
      >
        {detail ? (
          <ScrollView contentContainerStyle={{ gap: spacing.md }}>
            <AppText variant="title">{detail.title}</AppText>
            {/* The same pills as the card: a parent who opens "Ətraflı" on a
                package they own must read OWNED here too, not an empty sheet
                that reads like a listing they missed. */}
            {cardState(detail).pills.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {cardState(detail).pills.map((p) => (
                  <Pill key={p.key} label={t(p.labelKey)} tone={p.tone} />
                ))}
              </View>
            ) : null}
            {/* Round 43: every AVAILABLE field with its poly.det.* label; a
                null/empty value is dropped (never renders "null"). */}
            <View
              style={{
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: tokens.border,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
              }}
            >
              {/* Identical rows for both roles — the builder no longer knows
                  how to render a price at all. */}
              {buildOlympiadDetailRows(detail, questionCount(detail), locale, t).map((r) => (
                <KeyRow key={r.key} label={r.label} value={r.value} />
              ))}
            </View>
            {detail.description ? (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="eyebrow">{t("poly.det.description")}</AppText>
                <AppText variant="muted">{detail.description}</AppText>
              </View>
            ) : null}
            <AppText variant="muted">
              {cardState(detail).owned
                ? t("poly.modal.already")
                : t("mob.oly.notInApp")}
            </AppText>
            <Button title={t("poly.modal.close")} variant="ghost" onPress={() => setDetail(null)} />
          </ScrollView>
        ) : null}
      </SheetShell>
    </ScreenScroll>
  );
}
