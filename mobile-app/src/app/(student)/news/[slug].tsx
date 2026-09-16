// Student article route: a signed-in student's /news/{slug} deep link opens
// the article inside the student shell — arena background + the layout's
// palette-aware arena header (native back, Android hardware back pops) —
// instead of the shared (public) screen. Fetch, view beacon and empty/error
// states all live in ArticleView (content keeps the app tokens, like the
// news-tab modal); in-app news is ungated (news_public is signed-out-only).
import React from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { HeaderHomeButton } from "@/components/HeaderHomeButton";
import { ArticleView } from "@/features/news/ArticleView";
import { useArena } from "@/features/arena/useArena";
import { useT } from "@/i18n/useT";

export default function StudentNewsArticle() {
  const { arena } = useArena();
  const { t } = useT();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";

  return (
    <>
      {/* Merged into the options the (student) Stack already declares for this
          route, so the layout's back chevron and title are untouched. The tab
          this returns to is the ARENA, so it wears the bolt rather than a house. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderHomeButton
              href="/(student)/(tabs)/home"
              icon="arena"
              label={t("arena.nav.arena")}
              color={arena.lime}
              background={arena.panel2}
              borderColor={arena.line}
            />
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: arena.bg }}>
        <ArticleView slug={slug} />
      </View>
    </>
  );
}
