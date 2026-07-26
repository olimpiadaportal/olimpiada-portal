// Parent Analytics tab — full web /analytics parity (Round 51 audit): child
// selector chips, the analytics-type switch (Fənlər | Olimpiadalar → the RPC
// p_scope), per-subject chips in subjects mode (the child's UNLOCKED subjects;
// an active giveaway unlocks every priced subject, server parity), the
// get_child_subject_dashboard body for the selection, and the flag-gated
// leaderboard/improvement panel for the same selected child (web shows it in
// BOTH modes). PURCHASE-SILENT: locked subjects and subscribe hints/CTAs never
// render here — that web affordance is a store-compliance violation on mobile.
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Segmented } from "@/components/Segmented";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { subjectLabel } from "@/lib/subjectLabel";
import { useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import {
  fetchChildDashboard,
  fetchChildLeaderboardSummary,
  fetchChildSubscriptions,
  fetchChildren,
  fetchSubjectsPricing,
  type DashboardScope,
} from "@/lib/data";
import { groupPricing } from "@/features/parent/commerce";
import {
  ChildChips,
  DashboardBody,
  LeaderboardPanel,
  SubjectChips,
} from "@/features/analytics/AnalyticsDashboard";
import {
  dashHasData,
  resolveSubjectSelection,
  type AnalyticsMode,
  type DashPayload,
  type LbSummary,
} from "@/features/analytics/helpers";

function LoadingSkeleton() {
  return (
    <View style={{ gap: spacing.lg }}>
      <Skeleton height={14} width="60%" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Skeleton height={64} />
        </View>
        <View style={{ flex: 1 }}>
          <Skeleton height={64} />
        </View>
        <View style={{ flex: 1 }}>
          <Skeleton height={64} />
        </View>
      </View>
      <Skeleton height={180} />
      <Skeleton height={180} />
      <Skeleton height={120} />
    </View>
  );
}

/** Subscription statuses whose covered subjects count as UNLOCKED for the
 * subject chips (web tab parity: trialing/active/past_due — not canceled). */
const LIVE_TAB_STATUSES = new Set(["trialing", "active", "past_due"]);

export default function ParentAnalytics() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const router = useRouter();
  const config = useMobileConfig();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<AnalyticsMode>("subjects");
  // Requested subject ("all" | uuid); clamped at render (loop-safe, no effects).
  const [subjectSel, setSubjectSel] = useState<string | null>(null);

  const childrenQ = useQuery({ queryKey: ["children"], queryFn: fetchChildren });
  const kids = (childrenQ.data ?? []).map((c) => ({
    id: c.profile_id,
    name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || (c.child_unique_id ?? "—"),
  }));
  const childId = selectedId && kids.some((k) => k.id === selectedId) ? selectedId : kids[0]?.id ?? null;

  // Active giveaway → every priced subject counts as unlocked (server-resolved
  // payment mode; web page parity). Outside it, unlocked subjects come from
  // the child's LIVE subscription rows.
  const giveawayActive = config.data?.payment.mode === "giveaway";
  const subsQ = useQuery({
    queryKey: ["parent", "subscriptions"],
    queryFn: fetchChildSubscriptions,
    enabled: !!childId,
  });
  const pricedQ = useQuery({
    queryKey: ["parent", "subjects-pricing"],
    queryFn: async () => groupPricing(await fetchSubjectsPricing()),
    enabled: giveawayActive,
  });

  // The selected child's UNLOCKED subjects (id + locale-aware label), stable
  // label order — this is the whole chip universe (no locked chips on mobile).
  const activeSubjects = useMemo(() => {
    const map = new Map<string, { id: string; code: string | null; name: string }>();
    for (const sub of subsQ.data ?? []) {
      if (sub.student_profile_id !== childId) continue;
      if (!LIVE_TAB_STATUSES.has(sub.status)) continue;
      for (const s of sub.subjects) {
        map.set(s.subject_id, { id: s.subject_id, code: s.code, name: s.name });
      }
    }
    if (giveawayActive) {
      for (const s of pricedQ.data ?? []) {
        if (!map.has(s.id)) map.set(s.id, { id: s.id, code: s.code, name: s.name });
      }
    }
    return Array.from(map.values())
      .map((s) => ({ id: s.id, label: subjectLabel(t, s.code, s.name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [subsQ.data, pricedQ.data, childId, giveawayActive, t]);

  // "" = no unlocked subject; "all" only with >1 subject (web clamp parity).
  const selectedSubject = resolveSubjectSelection(
    activeSubjects.map((s) => s.id),
    subjectSel,
  );

  const scope: DashboardScope = mode === "olympiads" ? "olympiads" : "tests";
  const subjectParam =
    mode === "olympiads" || selectedSubject === "all" || selectedSubject === ""
      ? null
      : selectedSubject;
  // Subjects mode needs an unlocked subject; olympiads mode ignores subjects
  // entirely (packages aren't subject-gated — web wantDash parity).
  const wantDash = !!childId && (mode === "olympiads" || selectedSubject !== "");
  const dashQ = useQuery({
    queryKey: ["child-dashboard", childId, mode, subjectParam ?? "all"],
    enabled: wantDash,
    queryFn: () => fetchChildDashboard(childId!, subjectParam, 30, scope),
  });

  const leaderboardOn = config.data?.flags.leaderboard === true;
  const lbQ = useQuery({
    queryKey: ["child-lb-summary", childId],
    enabled: !!childId && leaderboardOn,
    queryFn: () => fetchChildLeaderboardSummary(childId!),
  });

  const { refreshing, onRefresh } = usePullRefresh([
    childrenQ,
    childId ? subsQ : null,
    giveawayActive ? pricedQ : null,
    dashQ,
    lbQ,
    config,
  ]);

  const subjectsSettling =
    mode === "subjects" && (subsQ.isPending || (giveawayActive && pricedQ.isPending));

  let body: React.ReactNode;
  if (childrenQ.isPending) {
    body = <LoadingSkeleton />;
  } else if (childrenQ.isError) {
    body = (
      <ErrorRetry
        message={t("mob.boot.error")}
        retryLabel={t("mob.retry")}
        onRetry={() => void childrenQ.refetch()}
      />
    );
  } else if (kids.length === 0) {
    body = (
      <Card>
        <EmptyState
          title={t("ana.noChildren")}
          icon={<ChartColumn size={26} color={tokens.muted} strokeWidth={2} />}
          action={{ label: t("ana.addChild"), onPress: () => router.push("/(parent)/add-child") }}
        />
      </Card>
    );
  } else if (subjectsSettling) {
    body = <LoadingSkeleton />;
  } else if (mode === "subjects" && subsQ.isError) {
    body = (
      <ErrorRetry
        message={t("mob.boot.error")}
        retryLabel={t("mob.retry")}
        onRetry={() => void subsQ.refetch()}
      />
    );
  } else if (mode === "subjects" && selectedSubject === "") {
    // No unlocked subject for this child. The web adds a subscribe CTA here —
    // deliberately NOT ported (purchase-silent store binary).
    body = (
      <Card>
        <AppText variant="muted">{t("ana.noActive")}</AppText>
      </Card>
    );
  } else if (dashQ.isPending) {
    body = <LoadingSkeleton />;
  } else if (dashQ.isError) {
    body = (
      <ErrorRetry
        message={t("mob.boot.error")}
        retryLabel={t("mob.retry")}
        onRetry={() => void dashQ.refetch()}
      />
    );
  } else {
    const data = (dashQ.data ?? {}) as DashPayload;
    // Honest empty state per mode: no graded activity in the window.
    body = dashHasData(data, mode) ? (
      <DashboardBody data={data} t={t} mode={mode} />
    ) : mode === "olympiads" ? (
      <EmptyState title={t("ana.olymp.empty.title")} body={t("ana.olymp.empty.sub")} />
    ) : (
      <EmptyState title={t("ana.empty.title")} body={t("ana.empty.sub")} />
    );
  }

  return (
    <Screen scroll refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="heading">{t("analytics.title")}</AppText>
          <AppText variant="muted">{t("analytics.subtitle")}</AppText>
        </View>

        {childId ? (
          <ChildChips
            childrenList={kids}
            selectedId={childId}
            onSelect={setSelectedId}
            label={t("ana.childLabel")}
          />
        ) : null}

        {/* Analytics type: Subjects vs Olympiads (drives the RPC p_scope). */}
        {childId ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="eyebrow">{t("ana.mode.label")}</AppText>
            <Segmented
              options={[
                { value: "subjects", label: t("ana.mode.subjects") },
                { value: "olympiads", label: t("ana.mode.olympiads") },
              ]}
              value={mode}
              onChange={setMode}
            />
          </View>
        ) : null}

        {/* Subject chips are a SUBJECTS-mode concept — olympiad packages
            aren't subject-gated, so the whole control hides in olympiad mode
            (web parity). */}
        {childId && mode === "subjects" && activeSubjects.length > 0 ? (
          <SubjectChips
            subjects={activeSubjects}
            selectedId={selectedSubject}
            onSelect={setSubjectSel}
            label={t("ana.subjectLabel")}
            allLabel={t("ana.subject.all")}
          />
        ) : null}

        {body}

        {leaderboardOn && childId && !childrenQ.isPending && !childrenQ.isError ? (
          lbQ.isPending ? (
            <Skeleton height={100} />
          ) : (
            <LeaderboardPanel
              summary={(lbQ.data ?? null) as LbSummary | null}
              t={t}
              locale={locale}
              onViewFull={() => router.push("/(parent)/leaderboard")}
            />
          )
        ) : null}
      </View>
    </Screen>
  );
}
