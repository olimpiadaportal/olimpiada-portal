// Primary action primitive. Redesign (plan §2): pressed-scale 0.97 (native
// driver), android_ripple + iOS scale feedback, a "gradient" variant for the
// ONE brand-moment CTA per screen, and a leading icon slot. All original
// props (title/onPress/variant/pending/pendingTitle/disabled/style) keep
// working unchanged.
import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, spacing } from "@/theme/tokens";

type Variant = "primary" | "ghost" | "danger" | "gradient";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  title,
  onPress,
  variant = "primary",
  pending = false,
  pendingTitle,
  disabled = false,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  pending?: boolean;
  /** Label swapped in while pending (web "saving…" parity). */
  pendingTitle?: string;
  disabled?: boolean;
  style?: ViewStyle;
  /** Optional leading glyph (lucide icon sized 18–22). */
  icon?: React.ReactNode;
}) {
  const { tokens } = useTheme();
  const blocked = disabled || pending;
  const scale = useRef(new Animated.Value(1)).current;

  const bg =
    variant === "primary"
      ? tokens.accent
      : variant === "danger"
        ? tokens.danger
        : "transparent";
  const fg = variant === "ghost" ? tokens.accent : "#ffffff";
  const ripple =
    variant === "ghost" ? tokens.chipBg : "rgba(255,255,255,0.25)";

  const animateTo = (v: number) => {
    Animated.spring(scale, {
      toValue: v,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: blocked, busy: pending }}
      onPress={blocked ? undefined : onPress}
      onPressIn={blocked ? undefined : () => animateTo(0.97)}
      onPressOut={() => animateTo(1)}
      android_ripple={blocked ? undefined : { color: ripple, foreground: true }}
      style={[
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
          opacity: blocked ? 0.55 : 1,
          minHeight: 48,
          overflow: "hidden",
          transform: [{ scale }],
        },
        style,
      ]}
    >
      {variant === "gradient" ? (
        <LinearGradient
          colors={[...gradients.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
      {pending ? <ActivityIndicator size="small" color={fg} /> : icon}
      <AppText variant="label" color={fg}>
        {pending && pendingTitle ? pendingTitle : title}
      </AppText>
    </AnimatedPressable>
  );
}
