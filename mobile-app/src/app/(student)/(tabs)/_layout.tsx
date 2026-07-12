// Student bottom tabs, arena chrome (web parity: Arena / Tests / Olympiads /
// Ranking / News). Olympiads + Ranking DISAPPEAR entirely when their flags are
// off (href: null), exactly like the web nav. The chrome follows the child's
// chosen arena palette (useArena — default until the student row loads), and
// the header carries the web .pnav-right trio: streak chip + notification bell
// (flag-gated inside HeaderBell) + account-sheet avatar trigger.
import React from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useMobileConfig } from "@/lib/configQueries";
import { useArena } from "@/features/arena/useArena";
import { useT } from "@/i18n/useT";
import { TabIcon } from "@/components/TabIcon";
import { HeaderAvatarButton } from "@/components/HeaderAvatarButton";
import { HeaderBell } from "@/components/HeaderBell";
import { StreakChip } from "@/components/StreakChip";

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
      screenOptions={{
        headerStyle: { backgroundColor: arena.panel },
        headerTitleStyle: { color: arena.ink },
        headerRight: () => <HeaderRight />,
        tabBarStyle: { backgroundColor: arena.panel, borderTopColor: arena.line },
        tabBarActiveTintColor: arena.lime,
        tabBarInactiveTintColor: arena.muted,
      }}
    >
      <Tabs.Screen
        name="home"
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
