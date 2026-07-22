// Public About (web /about parity): about2.* copy — CMS-overridable, so every
// string stays behind its own key and nothing is rewritten for mobile.
//
// The web page is a gradient hero with a large illustration, five ALTERNATING
// illustration+copy blocks and a 4-card icon value grid. Stacking that
// vertically costs ~3.5 phone screens, so mobile keeps the same sections and
// the same artwork (features/public/AboutArt) but changes how they are paced:
// the hero lead clamps to three lines behind a read-more that also reveals the
// three intro paragraphs the web renders under the hero, the five story blocks
// become one swipeable rail with StepDots, and the value grid becomes compact
// icon rows. Type runs one tier below the web's desktop sizes throughout.
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronDown,
  ChevronUp,
  Layers,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { StepDots } from "@/components/StepDots";
import {
  AboutHeroArt,
  AnalyticsArt,
  FamilyArt,
  OlympiadArt,
  SafetyArt,
  StudyArt,
  type AboutArtComponent,
} from "@/features/public/AboutArt";
import { useTheme } from "@/theme/ThemeProvider";
import { lineHeight, radius, spacing, tint } from "@/theme/tokens";
import { useContentOverrides } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useT } from "@/i18n/useT";

// Same order and same artwork as the web page's alternating blocks.
const BLOCKS: { key: string; Art: AboutArtComponent }[] = [
  { key: "b1", Art: StudyArt },
  { key: "b2", Art: FamilyArt },
  { key: "b3", Art: OlympiadArt },
  { key: "b4", Art: AnalyticsArt },
  { key: "b5", Art: SafetyArt },
];

// Lucide equivalents of the web value-card icons (target / layers / users /
// shield-check), keyed in the web's order.
const VALUES: { key: string; Icon: LucideIcon }[] = [
  { key: "v1", Icon: Target },
  { key: "v2", Icon: Layers },
  { key: "v3", Icon: Users },
  { key: "v4", Icon: ShieldCheck },
];

const CHIPS = ["chip1", "chip2", "chip3"] as const;
// Intro prose the web renders under the hero; on mobile it sits behind the
// read-more so parity costs no default scroll.
const HERO_PROSE = ["p2", "p3", "p4"] as const;

/** Gap between rail cards, and how much of the next card stays visible. */
const RAIL_GAP = spacing.md;
const RAIL_PEEK = spacing.xl;

function Pill({
  text,
  bg,
  color,
  border,
}: {
  text: string;
  bg: string;
  color: string;
  border?: string;
}) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: bg,
        borderRadius: 999,
        borderWidth: border ? 1 : 0,
        borderColor: border,
        paddingVertical: 4,
        paddingHorizontal: spacing.md,
      }}
    >
      <AppText variant="eyebrow" color={color}>
        {text}
      </AppText>
    </View>
  );
}

export default function About() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const [heroOpen, setHeroOpen] = useState(false);
  const [railW, setRailW] = useState(0);
  const [page, setPage] = useState(0);
  const [cardH, setCardH] = useState(0);

  const cardW = railW > 0 ? railW - spacing.lg * 2 - RAIL_PEEK : 0;
  const snap = cardW + RAIL_GAP;

  // The five rail cards hold different amounts of copy (ru runs ~20% longer
  // than az) so their natural heights differ and the rail would jump while
  // swiping. The tallest measured card becomes the floor for all of them;
  // re-measure whenever the locale or the available width changes.
  useEffect(() => {
    setCardH(0);
  }, [locale, cardW]);

  const measureCard = useCallback((e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    setCardH((cur) => (h > cur ? h : cur));
  }, []);

  // Every string on this page is CMS-overridable, so the override query IS the
  // page's live data.
  const overridesQ = useContentOverrides(locale);
  const { refreshing, onRefresh } = usePullRefresh([overridesQ]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("nav.about"),
          headerStyle: { backgroundColor: tokens.surface },
          headerTitleStyle: { color: tokens.text },
          headerTintColor: tokens.accent,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            accessibilityLabel={t("mob.refreshing")}
          />
        }
      >
        {/* Hero — the web's radial orange/purple wash over the surface. */}
        <Card variant="hero" style={{ gap: spacing.md, overflow: "hidden" }}>
          <LinearGradient
            colors={[tint(tokens.accent2, 0.13), "transparent", tint(tokens.accent, 0.12)]}
            locations={[0, 0.55, 1]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <Pill text={t("about2.hero.eyebrow")} bg={tokens.pillBg} color={tokens.pillText} />
          <AppText variant="heading" style={{ lineHeight: lineHeight.heading }}>
            {t("about2.hero.title")}
          </AppText>

          <AboutHeroArt height={148} />

          <AppText
            variant="muted"
            style={{ lineHeight: lineHeight.body }}
            numberOfLines={heroOpen ? undefined : 3}
          >
            {t("about2.hero.lead")}
          </AppText>
          {heroOpen
            ? HERO_PROSE.map((p) => (
                <AppText key={p} variant="muted" style={{ lineHeight: lineHeight.body }}>
                  {t(`about2.hero.${p}`)}
                </AppText>
              ))
            : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={heroOpen ? t("mob.about.less") : t("mob.about.more")}
            accessibilityState={{ expanded: heroOpen }}
            hitSlop={12}
            onPress={() => setHeroOpen((v) => !v)}
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            <AppText variant="label" color={tokens.accent}>
              {heroOpen ? t("mob.about.less") : t("mob.about.more")}
            </AppText>
            {heroOpen ? (
              <ChevronUp size={16} color={tokens.accent} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={tokens.accent} strokeWidth={2} />
            )}
          </Pressable>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {CHIPS.map((c) => (
              <Pill
                key={c}
                text={t(`about2.hero.${c}`)}
                bg={tokens.chipBg}
                color={tokens.chipText}
                border={tokens.border}
              />
            ))}
          </View>
        </Card>

        {/* Story blocks — one swipeable rail instead of five stacked cards. The
            next card peeks at the right edge so the swipe is discoverable. */}
        <View style={{ gap: spacing.md }}>
          <View
            style={{ marginHorizontal: -spacing.lg }}
            onLayout={(e) => setRailW(e.nativeEvent.layout.width)}
          >
            {cardW > 0 ? (
              <FlatList
                data={BLOCKS}
                keyExtractor={(b) => b.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={snap}
                snapToAlignment="start"
                disableIntervalMomentum
                contentContainerStyle={{
                  paddingHorizontal: spacing.lg,
                  // Room for the card shadow — the rail clips to its bounds.
                  paddingVertical: spacing.md,
                }}
                ItemSeparatorComponent={() => <View style={{ width: RAIL_GAP }} />}
                onMomentumScrollEnd={(e) =>
                  setPage(
                    Math.max(
                      0,
                      Math.min(
                        BLOCKS.length - 1,
                        Math.round(e.nativeEvent.contentOffset.x / snap),
                      ),
                    ),
                  )
                }
                renderItem={({ item, index }) => {
                  const Art = item.Art;
                  // The web swaps the tag to orange on every second block.
                  const alt = index % 2 === 1;
                  return (
                    <Card
                      onLayout={measureCard}
                      style={{
                        width: cardW,
                        minHeight: cardH > 0 ? cardH : undefined,
                        gap: spacing.sm,
                      }}
                    >
                      <View
                        style={{
                          borderRadius: radius.lg,
                          borderWidth: 1,
                          borderColor: tokens.border,
                          padding: spacing.sm,
                          overflow: "hidden",
                        }}
                      >
                        <LinearGradient
                          colors={[tint(tokens.accent, 0.06), tint(tokens.accent2, 0.07)]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFillObject}
                          pointerEvents="none"
                        />
                        <Art height={110} />
                      </View>
                      <Pill
                        text={t(`about2.${item.key}.tag`)}
                        bg={alt ? tint(tokens.accent2, 0.13) : tokens.pillBg}
                        color={alt ? tokens.accent2 : tokens.pillText}
                      />
                      <AppText variant="subtitle">{t(`about2.${item.key}.title`)}</AppText>
                      <AppText variant="muted" style={{ lineHeight: lineHeight.compact }}>
                        {t(`about2.${item.key}.body`)}
                      </AppText>
                    </Card>
                  );
                }}
              />
            ) : null}
          </View>
          <StepDots count={BLOCKS.length} index={page} style={{ alignSelf: "center" }} />
        </View>

        {/* Values — centered heading like the web, then compact icon rows
            instead of the desktop 2×2 grid (14px copy in a half-width column
            is unreadable on a phone). */}
        <View style={{ gap: spacing.xs, alignItems: "center", marginTop: spacing.sm }}>
          <AppText variant="title" style={{ textAlign: "center" }}>
            {t("about2.values.title")}
          </AppText>
          <AppText
            variant="muted"
            style={{ textAlign: "center", lineHeight: lineHeight.body }}
          >
            {t("about2.values.sub")}
          </AppText>
        </View>

        <Card style={{ paddingVertical: spacing.xs }}>
          {VALUES.map(({ key, Icon }, index) => {
            const alt = index % 2 === 1;
            const accent = alt ? tokens.accent2 : tokens.accent;
            return (
              <View
                key={key}
                style={{
                  gap: spacing.xs,
                  paddingVertical: spacing.sm,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: tokens.border,
                }}
              >
                {/* Icon chip beside the title rather than above it (the web's
                    2-column grid), so the body keeps the full card width. */}
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.sm,
                      backgroundColor: alt ? tint(tokens.accent2, 0.13) : tokens.pillBg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={18} color={accent} strokeWidth={2} />
                  </View>
                  <AppText variant="label" style={{ flex: 1 }}>
                    {t(`about2.${key}.title`)}
                  </AppText>
                </View>
                <AppText variant="muted" style={{ lineHeight: lineHeight.compact }}>
                  {t(`about2.${key}.body`)}
                </AppText>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </View>
  );
}
