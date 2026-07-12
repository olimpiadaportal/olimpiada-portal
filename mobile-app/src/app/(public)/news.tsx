// Public news list — gated by the admin news_public flag (web /news parity).
// The in-app parent tab renders the same list UNGATED; the flag governs the
// public surface only.
import React from "react";
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { NewsListScreen } from "@/features/news/NewsListScreen";
import { ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useMobileConfig } from "@/lib/configQueries";
import { useT } from "@/i18n/useT";

export default function PublicNews() {
  const { t } = useT();
  const { tokens } = useTheme();
  const router = useRouter();
  const config = useMobileConfig();

  let body: React.ReactNode;
  if (config.isPending) {
    body = (
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton height={18} width="60%" />
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
    body = (
      <NewsListScreen
        onOpenArticle={(slug) =>
          router.push({ pathname: "/(public)/news/[slug]", params: { slug } })
        }
      />
    );
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
