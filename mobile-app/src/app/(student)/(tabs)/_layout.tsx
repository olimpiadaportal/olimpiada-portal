// Student bottom tabs, arena chrome (web parity: Arena / Tests / Olympiads /
// Ranking / News). Olympiads + Ranking DISAPPEAR entirely when their flags are
// off (href: null), exactly like the web nav. The chrome follows the child's
// chosen arena palette (useArena — default until the student row loads), and
// the header carries the web .pnav-right trio: streak chip + notification bell
// (flag-gated inside HeaderBell) + account-sheet avatar trigger. The bar itself
// is the redesign AppTabBar (active pill + focused-fill lucide icons).
import React from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useMobileConfig } from "@/lib/configQueries";
import { useArena } from "@/features/arena/useArena";
import { useT } from "@/i18n/useT";
import { AppTabBar, arenaTabPalette } from "@/components/AppTabBar";
import { TabIcon } from "@/components/TabIcon";
import { HeaderAvatarButton } from "@/components/HeaderAvatarButton";
import { HeaderBell } from "@/components/HeaderBell";
import { StreakChip } from "@/components/StreakChip";
import { weight } from "@/theme/tokens";

function HeaderRight() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <StreakChip />
      <HeaderBell target="/(student)/notifications" />
      <HeaderAvatarButton />
    </View>
  );
}

export default function StudentTabs() {
  const config = useMobileConfig();
  const { arena } = useArena();
  const { t } = useT();

  const olympiadOn = config.data?.flags.olympiadModule ?? false;
  const leaderboardOn = config.data?.flags.leaderboard ?? false;

  return (
    <Tabs
      tabBar={(p) => <AppTabBar {...p} palette={arenaTabPalette(arena)} />}
      screenOptions={{
        headerStyle: { backgroundColor: arena.panel },
        headerTitleStyle: { color: arena.ink, fontWeight: weight.bold },
        headerShadowVisible: false,
        headerRight: () => <HeaderRight />,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("arena.nav.arena"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="arena" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="tests"
        options={{
          title: t("arena.nav.test"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="test" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="olympiads"
        options={{
          title: t("arena.nav.tasks"),
          href: olympiadOn ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="medal" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: t("arena.nav.rank"),
          href: leaderboardOn ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="rank" color={color} focused={focused} />
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
