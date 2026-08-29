// Parent HOME (web /dashboard parity, redesigned): greeting header row
// (Salam, {name} + bell + avatar — the native header is hidden on this tab),
// giveaway/free-access countdown banner, onboarding carousel, rich "My
// children" cards (Avatar, mono ID, tinted access pill, leaderboard chip, two
// quick actions) and the Add-Child CTA — a gradient hero card when the family
// has no children yet, a compact section action otherwise.
import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Flame, GraduationCap, Plus, UserRoundPlus } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { CopyableId } from "@/components/CopyableId";
import { Button } from "@/components/Button";
import { ChildAvatar } from "@/components/ChildAvatar";
import { Card } from "@/components/Card";
import { CountdownBanner } from "@/components/CountdownBanner";
import { HeaderAvatarButton } from "@/components/HeaderAvatarButton";
import { HeaderBell } from "@/components/HeaderBell";
import { SectionHeader } from "@/components/SectionHeader";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { formatPercent } from "@/lib/formatPercent";
import type { ChildRow } from "@/lib/data";
import { useOwnProfile } from "@/features/profile/useOwnProfile";
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
// Round 36: the board is a weighted percentage — pct_month, never the
// deprecated points_month.
type LbSummary = {
  pct_month?: number | null;
  provisional_month?: boolean | null;
  current_streak?: number | null;
  rank_month?: number | null;
};

/** Greeting header row — replaces the native navigator header on this tab. */
function GreetingHeader() {
  const { t } = useT();
  const profile = useOwnProfile();
  const firstName =
    (profile.data?.displayName ?? "").trim().split(/\s+/)[0] ||
    profile.data?.email ||
    "";

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="eyebrow">{t("child.hello")}</AppText>
        <AppText variant="heading" numberOfLines={1}>
          {firstName || t("parent.dash.title")}
        </AppText>
      </View>
      <HeaderBell target="/(parent)/notifications" />
      <HeaderAvatarButton />
    </View>
  );
}

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

  const name = childDisplayName(child);
  const gradeText = child.grade
    ? formatGradeLabel(child.grade.level, locale, child.grade.name)
    : null;
  const placeLine = [gradeText, child.school?.name].filter(Boolean).join(" • ");
  const lbRanked = !!lb && lb.rank_month != null;
  const lbProvisional = !!lb && lb.provisional_month === true;

  return (
    <Card style={{ gap: spacing.md }}>
      {/* Identity block: avatar + name + access pill on one row, and the
          "grade • SCHOOL" line on its own FULL-WIDTH line beneath it.
          Why not inside the name column: the Pill's label is translated (ru
          "Бесплатный доступ" ≈ 136pt with its padding) and never shrinks while
          free space is positive, so the flex:1 column is left 46–79pt on a
          320pt phone — an unbounded school name there ragged-wraps into 6–11
          lines beside a vertically-centred 48pt avatar. On its own line the
          same text has the card's full 254pt (≈2 lines) and stays uncut. */}
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <ChildAvatar row={child} name={name} seed={child.profile_id} size={48} />
          {/* A name is bounded in practice, so it keeps a ceiling (2 lines)
              rather than unbalancing the 48pt avatar. */}
          <AppText
            variant="title"
            numberOfLines={2}
            style={{ flex: 1, minWidth: 0, fontSize: 18 }}
          >
            {name}
          </AppText>
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
        </View>
        {placeLine ? (
          // NOT clamped: it carries the SCHOOL name (unbounded DB/admin text)
          // and this card is a parent's main view of it, so it wraps over as
          // many lines as it needs and the card grows.
          <AppText variant="muted" style={{ fontSize: 12 }}>
            {placeLine}
          </AppText>
        ) : null}
      </View>

      {/* Login ID chip (mono) — or the pending pill. */}
      <View
        style={{
          backgroundColor: tokens.chipBg,
          borderRadius: radius.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          gap: 2,
        }}
      >
        <AppText variant="eyebrow">{t("parent.dash.childId")}</AppText>
        {child.child_unique_id ? (
          <CopyableId
            id={child.child_unique_id}
            display={groupChildId(child.child_unique_id)}
            label={t("parent.child.idCopy")}
              copiedLabel={t("parent.child.idCopied")}
              a11yLabel={t("parent.child.idCopyA11y")}
          />
        ) : (
          <AppText variant="label" color={tokens.muted}>
            {t("parent.dash.idPending")}
          </AppText>
        )}
      </View>
      {child.child_unique_id ? (
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {t("parent.child.idNote")}
        </AppText>
      ) : null}

      {/* Leaderboard quick-look (flag-gated) — taps open the full board. */}
      {leaderboardOn ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("plb.title")}. ${t("mob.plb.viewFull")}`}
          onPress={() => router.push("/(parent)/leaderboard")}
          android_ripple={{ color: tokens.chipBg }}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            minHeight: 32,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          {lbRanked || lbProvisional ? (
            <>
              {lbRanked ? (
                <AppText variant="mono" color={tokens.accent} style={{ fontWeight: "700" }}>
                  #{lb!.rank_month}
                </AppText>
              ) : (
                <AppText variant="muted">{t("plb.provisionalShort")}</AppText>
              )}
              <AppText variant="muted">
                {formatPercent(Number(lb!.pct_month ?? 0), locale)}
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Flame size={14} color={tokens.accent2} strokeWidth={2} />
                <AppText variant="muted">{Number(lb!.current_streak ?? 0) || 0}</AppText>
              </View>
            </>
          ) : (
            <AppText variant="muted">{t("plb.notRankedShort")}</AppText>
          )}
          <View style={{ flex: 1 }} />
          <ChevronRight size={16} color={tokens.muted} strokeWidth={2} />
        </Pressable>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
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

/** Gradient hero Add-Child card — shown when the family has no children yet. */
function AddChildHero() {
  const { tokens } = useTheme();
  const { t } = useT();
  const router = useRouter();
  return (
    <LinearGradient
      colors={[...gradients.brand]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: "rgba(255,255,255,0.2)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GraduationCap size={26} color="#ffffff" strokeWidth={2} />
        </View>
        <AppText variant="title" color="#ffffff" style={{ flex: 1 }}>
          {t("parent.dash.noChildren")}
        </AppText>
      </View>
      <AppText color="rgba(255,255,255,0.9)">{t("parent.child.intro")}</AppText>
      {/* White pill CTA — Button's ghost text/icon color is the accent, which
          reads cleanly on the white fill over the brand gradient. */}
      <Button
        title={t("parent.dash.addChild")}
        variant="ghost"
        icon={<UserRoundPlus size={18} color={tokens.accent} strokeWidth={2} />}
        style={{ backgroundColor: "#ffffff", borderColor: "#ffffff" }}
        onPress={() => router.push("/(parent)/add-child")}
      />
    </LinearGradient>
  );
}

export default function ParentHome() {
  const { tokens } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const config = useMobileConfig();
  const children = useChildren();
  const freeAccess = useParentFreeAccess();
  // GreetingHeader RENDERS this one (the name and the header avatar), but the
  // pull lives here and can only refetch the sources it is handed — so the
  // screen observes the same query key. One key, one request.
  const profile = useOwnProfile();

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

  const kids = children.data ?? [];
  const hasKids = kids.length > 0;

  const { refreshing, onRefresh } = usePullRefresh([
    children,
    freeAccess,
    config,
    profile,
    ...lbQueries,
  ]);

  const timeLabels = {
    d: t("gvw.days"),
    h: t("gvw.hours"),
    m: t("gvw.minutes"),
    s: t("gvw.seconds"),
  };

  return (
    <ScreenScroll topInset refreshing={refreshing} onRefresh={onRefresh}>
      <GreetingHeader />

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

      <SectionHeader
        title={t("parent.dash.title")}
        action={
          hasKids
            ? { label: `+ ${t("parent.dash.addChild")}`, onPress: () => router.push("/(parent)/add-child") }
            : undefined
        }
      />

      {children.isPending ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={170} />
          <Skeleton height={170} />
        </View>
      ) : children.isError ? (
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => void children.refetch()}
        />
      ) : !hasKids ? (
        <AddChildHero />
      ) : (
        <View style={{ gap: spacing.md }}>
          {kids.map((c) => (
            <ChildCard
              key={c.profile_id}
              child={c}
              giveawayActive={giveawayActive}
              freeAccessActive={freeActive}
              leaderboardOn={leaderboardOn}
              lb={lbByChild.get(c.profile_id) ?? null}
            />
          ))}
          <Button
            title={t("parent.dash.addChild")}
            variant="ghost"
            icon={<Plus size={18} color={tokens.accent} strokeWidth={2} />}
            onPress={() => router.push("/(parent)/add-child")}
          />
        </View>
      )}
    </ScreenScroll>
  );
}
