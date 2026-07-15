// Parent bottom tabs (web nav parity: Home / Analytics / Olympiads /
// Subscription / News) on the redesigned AppTabBar (accent pill + lucide
// icons). The role guard lives in the outer (parent) Stack; headers carry the
// notification bell + the account sheet trigger — except Home, which draws its
// own greeting header row.
import React from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { TabIcon } from "@/components/TabIcon";
import { AppTabBar, appTabPalette } from "@/components/AppTabBar";
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
      tabBar={(p) => <AppTabBar {...p} palette={appTabPalette(tokens)} />}
      screenOptions={{
        headerStyle: { backgroundColor: tokens.surface },
        headerTitleStyle: { color: tokens.text },
        headerRight: () => <HeaderRight />,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("nav.home"),
          // Home draws its own greeting header (bell + avatar included).
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t("nav.analytics"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="chart" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="olympiads"
        options={{
          title: t("poly.nav"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="medal" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{
          title: t("nav.subscription"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="card" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: t("nav.news"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="news" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
