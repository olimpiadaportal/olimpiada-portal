// Onboarding "how to get started" carousel (web InfoCarousel parity):
// horizontally snap-scrolling cards + StepDots. Redesign: numbered accent
// chip, tighter type hierarchy, raised cards.
import React, { useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { StepDots } from "@/components/StepDots";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
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
      <AppText variant="eyebrow">{t("carousel.title")}</AppText>
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
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: radius.sm,
                backgroundColor: tokens.pillBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText variant="mono" color={tokens.pillText} style={{ fontSize: 13, fontWeight: "700" }}>
                {n}
              </AppText>
            </View>
            <AppText variant="title" style={{ fontSize: 18 }}>
              {t(`carousel.i${n}.title`)}
            </AppText>
            <AppText variant="muted">{t(`carousel.i${n}.body`)}</AppText>
          </Card>
        ))}
      </ScrollView>
      <StepDots count={SLIDES.length} index={page} style={{ alignSelf: "center" }} />
    </View>
  );
}
