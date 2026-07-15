// First-launch onboarding (plan §3): three swipeable slides (vector gradient
// heroes, no binary assets) + StepDots + "Keç" skip. The final slide carries
// the auth CTAs and the public info links (News only while news_public is on).
// Shown ONCE per install: the olympiq.seenWelcome flag is set the moment the
// user leaves via ANY path (skip, CTA, info link, slide-complete), after which
// every signed-out landing — including this route itself, e.g. after logout —
// goes straight to Login. Login's "About OlympIQ" link reopens it manually
// with ?review=1. The giveaway countdown mounts on top whenever the
// server-resolved payment mode is "giveaway" (web GiveawayBanner parity).
import React, { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, ShieldCheck, Trophy, Zap, type LucideIcon } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { BrandMark } from "@/components/BrandMark";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { StepDots } from "@/components/StepDots";
import { CountdownBanner } from "@/components/CountdownBanner";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, shadow, spacing } from "@/theme/tokens";
import { useMobileConfig } from "@/lib/configQueries";
import { useSeenWelcome } from "@/features/boot/seenWelcome";
import { useT } from "@/i18n/useT";

type Slide = { key: string; icon: LucideIcon; tilt: string };

const SLIDES: Slide[] = [
  { key: "s1", icon: Zap, tilt: "-6deg" },
  { key: "s2", icon: Trophy, tilt: "4deg" },
  { key: "s3", icon: ShieldCheck, tilt: "-4deg" },
];

export default function Welcome() {
  const router = useRouter();
  const params = useLocalSearchParams<{ review?: string }>();
  const { t } = useT();
  const { tokens } = useTheme();
  const config = useMobileConfig().data;

  const markSeen = useSeenWelcome((s) => s.markSeen);
  // Decide the skip-redirect ONCE at mount: markSeen() while the user is still
  // reading (slide-complete) must not yank the screen away mid-view.
  const [initialSeen] = useState(() => useSeenWelcome.getState().seen);

  const [index, setIndex] = useState(0);
  const [pageW, setPageW] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const lastSlide = index === SLIDES.length - 1;

  // Reaching the final slide counts as having seen the onboarding.
  useEffect(() => {
    if (lastSlide) markSeen();
  }, [lastSlide, markSeen]);

  if (initialSeen && params.review !== "1") {
    // Already onboarded (e.g. a logout redirect pointed here) → straight to Login.
    return <Redirect href="/(public)/login" />;
  }

  const giveawayEndsAt =
    config?.payment.mode === "giveaway" ? config.payment.giveawayEndsAt : null;

  const links: { key: string; label: string; href: Href }[] = [
    { key: "pricing", label: t("nav.pricing"), href: "/(public)/pricing" },
    { key: "about", label: t("nav.about"), href: "/(public)/about" },
    { key: "faq", label: t("nav.faq"), href: "/(public)/faq" },
    { key: "contact", label: t("nav.contact"), href: "/(public)/contact" },
  ];
  if (config?.flags.newsPublic) {
    links.push({ key: "news", label: t("nav.news"), href: "/(public)/news" });
  }

  function leaveTo(href: Href, replace = false) {
    markSeen();
    if (replace) router.replace(href);
    else router.push(href);
  }

  function next() {
    const target = Math.min(index + 1, SLIDES.length - 1);
    listRef.current?.scrollToIndex({ index: target, animated: true });
    setIndex(target);
  }

  return (
    <Screen padded={false}>
      <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
        {/* Header: brand + skip */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: spacing.md,
            minHeight: 48,
          }}
        >
          <BrandMark size={30} />
          {!lastSlide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("mob.onb.skip")}
              onPress={() => leaveTo("/(public)/login", true)}
              hitSlop={12}
            >
              <AppText variant="label" color={tokens.muted}>
                {t("mob.onb.skip")}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {giveawayEndsAt ? (
          <View style={{ paddingTop: spacing.md }}>
            <CountdownBanner
              endsAt={giveawayEndsAt}
              title={t("gvw.title")}
              subtitle={t("gvw.sub")}
              labels={{
                d: t("gvw.days"),
                h: t("gvw.hours"),
                m: t("gvw.minutes"),
                s: t("gvw.seconds"),
              }}
            />
          </View>
        ) : null}

        {/* Pager */}
        <View style={{ flex: 1 }} onLayout={(e) => setPageW(e.nativeEvent.layout.width)}>
          {pageW > 0 ? (
            <FlatList
              ref={listRef}
              data={SLIDES}
              keyExtractor={(s) => s.key}
              horizontal
              pagingEnabled
              bounces={false}
              showsHorizontalScrollIndicator={false}
              getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
              onMomentumScrollEnd={(e) =>
                setIndex(
                  Math.max(
                    0,
                    Math.min(
                      SLIDES.length - 1,
                      Math.round(e.nativeEvent.contentOffset.x / pageW),
                    ),
                  ),
                )
              }
              renderItem={({ item }) => {
                const Icon = item.icon;
                return (
                  <View
                    style={{
                      width: pageW,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: spacing.xl,
                      paddingHorizontal: spacing.md,
                    }}
                  >
                    <LinearGradient
                      colors={[...gradients.brand]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        {
                          width: 132,
                          height: 132,
                          borderRadius: radius.xl,
                          alignItems: "center",
                          justifyContent: "center",
                          transform: [{ rotate: item.tilt }],
                        },
                        shadow("float", tokens.shadow),
                      ]}
                    >
                      <Icon size={62} color="#ffffff" strokeWidth={1.8} />
                    </LinearGradient>
                    <View style={{ gap: spacing.md, alignItems: "center" }}>
                      <AppText variant="display" style={{ textAlign: "center" }}>
                        {t(`mob.onb.${item.key}.title`)}
                      </AppText>
                      <AppText
                        variant="muted"
                        style={{ textAlign: "center", lineHeight: 21, maxWidth: 320 }}
                      >
                        {t(`mob.onb.${item.key}.body`)}
                      </AppText>
                    </View>
                  </View>
                );
              }}
            />
          ) : null}
        </View>

        {/* Footer: dots + CTAs */}
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <StepDots count={SLIDES.length} index={index} style={{ alignSelf: "center" }} />

          {!lastSlide ? (
            <Button
              title={t("mob.onb.next")}
              onPress={next}
              icon={<ArrowRight size={18} color="#ffffff" strokeWidth={2} />}
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              <Button
                title={t("nav.login")}
                variant="gradient"
                onPress={() => leaveTo("/(public)/login", true)}
              />
              <Button
                title={t("mob.welcome.studentLogin")}
                variant="ghost"
                onPress={() => leaveTo("/(public)/login?tab=student", true)}
              />
              <Button
                title={t("nav.register")}
                variant="ghost"
                onPress={() => leaveTo("/(public)/register", true)}
              />
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: spacing.sm,
                }}
              >
                {links.map((l) => (
                  <Pressable
                    key={l.key}
                    accessibilityRole="button"
                    accessibilityLabel={l.label}
                    onPress={() => leaveTo(l.href)}
                    style={({ pressed }) => ({
                      backgroundColor: tokens.chipBg,
                      borderRadius: 999,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.lg,
                      minHeight: 36,
                      justifyContent: "center",
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <AppText variant="label" color={tokens.chipText}>
                      {l.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>
              {__DEV__ ? (
                <Button
                  title={t("mob.gallery.title")}
                  variant="ghost"
                  onPress={() => leaveTo("/gallery")}
                />
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
