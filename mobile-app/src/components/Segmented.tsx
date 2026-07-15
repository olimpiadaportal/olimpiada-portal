// Segmented control (web LanguageSegmented / ThemeToggle "segmented" parity):
// a soft full-round track with a raised active chip (redesign radii/shadow
// standard). API unchanged.
import React from "react";
import { Pressable, View } from "react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { shadow, spacing } from "@/theme/tokens";

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
        borderRadius: 999,
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
            style={[
              {
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.lg,
                borderRadius: 999,
                backgroundColor: active ? tokens.surface : "transparent",
                minHeight: 36,
                alignItems: "center",
                justifyContent: "center",
              },
              active ? shadow("card", tokens.shadow) : null,
            ]}
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
