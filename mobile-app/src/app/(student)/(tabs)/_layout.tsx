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
      // Same decision as the parent tabs, where the reasoning is written out:
      // back goes to the previously focused tab, not to routes[0] (`home` =
      // Arena). It is the LEAVE path of the whole test chain — Result "Yeni
      // test", Review "Testlərə qayıt", the runner's cancel and the leave
      // guard's fallback all pop back onto the Tests tab, and every one of them
      // then answered back with Arena.
      //
      // The flag-gated tabs are the reason to say it again here rather than
      // just point at the parent layout. `href: null` is a TAB BAR change, not
      // a router change: expo-router turns it into `tabBarButton: () => null`
      // plus `tabBarItemStyle: { display: "none" }` (which is what AppTabBar
      // filters on), and the screen stays in `routeNames`, stays in `routes`
      // and stays reachable by a deep link or a notification tap. So "order"
      // ("the tab to the left") could answer back with a tab that has no
      // button on this child's screen, and no flag flip ever moves the focused
      // tab on its own — nothing is removed, so nothing falls back anywhere.
      // "history" answers with a tab the child actually visited, which is the
      // only one of the three that is honest about where they came from.
      backBehavior="history"
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
