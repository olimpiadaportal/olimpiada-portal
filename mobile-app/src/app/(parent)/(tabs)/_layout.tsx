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
      // Back returns to the tab you were LAST on — not to Home. React
      // Navigation's TabRouter defaults to "firstRoute", which answers GO_BACK
      // by jumping to routes[0] (`home` here) from ANY tab, so a parent who
      // opened News from Analytics — or who was popped onto a tab by a
      // notification — was thrown to Home. That is the second half of the
      // tester report lib/navigation.ts fixes; the first half was the duplicate
      // tab navigator, and correcting only one leaves the symptom intact.
      //
      // "history" also exits correctly, which is the reason it is preferred
      // over "fullHistory": it DE-DUPLICATES, so the tab history holds at most
      // one entry per tab and bottoms out. When it does, GO_BACK returns null
      // and bubbles to the group Stack and then the root — Android hardware
      // back closes the app instead of cycling between tabs. A cold deep link
      // into a tab seeds the history with that one tab, so its first back press
      // bubbles the same way and the link's own back target still works.
      //
      // "order" was rejected: it means "the tab to the left", which is a
      // position, not a place the user has been.
      backBehavior="history"
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
