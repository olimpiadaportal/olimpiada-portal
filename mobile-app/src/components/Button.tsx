import React from "react";
import { ActivityIndicator, Pressable, type ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";

type Variant = "primary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  pending = false,
  pendingTitle,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  pending?: boolean;
  /** Label swapped in while pending (web "saving…" parity). */
  pendingTitle?: string;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { tokens } = useTheme();
  const blocked = disabled || pending;

  const bg =
    variant === "primary" ? tokens.accent : variant === "danger" ? tokens.danger : "transparent";
  const fg = variant === "ghost" ? tokens.accent : "#ffffff";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: blocked, busy: pending }}
      onPress={blocked ? undefined : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor: tokens.accent,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xl,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: spacing.sm,
          opacity: blocked ? 0.55 : pressed ? 0.85 : 1,
          minHeight: 48,
        },
        style,
      ]}
    >
      {pending ? <ActivityIndicator size="small" color={fg} /> : null}
      <AppText variant="label" color={fg}>
        {pending && pendingTitle ? pendingTitle : title}
      </AppText>
    </Pressable>
  );
}
