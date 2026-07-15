// Surface card: web .card contract (soft shadow, 14–22 radius, 1px border).
// Redesign (plan §2) variants: "flat" (border only), "raised" (default —
// today's soft shadow, via the sanctioned shadow() helper) and "hero"
// (radius.xl + float shadow for headline cards). Plain ViewProps consumers
// keep compiling and keep today's look.
import React from "react";
import { View, type ViewProps } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, shadow, spacing } from "@/theme/tokens";

export type CardVariant = "flat" | "raised" | "hero";

export function Card({
  variant = "raised",
  style,
  children,
  ...rest
}: ViewProps & { variant?: CardVariant }) {
  const { tokens } = useTheme();
  const base = {
    backgroundColor: tokens.surface,
    borderRadius: variant === "hero" ? radius.xl : radius.lg,
    borderWidth: 1,
    borderColor: tokens.border,
    padding: variant === "hero" ? spacing.xl : spacing.lg,
  };
  const cast =
    variant === "raised"
      ? shadow("card", tokens.shadow)
      : variant === "hero"
        ? shadow("float", tokens.shadow)
        : null;
  return (
    <View {...rest} style={[base, cast, style]}>
      {children}
    </View>
  );
}
