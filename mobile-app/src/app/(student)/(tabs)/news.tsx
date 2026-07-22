// Student in-app news tab — the SAME shared list as the public/parent surfaces
// (web parity: /child/news ignores the news_public flag; that flag only governs
// the public site), on the arena background. Articles open as a full-screen
// modal (the parent-tab pattern); the once-per-session view beacon fires inside
// ArticleView.
import React, { useState } from "react";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NewsListScreen } from "@/features/news/NewsListScreen";
import { ArticleView } from "@/features/news/ArticleView";
import { ToastHost } from "@/components/Toast";
import { useArena } from "@/features/arena/useArena";

export default function StudentNews() {
  const { arena } = useArena();
  const insets = useSafeAreaInsets();
  const [slug, setSlug] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: arena.bg }}>
      <NewsListScreen onOpenArticle={setSlug} spinnerTint={arena.lime} />
      <Modal
        visible={slug !== null}
        animationType="slide"
        onRequestClose={() => setSlug(null)}
      >
        <View style={{ flex: 1, backgroundColor: arena.bg, paddingTop: insets.top }}>
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
