// Parent Analytics tab — mobile v1 of the web /analytics page: child selector
// chips + the ALL-SUBJECTS dashboard (get_child_subject_dashboard with
// subject=null, 30 days) + the flag-gated leaderboard/improvement panel for
// the same selected child. Per-subject tabs arrive with a later stage.
import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import {
  fetchChildDashboard,
  fetchChildLeaderboardSummary,
  fetchChildren,
} from "@/lib/data";
import {
  ChildChips,
  DashboardBody,
  LeaderboardPanel,
} from "@/features/analytics/AnalyticsDashboard";
import { num, type DashPayload, type LbSummary } from "@/features/analytics/helpers";

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

export default function ParentAnalytics() {
  const { t } = useT();
  const router = useRouter();
  const config = useMobileConfig();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const childrenQ = useQuery({ queryKey: ["children"], queryFn: fetchChildren });
  const kids = (childrenQ.data ?? []).map((c) => ({
    id: c.profile_id,
    name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || (c.child_unique_id ?? "—"),
  }));
  const childId = selectedId && kids.some((k) => k.id === selectedId) ? selectedId : kids[0]?.id ?? null;

  const dashQ = useQuery({
    queryKey: ["child-dashboard", childId],
    enabled: !!childId,
    queryFn: () => fetchChildDashboard(childId!, null, 30),
  });

  const leaderboardOn = config.data?.flags.leaderboard === true;
  const lbQ = useQuery({
    queryKey: ["child-lb-summary", childId],
    enabled: !!childId && leaderboardOn,
    queryFn: () => fetchChildLeaderboardSummary(childId!),
  });

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
      <Card style={{ alignItems: "center", gap: spacing.lg }}>
        <AppText variant="muted" style={{ textAlign: "center" }}>
          {t("ana.noChildren")}
        </AppText>
        <Button title={t("ana.addChild")} onPress={() => router.push("/(parent)/add-child")} />
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
    // Honest empty state: no graded practice in the window for this child.
    const hasData = num(data.totals?.questions) > 0;
    body = hasData ? (
      <DashboardBody data={data} t={t} />
    ) : (
      <EmptyState title={t("ana.empty.title")} body={t("ana.empty.sub")} />
    );
  }

  return (
    <Screen scroll>
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

        {body}

        {leaderboardOn && childId && !childrenQ.isPending && !childrenQ.isError ? (
          lbQ.isPending ? (
            <Skeleton height={100} />
          ) : (
            <LeaderboardPanel summary={(lbQ.data ?? null) as LbSummary | null} t={t} />
          )
        ) : null}
      </View>
    </Screen>
  );
}
