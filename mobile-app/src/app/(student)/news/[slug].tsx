// Student article route: a signed-in student's /news/{slug} deep link opens
// the article inside the student shell — arena background + the layout's
// palette-aware arena header (native back, Android hardware back pops) —
// instead of the shared (public) screen. Fetch, view beacon and empty/error
// states all live in ArticleView (content keeps the app tokens, like the
// news-tab modal); in-app news is ungated (news_public is signed-out-only).
import React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ArticleView } from "@/features/news/ArticleView";
import { useArena } from "@/features/arena/useArena";

export default function StudentNewsArticle() {
  const { arena } = useArena();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";

  return (
    <View style={{ flex: 1, backgroundColor: arena.bg }}>
      <ArticleView slug={slug} />
    </View>
  );
}
