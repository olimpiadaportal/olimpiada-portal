// Welcome: auth entry + compact public-site navigation (web landing nav
// parity: Pricing / About / FAQ / Contact, News only while the admin
// news_public flag is on). The giveaway countdown mounts on top whenever the
// server-resolved payment mode is "giveaway" (web GiveawayBanner parity).
import React from "react";
import { Pressable, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Screen } from "@/components/Screen";
import { BrandMark } from "@/components/BrandMark";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { CountdownBanner } from "@/components/CountdownBanner";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useMobileConfig } from "@/lib/configQueries";
import { useT } from "@/i18n/useT";

export default function Welcome() {
  const router = useRouter();
  const { t } = useT();
  const { tokens } = useTheme();
  const config = useMobileConfig().data;

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

  return (
    <Screen scroll>
      <View style={{ gap: spacing.xl, paddingTop: spacing.lg }}>
        {giveawayEndsAt ? (
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
        ) : null}

        <View style={{ alignItems: "center", gap: spacing.lg, paddingTop: spacing.xl }}>
          <BrandMark size={72} />
          <AppText variant="muted" style={{ textAlign: "center" }}>
            {t("mob.welcome.tagline")}
          </AppText>
        </View>

        <View style={{ gap: spacing.md }}>
          <Button title={t("nav.login")} onPress={() => router.push("/(public)/login")} />
          <Button
            title={t("mob.welcome.studentLogin")}
            variant="ghost"
            onPress={() => router.push("/(public)/login?tab=student")}
          />
          <Button
            title={t("nav.register")}
            variant="ghost"
            onPress={() => router.push("/(public)/register")}
          />
        </View>

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
              onPress={() => router.push(l.href)}
              style={({ pressed }) => ({
                backgroundColor: tokens.chipBg,
                borderRadius: radius.md,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.lg,
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
            onPress={() => router.push("/gallery")}
          />
        ) : null}
      </View>
    </Screen>
  );
}
