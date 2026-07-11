// Parent bottom tabs (web nav parity: Home / Analytics / Olympiads /
// Subscription / News; Notifications rides the header bell in M2; Profile
// lives behind the header avatar -> AccountSheet).
import React from "react";
import { Redirect, Tabs } from "expo-router";
import { useAuthStore } from "@/features/auth/authStore";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { TabIcon } from "@/components/TabIcon";
import { HeaderAvatarButton } from "@/components/HeaderAvatarButton";

export default function ParentLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const { tokens } = useTheme();
  const { t } = useT();

  if (status !== "signedIn") return <Redirect href="/(public)/welcome" />;
  if (role === "student") return <Redirect href="/(student)/arena" />;
  if (role !== "parent") return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: tokens.surface },
        headerTitleStyle: { color: tokens.text },
        headerRight: () => <HeaderAvatarButton />,
        tabBarStyle: { backgroundColor: tokens.surface, borderTopColor: tokens.border },
        tabBarActiveTintColor: tokens.accent,
        tabBarInactiveTintColor: tokens.muted,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("nav.home"),
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t("nav.analytics"),
          tabBarIcon: ({ color }) => <TabIcon name="chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="olympiads"
        options={{
          title: t("poly.nav"),
          tabBarIcon: ({ color }) => <TabIcon name="medal" color={color} />,
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{
          title: t("nav.subscription"),
          tabBarIcon: ({ color }) => <TabIcon name="card" color={color} />,
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
