// Public About (web /about parity): about2.* copy — hero with eyebrow/chips,
// five story blocks, four-value grid. Mobile keeps the same section order but
// drops the web's large SVG illustrations for a simple scroll layout.
import React from "react";
import { ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";

const BLOCKS = ["b1", "b2", "b3", "b4", "b5"] as const;
const VALUES = ["v1", "v2", "v3", "v4"] as const;
const CHIPS = ["chip1", "chip2", "chip3"] as const;

function Pill({
  text,
  bg,
  color,
}: {
  text: string;
  bg: string;
  color: string;
}) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: bg,
        borderRadius: 999,
        paddingVertical: 3,
        paddingHorizontal: spacing.md,
      }}
    >
      <AppText variant="label" color={color} style={{ fontSize: 12 }}>
        {text}
      </AppText>
    </View>
  );
}

export default function About() {
  const { t } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

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
      >
        <View style={{ gap: spacing.md }}>
          <Pill text={t("about2.hero.eyebrow")} bg={tokens.pillBg} color={tokens.pillText} />
          <AppText variant="display">{t("about2.hero.title")}</AppText>
          <AppText variant="muted">{t("about2.hero.lead")}</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {CHIPS.map((c) => (
              <Pill
                key={c}
                text={t(`about2.hero.${c}`)}
                bg={tokens.chipBg}
                color={tokens.chipText}
              />
            ))}
          </View>
        </View>

        {BLOCKS.map((b) => (
          <Card key={b} style={{ gap: spacing.sm }}>
            <Pill text={t(`about2.${b}.tag`)} bg={tokens.pillBg} color={tokens.pillText} />
            <AppText variant="title">{t(`about2.${b}.title`)}</AppText>
            <AppText variant="muted">{t(`about2.${b}.body`)}</AppText>
          </Card>
        ))}

        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <AppText variant="title">{t("about2.values.title")}</AppText>
          <AppText variant="muted">{t("about2.values.sub")}</AppText>
        </View>

        {VALUES.map((v) => (
          <Card key={v} style={{ gap: spacing.sm }}>
            <AppText variant="label" color={tokens.accent}>
              {t(`about2.${v}.title`)}
            </AppText>
            <AppText variant="muted">{t(`about2.${v}.body`)}</AppText>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
