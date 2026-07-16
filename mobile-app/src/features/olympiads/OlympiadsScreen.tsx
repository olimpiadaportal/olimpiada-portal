// Student OLYMPIADS tab — native port of web /child/olympiads:
//   1) "Planned olympiads": ACTIVE packages the child does NOT own — cover
//      cards with a bottom gradient scrim (title + REAL question-count line on
//      the image), subject/grade/status chips and a detail sheet carrying the
//      "ask your parent" note. Children can NEVER purchase, so no price CTA
//      exists anywhere here.
//   2) "My olympiads": owned purchases with the solve/continue CTA →
//      start_olympiad_attempt → the SHARED runner (/(student)/test/run/[id]).
// A still-running attempt (server deadline in the future) surfaces as a
// CONTINUE card on top, exactly like the web page. Question counts everywhere
// are the REAL pool counts (get_olympiad_pool_counts — Round 21); the
// display-legacy questions_per_attempt is dead.
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Calendar,
  Clock,
  GraduationCap,
  Info,
  ListChecks,
  Medal,
  Trophy,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { ListRow } from "@/components/ListRow";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { fetchOlympiadCatalog, publicStorageUrl, type OlympiadPackageRow } from "@/lib/data";
import { subjectLabel } from "@/lib/subjectLabel";
import { fmtDate } from "@/features/parent/commerce";
import { SheetShell } from "@/features/parent/ui";
import { useAuthStore } from "@/features/auth/authStore";
import { useArena } from "@/features/arena/useArena";
import {
  ArenaButton,
  ArenaEyebrow,
  ArenaPanel,
  ArenaScroll,
  ArenaSectionH,
} from "@/features/arena/ui";
import {
  fetchLiveOlympiadAttempt,
  fetchOlympiadPoolCounts,
  fetchOwnedOlympiads,
  startOlympiadAttempt,
  type OwnedOlympiad,
} from "./data";

// Photo-scrim overlay: sits ON TOP of arbitrary cover images, so it cannot
// come from theme tokens (must hold in every theme/palette).
const SCRIM = ["transparent", "rgba(10, 14, 26, 0.82)"] as const;
const SCRIM_INK = "#ffffff";

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
        paddingVertical: 3,
      }}
    >
      <AppText variant="label" color={color} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

export function OlympiadsScreen() {
  const { arena } = useArena();
  const { t, locale } = useT();
  const router = useRouter();
  const config = useMobileConfig();
  const profileId = useAuthStore((s) => s.profileId);

  const olympiadOn = config.data?.flags.olympiadModule === true;

  const catalogQ = useQuery({
    queryKey: ["student", "oly-catalog", locale],
    queryFn: () => fetchOlympiadCatalog(locale),
    enabled: olympiadOn,
  });
  // ONE pool-counts RPC per catalog load — the REAL question numbers for the
  // planned cards + detail sheet (absent row = empty pool = 0).
  const catalogIds = useMemo(
    () => (catalogQ.data ?? []).map((p) => p.id).sort(),
    [catalogQ.data],
  );
  const poolCountsQ = useQuery({
    queryKey: ["student", "oly-pool-counts", catalogIds],
    queryFn: () => fetchOlympiadPoolCounts(catalogIds),
    enabled: olympiadOn && catalogIds.length > 0,
    staleTime: 5 * 60_000,
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

  const poolCounts = poolCountsQ.data ?? {};
  const countOf = (packageId: string): number => poolCounts[packageId] ?? 0;

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
      <ArenaScroll>
        <GateNotice title={t("oly4.pageTitle")} body={t("gate.olympiadOff")} />
      </ArenaScroll>
    );
  }

  const loading = config.isPending || catalogQ.isPending || ownedQ.isPending;
  const onRefresh = () => {
    void catalogQ.refetch();
    void poolCountsQ.refetch();
    void ownedQ.refetch();
    void liveQ.refetch();
  };

  const liveTitle = live?.packageId
    ? (ownedQ.data ?? []).find((o) => o.packageId === live.packageId)?.title ?? null
    : null;

  const detailStatus = detail ? statusOf(detail, now) : null;
  const statusColor = (kind: StatusKind): string =>
    kind === "upcoming" ? arena.lime : kind === "held" ? arena.dim : arena.gold;

  return (
    <View style={{ flex: 1, backgroundColor: arena.bg }}>
      <ArenaScroll
        onRefresh={onRefresh}
        refreshing={catalogQ.isRefetching || ownedQ.isRefetching}
      >
        <ArenaEyebrow>{t("oly4.eyebrow")}</ArenaEyebrow>

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
              <ArenaPanel style={{ borderColor: arena.red }}>
                <AppText color={arena.red}>{startError}</AppText>
              </ArenaPanel>
            ) : null}

            {/* Live attempt → continue card (server deadline still running). */}
            {live ? (
              <ArenaPanel
                style={{
                  borderColor: arena.lime,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label" color={arena.ink}>
                    {t("oly5.continueTitle")}
                  </AppText>
                  <AppText color={arena.muted} style={{ fontSize: 13 }} numberOfLines={1}>
                    {liveTitle && liveTitle !== "—"
                      ? `${liveTitle} · ${t("test.home.continueSub")}`
                      : t("test.home.continueSub")}
                  </AppText>
                </View>
                <ArenaButton title={t("test.home.continueCta")} small onPress={continueToLive} />
              </ArenaPanel>
            ) : null}

            {/* ---- planned / upcoming (NOT owned — never a purchase CTA) ---- */}
            <ArenaSectionH title={t("oly4.plannedTitle")} />
            {planned.length === 0 ? (
              <EmptyState
                title={t("oly4.none")}
                icon={<Trophy size={26} color={arena.muted} strokeWidth={2} />}
              />
            ) : (
              <View style={{ gap: spacing.lg }}>
                {planned.map(({ pkg, kind }) => (
                  <ArenaPanel key={pkg.id} style={{ gap: 0, padding: 0, overflow: "hidden" }}>
                    {/* Cover with bottom gradient scrim: title + count line. */}
                    <View style={{ width: "100%" }}>
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
                            aspectRatio: 16 / 7,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: arena.panel2,
                          }}
                        >
                          <Trophy size={36} color={arena.gold} strokeWidth={2} />
                        </View>
                      )}
                      <LinearGradient
                        colors={[...SCRIM]}
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          paddingHorizontal: spacing.lg,
                          paddingTop: spacing.xxl,
                          paddingBottom: spacing.md,
                          gap: spacing.xs,
                        }}
                      >
                        <AppText
                          color={SCRIM_INK}
                          numberOfLines={2}
                          style={{ fontSize: 18, fontWeight: "800" }}
                        >
                          {pkg.title}
                        </AppText>
                        <AppText color={SCRIM_INK} style={{ fontSize: 12, opacity: 0.9 }}>
                          {`${countOf(pkg.id)} ${t("oly4.questions")} · ${pkg.duration_minutes} ${t("mob.unit.min")}`}
                        </AppText>
                      </LinearGradient>
                    </View>

                    <View style={{ padding: spacing.lg, gap: spacing.md }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                        {pkg.subject?.name ? (
                          <Chip
                            label={subjectLabel(t, pkg.subject.code, pkg.subject.name)}
                            color={arena.muted}
                            bg={arena.panel2}
                          />
                        ) : null}
                        {pkg.grade ? (
                          <Chip
                            label={formatGradeLabel(pkg.grade.level, locale, pkg.grade.name)}
                            color={arena.muted}
                            bg={arena.panel2}
                          />
                        ) : null}
                        <Chip
                          label={t(`oly4.status.${kind}`)}
                          color={statusColor(kind)}
                          bg={arena.panel2}
                        />
                      </View>
                      {pkg.description ? (
                        <AppText color={arena.muted} numberOfLines={2} style={{ fontSize: 13 }}>
                          {pkg.description}
                        </AppText>
                      ) : null}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: spacing.md,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing.sm,
                            flexShrink: 1,
                          }}
                        >
                          <Calendar size={16} color={arena.dim} strokeWidth={2} />
                          <AppText color={arena.muted} style={{ fontSize: 13 }} numberOfLines={1}>
                            {pkg.event_starts_at
                              ? fmtDate(pkg.event_starts_at, locale, true)
                              : t("oly4.dateTbd")}
                          </AppText>
                        </View>
                        <ArenaButton
                          title={t("oly4.details")}
                          variant="ghost"
                          small
                          onPress={() => setDetail(pkg)}
                        />
                      </View>
                    </View>
                  </ArenaPanel>
                ))}
              </View>
            )}

            {/* ---- owned ("Olimpiadalarım"): the playable list ---- */}
            <ArenaSectionH title={t("oly4.mineTitle")} />
            {(ownedQ.data ?? []).length === 0 ? (
              <EmptyState
                title={t("oly3.childNone")}
                icon={<Medal size={26} color={arena.muted} strokeWidth={2} />}
              />
            ) : (
              <ArenaPanel style={{ gap: spacing.md }}>
                {(ownedQ.data ?? []).map((o) => (
                  <View
                    key={o.packageId}
                    style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: radius.sm,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: arena.panel2,
                        borderWidth: 1,
                        borderColor: live?.packageId === o.packageId ? arena.lime : arena.line,
                      }}
                    >
                      <Medal size={20} color={arena.gold} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label" color={arena.ink} numberOfLines={1}>
                        {o.title}
                      </AppText>
                      <AppText color={arena.dim} style={{ fontSize: 12 }}>
                        {o.questions} {t("arena.questionsShort")}
                        {live?.packageId === o.packageId
                          ? ` · ${t("test.home.continueSub")}`
                          : ""}
                      </AppText>
                    </View>
                    <ArenaButton
                      // The RPC TRUE-resumes the one open attempt, so the live
                      // attempt's own package reads "Continue" (web parity).
                      title={
                        live?.packageId === o.packageId
                          ? t("test.home.continueCta")
                          : t("oly3.start")
                      }
                      small
                      variant={live?.packageId === o.packageId ? "primary" : "ghost"}
                      // In-flight dimming; handleStart blocks double-starts.
                      style={{ opacity: startingId === null ? 1 : startingId === o.packageId ? 0.6 : 0.4 }}
                      onPress={() => {
                        if (startingId === null) void handleStart(o);
                      }}
                    />
                  </View>
                ))}
              </ArenaPanel>
            )}
          </>
        )}
      </ArenaScroll>

      {/* ---- detail sheet (web OlympiadPlannedCard modal parity) ---- */}
      <SheetShell
        visible={detail !== null}
        onClose={() => setDetail(null)}
        closeLabel={t("oly4.close")}
      >
        {detail ? (
          <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
            <AppText variant="title">{detail.title}</AppText>
            {detailStatus ? (
              <View style={{ flexDirection: "row" }}>
                <Chip
                  label={t(`oly4.status.${detailStatus.kind}`)}
                  color={statusColor(detailStatus.kind)}
                  bg={arena.panel2}
                />
              </View>
            ) : null}
            {detail.description ? (
              <AppText variant="muted">{detail.description}</AppText>
            ) : null}

            {detail.subject?.name ? (
              <ListRow
                icon={<BookOpen size={18} color={arena.blue} strokeWidth={2} />}
                title={t("oly4.subject")}
                value={subjectLabel(t, detail.subject.code, detail.subject.name)}
              />
            ) : null}
            {detail.grade ? (
              <ListRow
                icon={<GraduationCap size={18} color={arena.blue} strokeWidth={2} />}
                title={t("lb.colGrade")}
                value={formatGradeLabel(detail.grade.level, locale, detail.grade.name)}
              />
            ) : null}
            <ListRow
              icon={<Calendar size={18} color={arena.blue} strokeWidth={2} />}
              title={t("oly4.date")}
              value={
                detail.event_starts_at
                  ? fmtDate(detail.event_starts_at, locale, true)
                  : t("oly4.dateTbd")
              }
            />
            <ListRow
              icon={<ListChecks size={18} color={arena.blue} strokeWidth={2} />}
              title={t("oly4.qcount")}
              value={`${countOf(detail.id)} ${t("oly4.questions")}`}
            />
            <ListRow
              icon={<Clock size={18} color={arena.blue} strokeWidth={2} />}
              title={t("mob.oly.duration")}
              value={`${detail.duration_minutes} ${t("mob.unit.min")}`}
            />

            {/* Children can never purchase: an upcoming/undated listing carries
                the "ask your parent" note; an already-held event is archived
                and gets no note (web M12 parity). */}
            {detailStatus && detailStatus.kind !== "held" ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  backgroundColor: arena.panel2,
                  borderWidth: 1,
                  borderColor: arena.line,
                  borderRadius: radius.md,
                  padding: spacing.md,
                }}
              >
                <Info size={18} color={arena.blue} strokeWidth={2} />
                <AppText style={{ flex: 1, fontSize: 13 }} color={arena.muted}>
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
