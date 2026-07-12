// Parent bottom tabs (web nav parity: Home / Analytics / Olympiads /
// Subscription / News). The role guard lives in the outer (parent) Stack;
// header carries the notification bell + the account sheet trigger.
import React from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { TabIcon } from "@/components/TabIcon";
import { HeaderAvatarButton } from "@/components/HeaderAvatarButton";
import { HeaderBell } from "@/components/HeaderBell";

function HeaderRight() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <HeaderBell target="/(parent)/notifications" />
      <HeaderAvatarButton />
    </View>
  );
}

export default function ParentTabs() {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: tokens.surface },
        headerTitleStyle: { color: tokens.text },
        headerRight: () => <HeaderRight />,
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
