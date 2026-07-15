// TEST ENGINE (M3, restyled M3.2) — arena-styled building blocks for the test
// screens. All colors come from arenaTokens (web .arena parity: dark palette +
// light remap); nothing here hardcodes a literal outside the token maps.
// Redesign pass: shadow() surfaces, lucide glyphs, gradient CTA kind — the
// exports and their props stay source-compatible with the M3 screens.
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, Info, TriangleAlert } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeProvider";
import {
  arenaTokens,
  gradients,
  radius,
  shadow,
  spacing,
  type ArenaTokens,
  type ThemeName,
} from "@/theme/tokens";

/** Arena tokens for the student test surfaces (default palette, like the shell). */
export function useArena(): { arena: ArenaTokens; theme: ThemeName } {
  const { theme } = useTheme();
  return { arena: arenaTokens(theme, "default"), theme };
}

/** rgba() tint from a #rrggbb token (palette-safe translucent fills). */
export function tint(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Panel({
  arena,
  style,
  children,
}: {
  arena: ArenaTokens;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: arena.panel,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: arena.line,
          padding: spacing.lg,
        },
        shadow("card"),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Web .arena-eyebrow: small uppercase kicker above a title. */
export function Eyebrow({ arena, children }: { arena: ArenaTokens; children: string }) {
  return (
    <AppText
      variant="eyebrow"
      color={arena.lime}
      style={{ textTransform: "uppercase", letterSpacing: 1.2 }}
    >
      {children}
    </AppText>
  );
}

/** Web .tst-notice / .tst-notice.warn — inline info/warn strip. */
export function Notice({
  arena,
  warn = false,
  children,
}: {
  arena: ArenaTokens;
  warn?: boolean;
  children: string;
}) {
  const color = warn ? arena.gold : arena.blue;
  const Glyph = warn ? TriangleAlert : Info;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: tint(color, 0.12),
        borderColor: tint(color, 0.45),
        borderWidth: 1,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Glyph size={18} color={color} strokeWidth={2} />
      <AppText color={arena.ink} style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
        {children}
      </AppText>
    </View>
  );
}

export type PillTone = "ok" | "bad" | "off" | "run";

/** Web .tst-pill — status chip on history rows / review cards / subject cards. */
export function StatusPill({
  arena,
  tone,
  label,
  icon,
}: {
  arena: ArenaTokens;
  tone: PillTone;
  label: string;
  /** Optional leading lucide glyph (sized ~12–14 by the caller). */
  icon?: React.ReactNode;
}) {
  const color =
    tone === "ok" ? arena.lime : tone === "bad" ? arena.red : tone === "run" ? arena.blue : arena.dim;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        backgroundColor: tint(color, 0.14),
        borderColor: tint(color, 0.5),
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: spacing.md,
        alignSelf: "flex-start",
      }}
    >
      {icon ?? null}
      <AppText variant="label" color={color} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

/** Arena-toned button (web .arena-btn / -ghost / danger / gradient CTA). */
export function ArenaButton({
  arena,
  title,
  onPress,
  kind = "primary",
  disabled = false,
  pending = false,
  pendingTitle,
  pressThroughDisabled = false,
  icon,
  style,
}: {
  arena: ArenaTokens;
  title: string;
  onPress: () => void;
  kind?: "primary" | "ghost" | "danger" | "gradient";
  disabled?: boolean;
  pending?: boolean;
  pendingTitle?: string;
  /**
   * Keep onPress firing while visually disabled (setup Start: a tap on the
   * disabled button surfaces the "select topic + subtopic" warning — web
   * wrapper-click parity). Pending always blocks.
   */
  pressThroughDisabled?: boolean;
  /** Optional leading lucide glyph (sized 16–18 by the caller). */
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    kind === "primary" ? arena.blue : kind === "danger" ? tint(arena.red, 0.14) : "transparent";
  const border =
    kind === "primary"
      ? arena.blue
      : kind === "danger"
        ? tint(arena.red, 0.5)
        : kind === "gradient"
          ? "transparent"
          : arena.line;
  const fg =
    kind === "primary" || kind === "gradient" ? "#ffffff" : kind === "danger" ? arena.red : arena.ink;
  const blocked = disabled || pending;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: blocked, busy: pending }}
      onPress={pending || (disabled && !pressThroughDisabled) ? undefined : onPress}
      android_ripple={
        blocked
          ? undefined
          : {
              color: kind === "ghost" ? tint(arena.blue, 0.14) : "rgba(255,255,255,0.25)",
              foreground: true,
            }
      }
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderWidth: kind === "gradient" ? 0 : 1,
          borderColor: border,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xl,
          flexDirection: "row",
          gap: spacing.sm,
          alignItems: "center",
          justifyContent: "center",
          minHeight: 48,
          overflow: "hidden",
          opacity: blocked ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {kind === "gradient" ? (
        <LinearGradient
          colors={[...gradients.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
      {pending ? null : icon}
      <AppText variant="label" color={fg}>
        {pending && pendingTitle ? pendingTitle : title}
      </AppText>
    </Pressable>
  );
}

/** Back chevron row for stack screens that hide the native header. */
export function BackBar({
  arena,
  label,
  onPress,
}: {
  arena: ArenaTokens;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        alignSelf: "flex-start",
        opacity: pressed ? 0.7 : 1,
        paddingVertical: spacing.sm,
        minHeight: 44,
      })}
    >
      <ChevronLeft size={20} color={arena.lime} strokeWidth={2.5} />
      <AppText variant="label" color={arena.muted}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Progress bar (web .arena-bar) for the per-topic result breakdown — animated fill. */
export function TopicBar({
  arena,
  pct,
}: {
  arena: ArenaTokens;
  pct: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  // Width animation is presentation-only (JS driver — width is not
  // transformable natively); it re-runs only when the value itself changes.
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: clamped,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [clamped, fill]);
  return (
    <View
      style={{
        height: 8,
        borderRadius: 999,
        backgroundColor: arena.panel2,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{
          width: fill.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
          height: "100%",
          borderRadius: 999,
          backgroundColor: arena.blue,
        }}
      />
    </View>
  );
}
