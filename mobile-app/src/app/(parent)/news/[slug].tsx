// Parent article route: a signed-in parent's /news/{slug} deep link opens the
// article inside the parent shell (layout-themed native header + back, Android
// hardware back pops) instead of the shared (public) screen. Fetch, view
// beacon and empty/error states all live in ArticleView; no news_public gate
// here — that flag only governs the signed-out surface (in-app news is
// ungated, web parity).
import React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ArticleView } from "@/features/news/ArticleView";
import { useTheme } from "@/theme/ThemeProvider";

export default function ParentNewsArticle() {
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ArticleView slug={slug} />
    </View>
  );
}
