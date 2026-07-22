// Parent in-app news tab — the SAME shared list as the public /news route but
// UNGATED (web parity: /dashboard/news ignores the news_public flag; it only
// governs the public site). Articles open as a full-screen modal driven by
// local state (the owner-approved in-tab UX); deep links to a single article
// land on the (parent)/news/[slug] route instead.
import React, { useState } from "react";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NewsListScreen } from "@/features/news/NewsListScreen";
import { ArticleView } from "@/features/news/ArticleView";
import { ToastHost } from "@/components/Toast";
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
        {/* A Modal is its own native window, so the root ToastHost is behind
            it — the article's pull feedback needs a host in here. Sibling of
            the padded body so it keeps its own single safe-area offset. */}
        <ToastHost />
      </Modal>
    </View>
  );
}
