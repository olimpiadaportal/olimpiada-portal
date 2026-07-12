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
import { useT } from "@/i18n/useT";
import { NewsCard } from "./NewsCard";

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
}: {
  onOpenArticle: (slug: string) => void;
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

  const pad = {
    padding: spacing.lg,
    paddingBottom: insets.bottom + spacing.lg,
  } as const;

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
      renderItem={({ item }) => (
        <NewsCard item={item} onPress={() => onOpenArticle(item.slug)} />
      )}
      contentContainerStyle={[pad, { gap: spacing.lg, flexGrow: 1 }]}
      ListEmptyComponent={
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState title={t("newsp.none")} />
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
        />
      }
    />
  );
}
