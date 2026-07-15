// Custom bottom tab bar (plan §2): solid surface, hairline top border,
// safe-area padded; the active tab shows its icon inside a soft accent pill
// with the label under it. Parameterized by a small palette so the parent
// shell (purple accent) and the student arena (lime on dark, palette-aware)
// share one implementation:
//
//   <Tabs tabBar={(p) => <AppTabBar {...p} palette={appTabPalette(tokens)} />} …>
//   <Tabs tabBar={(p) => <AppTabBar {...p} palette={arenaTabPalette(arena)} />} …>
//
// Routes hidden via expo-router `href: null` (options.tabBarItemStyle
// display:"none") are skipped — flag-gated tabs disappear exactly like today.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { AppText } from "./AppText";
import { spacing, weight, type AppTokens, type ArenaTokens } from "@/theme/tokens";

export type TabBarPalette = {
  /** Bar surface. */
  bg: string;
  /** Top hairline. */
  line: string;
  /** Active icon/label color. */
  active: string;
  /** Soft pill behind the active icon. */
  activeBg: string;
  /** Inactive icon/label color. */
  inactive: string;
};

/** Parent/public palette from the app tokens. */
export function appTabPalette(tokens: AppTokens): TabBarPalette {
  return {
    bg: tokens.surface,
    line: tokens.border,
    active: tokens.accent,
    activeBg: tokens.pillBg,
    inactive: tokens.muted,
  };
}

/** Student arena palette (dark + all five light palettes). */
export function arenaTabPalette(arena: ArenaTokens): TabBarPalette {
  return {
    bg: arena.panel,
    line: arena.line,
    active: arena.lime,
    activeBg: arena.panel2,
    inactive: arena.muted,
  };
}

/** One tab cell — exported for the design gallery preview. */
export function AppTabBarItem({
  label,
  icon,
  focused,
  palette,
  onPress,
  onLongPress,
  testID,
}: {
  label: string;
  icon: React.ReactNode;
  focused: boolean;
  palette: TabBarPalette;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: palette.activeBg, borderless: true }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        minHeight: 52,
        paddingVertical: spacing.xs,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          paddingHorizontal: focused ? spacing.lg : 0,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: focused ? palette.activeBg : "transparent",
        }}
      >
        {icon}
      </View>
      <AppText
        numberOfLines={1}
        color={focused ? palette.active : palette.inactive}
        style={{ fontSize: 11, fontWeight: focused ? weight.bold : weight.medium }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function AppTabBar({
  state,
  descriptors,
  navigation,
  palette,
}: BottomTabBarProps & { palette: TabBarPalette }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: palette.bg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: palette.line,
        paddingBottom: insets.bottom,
        paddingHorizontal: spacing.xs,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        // expo-router `href: null` hides a tab via tabBarItemStyle.
        const itemStyle = StyleSheet.flatten(options.tabBarItemStyle);
        if (itemStyle?.display === "none") return null;

        const focused = state.index === index;
        const label =
          typeof options.tabBarLabel === "string"
            ? options.tabBarLabel
            : (options.title ?? route.name);
        const color = focused ? palette.active : palette.inactive;
        const icon = options.tabBarIcon?.({ focused, color, size: 22 }) ?? null;

        return (
          <AppTabBarItem
            key={route.key}
            label={label}
            icon={icon}
            focused={focused}
            palette={palette}
            testID={options.tabBarButtonTestID}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            onLongPress={() => {
              navigation.emit({ type: "tabLongPress", target: route.key });
            }}
          />
        );
      })}
    </View>
  );
}
