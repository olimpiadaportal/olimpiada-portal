import React from "react";
import { Pressable, View } from "react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";

/**
 * Segmented control (web LanguageSegmented / ThemeToggle "segmented" parity):
 * a soft track with a raised active segment.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { tokens } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: tokens.chipBg,
        borderRadius: radius.md,
        padding: 3,
        alignSelf: "flex-start",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.sm,
              backgroundColor: active ? tokens.surface : "transparent",
              elevation: active ? 1 : 0,
            }}
          >
            <AppText
              variant="label"
              color={active ? tokens.accent : tokens.muted}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
