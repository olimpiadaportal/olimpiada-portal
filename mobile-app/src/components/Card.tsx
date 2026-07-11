import React from "react";
import { View, type ViewProps } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";

/** Surface card: web .card contract (soft shadow, 14–22 radius, 1px border). */
export function Card({ style, children, ...rest }: ViewProps) {
  const { tokens } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: tokens.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tokens.border,
          padding: spacing.lg,
          shadowColor: tokens.shadow,
          shadowOpacity: 1,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
