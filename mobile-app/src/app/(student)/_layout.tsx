// Student bottom tabs, arena chrome (web parity: Arena / Tests / Olympiads /
// Ranking / News). Olympiads + Ranking DISAPPEAR entirely when their flags are
// off (href: null), exactly like the web nav. The arena palette (per-child
// light-mode remap) is applied to the chrome from M3 when the student profile
// loads; M1 uses the arena base tokens.
import React from "react";
import { Redirect, Tabs } from "expo-router";
import { useAuthStore } from "@/features/auth/authStore";
import { useMobileConfig } from "@/lib/configQueries";
import { useTheme } from "@/theme/ThemeProvider";
import { arenaTokens } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { TabIcon } from "@/components/TabIcon";
import { HeaderAvatarButton } from "@/components/HeaderAvatarButton";

export default function StudentLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const config = useMobileConfig();
  const { theme } = useTheme();
  const { t } = useT();

  if (status !== "signedIn") return <Redirect href="/(public)/welcome" />;
  if (role === "parent") return <Redirect href="/(parent)/home" />;
  if (role !== "student") return <Redirect href="/" />;

  const arena = arenaTokens(theme, "default");
  const olympiadOn = config.data?.flags.olympiadModule ?? false;
  const leaderboardOn = config.data?.flags.leaderboard ?? false;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: arena.panel },
        headerTitleStyle: { color: arena.ink },
        headerRight: () => <HeaderAvatarButton />,
        tabBarStyle: { backgroundColor: arena.panel, borderTopColor: arena.line },
        tabBarActiveTintColor: arena.lime,
        tabBarInactiveTintColor: arena.muted,
      }}
    >
      <Tabs.Screen
        name="arena"
        options={{
          title: t("arena.nav.arena"),
          tabBarIcon: ({ color }) => <TabIcon name="arena" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tests"
        options={{
          title: t("arena.nav.test"),
          tabBarIcon: ({ color }) => <TabIcon name="test" color={color} />,
        }}
      />
      <Tabs.Screen
        name="olympiads"
        options={{
          title: t("arena.nav.tasks"),
          href: olympiadOn ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon name="medal" color={color} />,
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: t("arena.nav.rank"),
          href: leaderboardOn ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon name="rank" color={color} />,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: t("nav.news"),
          tabBarIcon: ({ color }) => <TabIcon name="news" color={color} />,
        }}
      />
    </Tabs>
  );
}
