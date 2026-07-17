// News article. The news_public flag gates the SIGNED-OUT surface only (web
// parity: in-app news is ungated). Signed-in /news/{slug} deep links resolve
// to the ROLE article routes ((parent|student)/news/[slug]) — this screen
// serves the public news list; the signed-in fallback below stays for direct
// in-session pushes.
import React from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ArticleView } from "@/features/news/ArticleView";
import { ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useMobileConfig } from "@/lib/configQueries";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/features/auth/authStore";

export default function PublicNewsArticle() {
  const { t } = useT();
  const { tokens } = useTheme();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const config = useMobileConfig();
  const signedIn = useAuthStore((s) => s.status) === "signedIn";

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
  } else if (!config.data.flags.newsPublic && !signedIn) {
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
