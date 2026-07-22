// Public FAQ (web /faq parity): the ten faq.q*/faq.a* pairs as expandable
// accordion cards — LayoutAnimation eases the expansion (plan §4-Public);
// lucide chevron rotates on the open item.
import React, { useState } from "react";
import { LayoutAnimation, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDown } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useContentOverrides } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useT } from "@/i18n/useT";

const QUESTION_COUNT = 10;

function Chevron({ open, color }: { open: boolean; color: string }) {
  return (
    <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
      <ChevronDown size={18} color={color} strokeWidth={2} />
    </View>
  );
}

export default function Faq() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(null);

  // Every question/answer is CMS-overridable — that query is the live data.
  const overridesQ = useContentOverrides(locale);
  const { refreshing, onRefresh } = usePullRefresh([overridesQ]);

  const items = Array.from({ length: QUESTION_COUNT }, (_, i) => ({
    q: t(`faq.q${i + 1}`),
    a: t(`faq.a${i + 1}`),
  }));

  function toggle(i: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((cur) => (cur === i ? null : i));
  }

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
                onPress={() => toggle(i)}
                android_ripple={{ color: tokens.chipBg }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  padding: spacing.lg,
                  minHeight: 48,
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
