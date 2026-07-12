// Parent HOME (web /dashboard parity): giveaway/free-access countdown banner,
// onboarding carousel, "My children" cards (login ID, access pill, grade,
// flag-gated leaderboard chip, Subjects/Edit actions) + the Add-Child CTA.
import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CountdownBanner } from "@/components/CountdownBanner";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { formatGradeLabel } from "@/lib/gradeLabel";
import type { ChildRow } from "@/lib/data";
import {
  accessStatusKey,
  accessTone,
  groupChildId,
} from "@/features/parent/commerce";
import { InfoCarousel } from "@/features/parent/InfoCarousel";
import {
  useChildren,
  useLeaderboardSummaries,
  useParentFreeAccess,
} from "@/features/parent/queries";
import { Pill, ScreenScroll, childDisplayName } from "@/features/parent/ui";

// get_child_leaderboard_summary payload (defensive: any miss → "not ranked").
type LbSummary = {
  points_month?: number | null;
  current_streak?: number | null;
  rank_month?: number | null;
};

function ChildCard({
  child,
  giveawayActive,
  freeAccessActive,
  leaderboardOn,
  lb,
}: {
  child: ChildRow;
  giveawayActive: boolean;
  freeAccessActive: boolean;
  leaderboardOn: boolean;
  lb: LbSummary | null;
}) {
  const { tokens } = useTheme();
  const { t, locale } = useT();
  const router = useRouter();

  const gradeText = child.grade
    ? formatGradeLabel(child.grade.level, locale, child.grade.name)
    : null;
  const placeLine = [gradeText, child.school?.name].filter(Boolean).join(" • ");
  const lbRanked = !!lb && lb.rank_month != null && Number(lb.points_month ?? 0) > 0;

  return (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="title">{childDisplayName(child)}</AppText>
      {placeLine ? <AppText variant="muted">{placeLine}</AppText> : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <AppText variant="muted">{t("parent.dash.childId")}:</AppText>
        {child.child_unique_id ? (
          <AppText variant="mono" style={{ fontSize: 18, fontWeight: "700" }}>
            {groupChildId(child.child_unique_id)}
          </AppText>
        ) : (
          <Pill label={t("parent.dash.idPending")} tone="muted" />
        )}
      </View>
      {child.child_unique_id ? (
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {t("parent.child.idNote")}
        </AppText>
      ) : null}

      {giveawayActive ? (
        <Pill label={t("access.giveaway")} tone="accent" />
      ) : freeAccessActive ? (
        <Pill label={t("access.freeAccess")} tone="accent" />
      ) : (
        <Pill
          label={t(accessStatusKey(child.access_status))}
          tone={accessTone(child.access_status)}
        />
      )}

      {leaderboardOn ? (
        <View
          accessibilityLabel={t("plb.title")}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
        >
          {lbRanked ? (
            <>
              <AppText variant="mono" color={tokens.accent} style={{ fontWeight: "700" }}>
                #{lb!.rank_month}
              </AppText>
              <AppText variant="muted">
                {Math.round(Number(lb!.points_month ?? 0))} {t("plb.pts")}
              </AppText>
              <AppText variant="muted">🔥 {Number(lb!.current_streak ?? 0) || 0}</AppText>
            </>
          ) : (
            <AppText variant="muted">{t("plb.notRankedShort")}</AppText>
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
        <Button
          title={child.child_unique_id ? t("parent.dash.manage") : t("parent.dash.choosePlan")}
          variant={child.child_unique_id ? "ghost" : "primary"}
          style={{ flex: 1, minHeight: 44, paddingVertical: spacing.sm }}
          onPress={() =>
            router.push({
              pathname: "/(parent)/children/[id]/subscribe",
              params: { id: child.profile_id },
            })
          }
        />
        <Button
          title={t("parent.dash.editInfo")}
          variant="ghost"
          style={{ flex: 1, minHeight: 44, paddingVertical: spacing.sm }}
          onPress={() =>
            router.push({
              pathname: "/(parent)/children/[id]/edit",
              params: { id: child.profile_id },
            })
          }
        />
      </View>
    </Card>
  );
}

export default function ParentHome() {
  const { t } = useT();
  const router = useRouter();
  const config = useMobileConfig();
  const children = useChildren();
  const freeAccess = useParentFreeAccess();

  const leaderboardOn = config.data?.flags.leaderboard === true;
  const lbQueries = useLeaderboardSummaries(children.data, leaderboardOn);
  const lbByChild = new Map<string, LbSummary | null>();
  (children.data ?? []).forEach((c, i) => {
    lbByChild.set(c.profile_id, (lbQueries[i]?.data ?? null) as LbSummary | null);
  });

  const mode = config.data?.payment.mode ?? "off";
  const giveawayActive = mode === "giveaway";
  const giveawayEndsAt = config.data?.payment.giveawayEndsAt ?? null;
  const freeActive = freeAccess.data?.active === true;
  const freeEndsAt = freeAccess.data?.endsAt ?? null;

  const refreshing = children.isRefetching || freeAccess.isRefetching;
  const onRefresh = () => {
    void children.refetch();
    void freeAccess.refetch();
    void config.refetch();
    for (const q of lbQueries) void q.refetch();
  };

  const timeLabels = {
    d: t("gvw.days"),
    h: t("gvw.hours"),
    m: t("gvw.minutes"),
    s: t("gvw.seconds"),
  };

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={onRefresh}>
      {giveawayActive && giveawayEndsAt ? (
        <CountdownBanner
          endsAt={giveawayEndsAt}
          title={t("gvw.title")}
          subtitle={t("gvw.sub")}
          labels={timeLabels}
        />
      ) : !giveawayActive && freeActive && freeEndsAt ? (
        <CountdownBanner
          endsAt={freeEndsAt}
          title={t("fa.title")}
          subtitle={t("fa.sub")}
          labels={timeLabels}
        />
      ) : null}

      <InfoCarousel />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.md,
        }}
      >
        <AppText variant="heading">{t("parent.dash.title")}</AppText>
        <Button
          title={t("parent.dash.addChild")}
          style={{ minHeight: 40, paddingVertical: spacing.sm }}
          onPress={() => router.push("/(parent)/add-child")}
        />
      </View>

      {children.isPending ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </View>
      ) : children.isError ? (
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => void children.refetch()}
        />
      ) : (children.data ?? []).length === 0 ? (
        <EmptyState title={t("parent.dash.noChildren")} body={t("parent.child.intro")} />
      ) : (
        <View style={{ gap: spacing.md }}>
          {(children.data ?? []).map((c) => (
            <ChildCard
              key={c.profile_id}
              child={c}
              giveawayActive={giveawayActive}
              freeAccessActive={freeActive}
              leaderboardOn={leaderboardOn}
              lb={lbByChild.get(c.profile_id) ?? null}
            />
          ))}
        </View>
      )}
    </ScreenScroll>
  );
}
