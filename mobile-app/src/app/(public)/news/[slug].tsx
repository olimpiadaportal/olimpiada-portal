// Public news article. Same news_public gate as the public list (web parity);
// signed-in readers never land here — the parent tab presents the shared
// ArticleView in-tab because the (public) layout redirects authenticated users.
import React from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ArticleView } from "@/features/news/ArticleView";
import { ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useMobileConfig } from "@/lib/configQueries";
import { useT } from "@/i18n/useT";

export default function PublicNewsArticle() {
  const { t } = useT();
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const config = useMobileConfig();

  let body: React.ReactNode;
  if (config.isPending) {
    body = (
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton height={26} width="85%" />
        <Skeleton height={14} />
        <Skeleton height={14} width="80%" />
      </View>
    );
  } else if (config.isError) {
    body = (
      <ErrorRetry
        message={t("mob.boot.error")}
        retryLabel={t("mob.retry")}
        onRetry={() => void config.refetch()}
      />
    );
  } else if (!config.data.flags.newsPublic) {
    body = (
      <View style={{ padding: spacing.lg }}>
        <GateNotice title={t("nav.news")} body={t("news.unavailable")} />
      </View>
    );
  } else {
    body = <ArticleView slug={slug} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("nav.news"),
          headerStyle: { backgroundColor: tokens.surface },
          headerTitleStyle: { color: tokens.text },
          headerTintColor: tokens.accent,
          headerShadowVisible: false,
        }}
      />
      {body}
    </View>
  );
}
