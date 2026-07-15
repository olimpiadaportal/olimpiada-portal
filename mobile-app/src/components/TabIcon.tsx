// Tab icons — lucide-backed since the redesign (one icon language, stroke 2).
// The export signature is unchanged so existing tab layouts keep compiling;
// the optional `focused` prop soft-fills the glyph for the AppTabBar active
// pill (forward it from tabBarIcon's { focused } once layouts adopt it).
import React from "react";
import type { ColorValue } from "react-native";
import {
  ChartColumn,
  ClipboardList,
  CreditCard,
  House,
  Medal,
  Newspaper,
  Trophy,
  Zap,
} from "lucide-react-native";

export type TabIconName =
  | "home"
  | "chart"
  | "medal"
  | "card"
  | "news"
  | "arena"
  | "test"
  | "rank";

const ICONS = {
  home: House,
  chart: ChartColumn,
  medal: Medal,
  card: CreditCard,
  news: Newspaper,
  arena: Zap,
  test: ClipboardList,
  rank: Trophy,
} as const;

export function TabIcon({
  name,
  color,
  size = 22,
  focused = false,
}: {
  name: TabIconName;
  color: ColorValue;
  size?: number;
  /** Active-tab state: adds a soft fill under the stroke ("filled-ish"). */
  focused?: boolean;
}) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  const c = String(color);
  return (
    <Icon
      size={size}
      color={c}
      strokeWidth={2}
      fill={focused ? c : "none"}
      fillOpacity={focused ? 0.25 : undefined}
    />
  );
}
