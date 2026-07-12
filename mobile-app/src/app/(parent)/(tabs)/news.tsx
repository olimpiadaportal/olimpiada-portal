// Parent in-app news tab — the SAME shared list as the public /news route but
// UNGATED (web parity: /dashboard/news ignores the news_public flag; it only
// governs the public site). Articles open as a full-screen modal driven by
// local state because the (public) layout redirects signed-in users away from
// (public)/news/[slug], and this stage may not add new (parent) route files.
import React, { useState } from "react";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NewsListScreen } from "@/features/news/NewsListScreen";
import { ArticleView } from "@/features/news/ArticleView";
import { useTheme } from "@/theme/ThemeProvider";

export default function ParentNews() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [slug, setSlug] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <NewsListScreen onOpenArticle={setSlug} />
      <Modal
        visible={slug !== null}
        animationType="slide"
        onRequestClose={() => setSlug(null)}
      >
        <View style={{ flex: 1, backgroundColor: tokens.bg, paddingTop: insets.top }}>
          {slug ? <ArticleView slug={slug} onBack={() => setSlug(null)} /> : null}
        </View>
      </Modal>
    </View>
  );
}
