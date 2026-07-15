// Wizard / onboarding progress dots (plan §2): the active step is an animated
// pill (width 8→24). Colors default to the app accent/border but are
// overridable so arena screens can pass palette colors.
import React, { useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";

function Dot({ active, color, inactiveColor }: { active: boolean; color: string; inactiveColor: string }) {
  const width = useRef(new Animated.Value(active ? 24 : 8)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: active ? 24 : 8,
      duration: 200,
      useNativeDriver: false, // width is layout — tiny, one-shot
    }).start();
  }, [active, width]);
  return (
    <Animated.View
      style={{
        width,
        height: 8,
        borderRadius: 4,
        backgroundColor: active ? color : inactiveColor,
      }}
    />
  );
}

export function StepDots({
  count,
  index,
  color,
  inactiveColor,
  style,
}: {
  count: number;
  /** Active step, 0-based. */
  index: number;
  /** Active pill color (default: theme accent). */
  color?: string;
  /** Inactive dot color (default: theme border). */
  inactiveColor?: string;
  style?: ViewStyle;
}) {
  const { tokens } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: count, now: index + 1 }}
      style={[{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }, style]}
    >
      {Array.from({ length: count }, (_, i) => (
        <Dot
          key={i}
          active={i === index}
          color={color ?? tokens.accent}
          inactiveColor={inactiveColor ?? tokens.border}
        />
      ))}
    </View>
  );
}
