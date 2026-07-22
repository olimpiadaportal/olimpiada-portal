// Shared article view (web NewsArticleView parity): title, date, counters, the
// like toggle, cover, plain-text body split into paragraphs on blank lines. The
// view beacon fires once per article per app session (in-memory watermark,
// mirroring the web's sessionStorage dedupe) and is the ONLY thing that ever
// moves view_count — a like must never reach it, however the caches churn.
import React, { useEffect } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { AppText } from "@/components/AppText";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { bumpNewsView, fetchNewsArticle, publicStorageUrl } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useT } from "@/i18n/useT";
import { formatNewsDate } from "./format";
import { NewsLikeButton } from "./NewsLikeButton";
import { useCanLikeNews, useMyNewsLikes, useToggleNewsLike } from "./likes";
import { markViewedOnce } from "./viewedNews";

const ARTICLE_STALE_MS = 5 * 60_000;

export function ArticleView({
  slug,
  onBack,
}: {
  slug: string;
  /** Renders an in-content back link (surfaces without a native header). */
  onBack?: () => void;
}) {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const q = useQuery({
    queryKey: ["news-article", slug, locale],
    queryFn: () => fetchNewsArticle(slug, locale),
    enabled: isSupabaseConfigured && slug.length > 0,
    staleTime: ARTICLE_STALE_MS,
  });

  const articleId = q.data?.id;
  useEffect(() => {
    if (articleId && markViewedOnce(articleId)) void bumpNewsView(articleId);
  }, [articleId]);

  const likedIds = useMyNewsLikes();
  const canLike = useCanLikeNews();
  const toggleLike = useToggleNewsLike();
  const { refreshing, onRefresh } = usePullRefresh([q]);

  const backRow = onBack ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("newsp.back")}
      onPress={onBack}
      hitSlop={8}
    >
      <AppText variant="label" color={tokens.accent}>
        {t("newsp.back")}
      </AppText>
    </Pressable>
  ) : null;

  const container = {
    padding: spacing.lg,
    paddingBottom: insets.bottom + spacing.xl,
    gap: spacing.lg,
  } as const;

  if (!isSupabaseConfigured || (!q.isPending && !q.isError && !q.data)) {
    return (
      <ScrollView contentContainerStyle={container}>
        {backRow}
        <EmptyState title={t("news.unavailable")} />
      </ScrollView>
    );
  }

  if (q.isPending) {
    return (
      <ScrollView contentContainerStyle={container}>
        {backRow}
        <Skeleton height={26} width="85%" />
        <Skeleton height={14} width="55%" />
        <Skeleton height={180} />
        <Skeleton height={14} />
        <Skeleton height={14} width="90%" />
        <Skeleton height={14} width="70%" />
      </ScrollView>
    );
  }

  if (q.isError || !q.data) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ padding: spacing.lg }}>{backRow}</View>
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => void q.refetch()}
        />
      </View>
    );
  }

  const article = q.data;
  const cover = article.cover
    ? publicStorageUrl(article.cover.bucket, article.cover.path)
    : null;
  const date = formatNewsDate(article.published_at, locale, "long");
  const views = article.view_count ?? 0;
  const likes = article.like_count ?? 0;
  const liked = likedIds.has(article.id);

  // Blank lines separate paragraphs; single newlines stay inside a paragraph.
  const paragraphs = article.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <ScrollView
      contentContainerStyle={container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          accessibilityLabel={t("mob.refreshing")}
        />
      }
    >
      {backRow}
      <AppText variant="heading">{article.title}</AppText>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          flexWrap: "wrap",
        }}
      >
        {date ? (
          <AppText variant="muted">
            {t("news.published")} {date}
          </AppText>
        ) : null}
        <AppText variant="muted">
          {views} {t("news.views")}
        </AppText>
        <NewsLikeButton
          count={likes}
          liked={liked}
          canLike={canLike}
          onToggle={() => void toggleLike(article.id, !liked)}
        />
      </View>

      {cover ? (
        <Image
          source={{ uri: cover }}
          style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: radius.lg }}
          contentFit="cover"
          transition={150}
          accessible={false}
        />
      ) : null}

      <View style={{ gap: spacing.md }}>
        {paragraphs.map((p, i) => (
          <AppText key={i} style={{ lineHeight: 24 }}>
            {p}
          </AppText>
        ))}
      </View>
    </ScrollView>
  );
}
