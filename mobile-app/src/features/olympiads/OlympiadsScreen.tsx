// Student OLYMPIADS tab — native port of web /child/olympiads:
//   1) "Planned olympiads": ACTIVE packages the child does NOT own — cards with
//      cover / subject + grade chips / status chip / event date / duration +
//      question count and a detail sheet carrying the "ask your parent" note.
//      Children can NEVER purchase, so no price CTA exists anywhere here.
//   2) "My olympiads": owned purchases with the solve/continue CTA →
//      start_olympiad_attempt → the SHARED runner (/(student)/test/run/[id]).
// A still-running attempt (server deadline in the future) surfaces as a
// CONTINUE card on top, exactly like the web page.
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { arenaTokens, radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { fetchOlympiadCatalog, publicStorageUrl, type OlympiadPackageRow } from "@/lib/data";
import { fmtDate } from "@/features/parent/commerce";
import { KeyRow, ScreenScroll, SheetShell } from "@/features/parent/ui";
import { useAuthStore } from "@/features/auth/authStore";
import { useArenaPalette } from "@/features/profile/useArenaPalette";
import {
  fetchLiveOlympiadAttempt,
  fetchOwnedOlympiads,
  startOlympiadAttempt,
  type OwnedOlympiad,
} from "./data";

type StatusKind = "upcoming" | "planned" | "held";

function statusOf(pkg: OlympiadPackageRow, now: number): { kind: StatusKind; ts: number } {
  const ts = pkg.event_starts_at ? Date.parse(pkg.event_starts_at) : NaN;
  if (!Number.isFinite(ts)) return { kind: "planned", ts: Number.MAX_SAFE_INTEGER };
  return { kind: ts > now ? "upcoming" : "held", ts };
}

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: 2,
      }}
    >
      <AppText variant="label" color={color} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

export function OlympiadsScreen() {
  const { theme, tokens } = useTheme();
  const { t, locale } = useT();
  const router = useRouter();
  const config = useMobileConfig();
  const profileId = useAuthStore((s) => s.profileId);
  const palette = useArenaPalette();
  const arena = arenaTokens(theme, palette);

  const olympiadOn = config.data?.flags.olympiadModule === true;

  const catalogQ = useQuery({
    queryKey: ["student", "oly-catalog", locale],
    queryFn: () => fetchOlympiadCatalog(locale),
    enabled: olympiadOn,
  });
  const ownedQ = useQuery({
    queryKey: ["student", "oly-owned", profileId, locale],
    queryFn: () => fetchOwnedOlympiads(profileId!, locale),
    enabled: olympiadOn && !!profileId,
  });
  const liveQ = useQuery({
    queryKey: ["student", "oly-live", profileId],
    queryFn: () => fetchLiveOlympiadAttempt(profileId!),
    enabled: olympiadOn && !!profileId,
    staleTime: 0,
  });

  const [detail, setDetail] = useState<OlympiadPackageRow | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  // Render-stable "now" for status chips (impure calls stay out of render).
  const [now] = useState(() => Date.now());

  const ownedIds = useMemo(
    () => new Set((ownedQ.data ?? []).map((o) => o.packageId)),
    [ownedQ.data],
  );

  // Planned = active packages the child does not own; upcoming (soonest first)
  // → undated "planned" → already-held (web sort contract).
  const planned = useMemo(() => {
    const rank: Record<StatusKind, number> = { upcoming: 0, planned: 1, held: 2 };
    return (catalogQ.data ?? [])
      .filter((p) => !ownedIds.has(p.id))
      .map((p) => ({ pkg: p, ...statusOf(p, now) }))
      .sort((a, b) => rank[a.kind] - rank[b.kind] || a.ts - b.ts);
  }, [catalogQ.data, ownedIds, now]);

  const live = liveQ.data ?? null;

  // Loop-safe start: one in-flight start at a time, navigation exactly once.
  const handleStart = useCallback(
    async (pkg: OwnedOlympiad) => {
      if (startingId) return;
      setStartingId(pkg.packageId);
      setStartError(null);
      try {
        const res = await startOlympiadAttempt(pkg.packageId);
        if (!res.ok) {
          setStartError(t(res.errorKey));
          return;
        }
        router.push({
          pathname: "/(student)/test/run/[attemptId]",
          params: { attemptId: res.attemptId, ...(res.resumed ? { resumed: "1" } : {}) },
        });
        // Whatever happened server-side, the live-attempt card must reflect it.
        void liveQ.refetch();
      } finally {
        setStartingId(null);
      }
    },
    [startingId, router, t, liveQ],
  );

  const continueToLive = useCallback(() => {
    if (!live) return;
    router.push({
      pathname: "/(student)/test/run/[attemptId]",
      params: { attemptId: live.attemptId, resumed: "1" },
    });
  }, [live, router]);

  // Module gate (admin Settings) — the tab is already hidden by the layout;
  // this covers a stale navigation state with the same trilingual notice.
  if (config.data && !olympiadOn) {
    return (
      <ScreenScroll>
        <GateNotice title={t("oly4.pageTitle")} body={t("gate.olympiadOff")} />
      </ScreenScroll>
    );
  }

  const loading = config.isPending || catalogQ.isPending || ownedQ.isPending;
  const onRefresh = () => {
    void catalogQ.refetch();
    void ownedQ.refetch();
    void liveQ.refetch();
  };

  const liveTitle = live?.packageId
    ? (ownedQ.data ?? []).find((o) => o.packageId === live.packageId)?.title ?? null
    : null;

  const detailStatus = detail ? statusOf(detail, now) : null;

  return (
    <View style={{ flex: 1, backgroundColor: arena.bg }}>
      <ScreenScroll
        onRefresh={onRefresh}
        refreshing={catalogQ.isRefetching || ownedQ.isRefetching}
      >
        <AppText variant="muted" color={arena.muted} style={{ letterSpacing: 1.2, fontSize: 12 }}>
          {t("oly4.eyebrow").toUpperCase()}
        </AppText>

        {loading ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={64} />
            <Skeleton height={220} />
            <Skeleton height={220} />
          </View>
        ) : catalogQ.isError || ownedQ.isError ? (
          <ErrorRetry
            message={t("mob.boot.error")}
            retryLabel={t("mob.retry")}
            onRetry={onRefresh}
          />
        ) : (
          <>
            {startError ? (
              <Card style={{ borderColor: tokens.danger }}>
                <AppText color={tokens.danger}>{startError}</AppText>
              </Card>
            ) : null}

            {/* Live attempt → continue card (server deadline still running). */}
            {live ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("oly5.continueTitle")}
                onPress={continueToLive}
              >
                {({ pressed }) => (
                  <Card
                    style={{
                      borderColor: arena.lime,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      opacity: pressed ? 0.85 : 1,
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label">{t("oly5.continueTitle")}</AppText>
                      <AppText variant="muted" numberOfLines={1}>
                        {liveTitle && liveTitle !== "—"
                          ? `${liveTitle} · ${t("test.home.continueSub")}`
                          : t("test.home.continueSub")}
                      </AppText>
                    </View>
                    <View
                      style={{
                        backgroundColor: tokens.accent,
                        borderRadius: radius.md,
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.lg,
                      }}
                    >
                      <AppText variant="label" color="#ffffff">
                        {t("test.home.continueCta")}
                      </AppText>
                    </View>
                  </Card>
                )}
              </Pressable>
            ) : null}

            {/* ---- planned / upcoming (NOT owned — never a purchase CTA) ---- */}
            <AppText variant="title">{t("oly4.plannedTitle")}</AppText>
            {planned.length === 0 ? (
              <EmptyState title={t("oly4.none")} />
            ) : (
              <View style={{ gap: spacing.lg }}>
                {planned.map(({ pkg, kind }) => (
                  <Card key={pkg.id} style={{ gap: spacing.sm, padding: 0, overflow: "hidden" }}>
                    {pkg.cover ? (
                      <Image
                        source={{ uri: publicStorageUrl(pkg.cover.bucket, pkg.cover.path) }}
                        style={{ width: "100%", aspectRatio: 16 / 9 }}
                        contentFit="cover"
                        accessibilityLabel={pkg.title}
                        transition={150}
                      />
                    ) : (
                      <View
                        style={{
                          width: "100%",
                          aspectRatio: 16 / 6,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: arena.panel2,
                        }}
                      >
                        <AppText variant="heading" color={arena.gold}>
                          ★
                        </AppText>
                      </View>
                    )}
                    <View style={{ padding: spacing.lg, gap: spacing.sm }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                        {pkg.subject?.name ? (
                          <Chip label={pkg.subject.name} color={tokens.chipText} bg={tokens.chipBg} />
                        ) : null}
                        {pkg.grade ? (
                          <Chip
                            label={formatGradeLabel(pkg.grade.level, locale, pkg.grade.name)}
                            color={tokens.chipText}
                            bg={tokens.chipBg}
                          />
                        ) : null}
                        <Chip
                          label={t(`oly4.status.${kind}`)}
                          color={kind === "upcoming" ? arena.lime : kind === "held" ? arena.dim : arena.gold}
                          bg={arena.panel2}
                        />
                      </View>
                      <AppText variant="title">{pkg.title}</AppText>
                      {pkg.description ? (
                        <AppText variant="muted" numberOfLines={2}>
                          {pkg.description}
                        </AppText>
                      ) : null}
                      <KeyRow
                        label={t("oly4.date")}
                        value={
                          pkg.event_starts_at
                            ? fmtDate(pkg.event_starts_at, locale, true)
                            : t("oly4.dateTbd")
                        }
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: spacing.md,
                        }}
                      >
                        <AppText variant="muted">
                          {`${pkg.questions_per_attempt} ${t("oly4.questions")} · ${pkg.duration_minutes} ${t("mob.unit.min")}`}
                        </AppText>
                        <Button
                          title={t("oly4.details")}
                          variant="ghost"
                          style={{ minHeight: 40, paddingVertical: spacing.sm }}
                          onPress={() => setDetail(pkg)}
                        />
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            )}

            {/* ---- owned ("Olimpiadalarım"): the playable list ---- */}
            <AppText variant="title">{t("oly4.mineTitle")}</AppText>
            {(ownedQ.data ?? []).length === 0 ? (
              <EmptyState title={t("oly3.childNone")} />
            ) : (
              <Card style={{ gap: spacing.md }}>
                {(ownedQ.data ?? []).map((o) => (
                  <View
                    key={o.packageId}
                    style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: radius.sm,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: arena.panel2,
                      }}
                    >
                      <AppText color={arena.gold}>★</AppText>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label" numberOfLines={1}>
                        {o.title}
                      </AppText>
                      <AppText variant="muted" style={{ fontSize: 12 }}>
                        {o.questions} {t("arena.questionsShort")}
                      </AppText>
                    </View>
                    <Button
                      // The RPC TRUE-resumes the one open attempt, so the live
                      // attempt's own package reads "Continue" (web parity).
                      title={
                        live?.packageId === o.packageId
                          ? t("test.home.continueCta")
                          : t("oly3.start")
                      }
                      pending={startingId === o.packageId}
                      disabled={startingId !== null && startingId !== o.packageId}
                      style={{ minHeight: 40, paddingVertical: spacing.sm }}
                      onPress={() => void handleStart(o)}
                    />
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScreenScroll>

      {/* ---- detail sheet (web OlympiadPlannedCard modal parity) ---- */}
      <SheetShell
        visible={detail !== null}
        onClose={() => setDetail(null)}
        closeLabel={t("oly4.close")}
      >
        {detail ? (
          <ScrollView contentContainerStyle={{ gap: spacing.md }}>
            <AppText variant="title">{detail.title}</AppText>
            {detailStatus ? (
              <Chip
                label={t(`oly4.status.${detailStatus.kind}`)}
                color={
                  detailStatus.kind === "upcoming"
                    ? arena.lime
                    : detailStatus.kind === "held"
                      ? arena.dim
                      : arena.gold
                }
                bg={arena.panel2}
              />
            ) : null}
            {detail.description ? (
              <AppText variant="muted">{detail.description}</AppText>
            ) : null}
            {detail.subject?.name ? (
              <KeyRow label={t("oly4.subject")} value={detail.subject.name} />
            ) : null}
            {detail.grade ? (
              <KeyRow
                label={t("lb.colGrade")}
                value={formatGradeLabel(detail.grade.level, locale, detail.grade.name)}
              />
            ) : null}
            <KeyRow
              label={t("oly4.date")}
              value={
                detail.event_starts_at
                  ? fmtDate(detail.event_starts_at, locale, true)
                  : t("oly4.dateTbd")
              }
            />
            <KeyRow
              label={t("oly4.qcount")}
              value={`${detail.questions_per_attempt} ${t("oly4.questions")}`}
            />
            <KeyRow
              label={t("mob.oly.duration")}
              value={`${detail.duration_minutes} ${t("mob.unit.min")}`}
            />
            {/* Children can never purchase: an upcoming/undated listing carries
                the "ask your parent" note; an already-held event is archived
                and gets no note (web M12 parity). */}
            {detailStatus && detailStatus.kind !== "held" ? (
              <View
                style={{
                  flexDirection: "row",
                  gap: spacing.sm,
                  backgroundColor: tokens.chipBg,
                  borderRadius: radius.md,
                  padding: spacing.md,
                }}
              >
                <AppText color={tokens.accent}>ⓘ</AppText>
                <AppText style={{ flex: 1 }} variant="muted">
                  {t("oly4.buyNote")}
                </AppText>
              </View>
            ) : null}
            <Button title={t("oly4.close")} variant="ghost" onPress={() => setDetail(null)} />
          </ScrollView>
        ) : null}
      </SheetShell>
    </View>
  );
}
