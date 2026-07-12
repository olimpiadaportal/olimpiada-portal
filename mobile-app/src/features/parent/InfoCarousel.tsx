// Onboarding "how to get started" carousel (web InfoCarousel parity):
// horizontally snap-scrolling cards + dot indicators, carousel.* copy.
import React, { useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";

const SLIDES = [1, 2, 3, 4, 5] as const;

export function InfoCarousel() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - spacing.lg * 2 - spacing.xl, 480);
  const [page, setPage] = useState(0);

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="title">{t("carousel.title")}</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + spacing.md}
        decelerationRate="fast"
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.xs }}
        onMomentumScrollEnd={(e) => {
          const p = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + spacing.md));
          setPage(Math.max(0, Math.min(SLIDES.length - 1, p)));
        }}
      >
        {SLIDES.map((n) => (
          <Card key={n} style={{ width: cardWidth, gap: spacing.sm }}>
            <AppText variant="label" color={tokens.accent}>
              {n}/{SLIDES.length}
            </AppText>
            <AppText variant="title" style={{ fontSize: 18 }}>
              {t(`carousel.i${n}.title`)}
            </AppText>
            <AppText variant="muted">{t(`carousel.i${n}.body`)}</AppText>
          </Card>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: spacing.xs, alignSelf: "center" }}>
        {SLIDES.map((n, i) => (
          <View
            key={n}
            style={{
              width: i === page ? 16 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === page ? tokens.accent : tokens.border,
            }}
          />
        ))}
      </View>
    </View>
  );
}
