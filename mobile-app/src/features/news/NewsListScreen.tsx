// Shared news list (web NewsBrowser parity): one implementation serving the
// PUBLIC /news route and the parent tab. The caller decides what opening an
// article means (route push vs in-tab modal), so the list stays surface-free.
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/Card";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { fetchNews } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useT } from "@/i18n/useT";
import { NewsCard } from "./NewsCard";
import { useCanLikeNews, useMyNewsLikes, useToggleNewsLike } from "./likes";

const NEWS_STALE_MS = 5 * 60_000;

function SkeletonCard() {
  return (
    <Card style={{ gap: spacing.sm }}>
      <Skeleton height={140} />
      <Skeleton height={18} width="80%" />
      <Skeleton height={14} width="50%" />
    </Card>
  );
}

export function NewsListScreen({
  onOpenArticle,
  spinnerTint,
}: {
  onOpenArticle: (slug: string) => void;
  /** Spinner colour for surfaces off the app palette (the student arena tab). */
  spinnerTint?: string;
}) {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const q = useQuery({
    queryKey: ["news", locale],
    queryFn: () => fetchNews(locale),
    enabled: isSupabaseConfigured,
    staleTime: NEWS_STALE_MS,
  });
  const { refreshing, onRefresh } = usePullRefresh([q]);

  // Optional by design: the likes query stays silent for signed-out viewers, so
  // the public list keeps rendering exactly as before.
  const likedIds = useMyNewsLikes();
  const canLike = useCanLikeNews();
  const toggleLike = useToggleNewsLike();

  const pad = {
    padding: spacing.lg,
    paddingBottom: insets.bottom + spacing.lg,
  } as const;
  const spinner = spinnerTint ?? tokens.accent;

  if (!isSupabaseConfigured) {
    return (
      <View style={pad}>
        <EmptyState title={t("newsp.none")} />
      </View>
    );
  }

  if (q.isPending) {
    return (
      <View style={[pad, { gap: spacing.lg }]}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (q.isError && !q.data) {
    return (
      <ErrorRetry
        message={t("mob.boot.error")}
        retryLabel={t("mob.retry")}
        onRetry={() => void q.refetch()}
      />
    );
  }

  return (
    <FlatList
      data={q.data ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const liked = likedIds.has(item.id);
        return (
          <NewsCard
            item={item}
            liked={liked}
            canLike={canLike}
            onToggleLike={() => void toggleLike(item.id, !liked)}
            onPress={() => onOpenArticle(item.slug)}
          />
        );
      }}
      // FlatList is pure: without this the hearts would not repaint when the
      // viewer's like set arrives or changes.
      extraData={likedIds}
      contentContainerStyle={[pad, { gap: spacing.lg, flexGrow: 1 }]}
      ListEmptyComponent={
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState title={t("newsp.none")} />
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={spinner}
          colors={[spinner]}
          accessibilityLabel={t("mob.refreshing")}
        />
      }
    />
  );
}
