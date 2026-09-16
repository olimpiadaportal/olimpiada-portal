// Parent article route: a signed-in parent's /news/{slug} deep link opens the
// article inside the parent shell (layout-themed native header + back, Android
// hardware back pops) instead of the shared (public) screen. Fetch, view
// beacon and empty/error states all live in ArticleView; no news_public gate
// here — that flag only governs the signed-out surface (in-app news is
// ungated, web parity).
import React from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { HeaderHomeButton } from "@/components/HeaderHomeButton";
import { ArticleView } from "@/features/news/ArticleView";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";

export default function ParentNewsArticle() {
  const { tokens } = useTheme();
  const { t } = useT();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";

  return (
    <>
      {/* Merged into the options the (parent) Stack already declares for this
          route, so the layout's back chevron and title are untouched. An
          article is usually reached from a push or a shared link, which is
          exactly the entry that leaves a parent with no tab bar. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderHomeButton
              href="/(parent)/(tabs)/home"
              icon="home"
              label={t("nav.home")}
              color={tokens.accent}
              background={tokens.chipBg}
              borderColor={tokens.border}
            />
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <ArticleView slug={slug} />
      </View>
    </>
  );
}
