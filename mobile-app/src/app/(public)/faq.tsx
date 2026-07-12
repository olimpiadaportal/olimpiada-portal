// Public FAQ (web /faq parity): the ten faq.q*/faq.a* pairs as a pressable
// accordion. No layout animation — expansion is an instant conditional render,
// which also inherently respects reduce-motion settings.
import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";

const QUESTION_COUNT = 10;

function Chevron({ open, color }: { open: boolean; color: string }) {
  return (
    <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="m6 9 6 6 6-6"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export default function Faq() {
  const { t } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(null);

  const items = Array.from({ length: QUESTION_COUNT }, (_, i) => ({
    q: t(`faq.q${i + 1}`),
    a: t(`faq.a${i + 1}`),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("nav.faq"),
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
          gap: spacing.md,
        }}
      >
        <AppText variant="heading" style={{ marginBottom: spacing.sm }}>
          {t("faq.title")}
        </AppText>

        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <Card key={i} style={{ padding: 0, overflow: "hidden" }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.q}
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setOpen(isOpen ? null : i)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  padding: spacing.lg,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <AppText variant="label" style={{ flex: 1 }}>
                  {item.q}
                </AppText>
                <Chevron open={isOpen} color={tokens.accent} />
              </Pressable>
              {isOpen ? (
                <View
                  style={{
                    paddingHorizontal: spacing.lg,
                    paddingBottom: spacing.lg,
                  }}
                >
                  <AppText variant="muted" style={{ lineHeight: 21 }}>
                    {item.a}
                  </AppText>
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}
