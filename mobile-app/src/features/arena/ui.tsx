// Arena UI primitives — native ports of the web `.arena-*` contract classes
// (globals.css): panel, eyebrow, section heading with trailing hairline, the
// lime/ghost mono buttons and the pull-to-refresh scroll body. All colors come
// from the palette-aware useArena() hook so every piece follows the child's
// chosen palette and the dark arena automatically. Redesign pass: panels cast
// the sanctioned shadow(), radii come from the web scale, buttons get ripple +
// pressed-scale, and the section heading grows an optional trailing action.
import React from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { radius, shadow, spacing } from "@/theme/tokens";
import { useArena } from "./useArena";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** Fixed dark ink used on the lime accent (web .arena-btn text color). */
export const ARENA_BTN_INK = "#0a0e1a";

/** Arena shadow color: soft neutral in light palettes, deep in the dark arena. */
function arenaShadowColor(theme: "light" | "dark"): string {
  return theme === "dark" ? "rgba(0, 0, 0, 0.5)" : "rgba(22, 32, 58, 0.14)";
}

/** Scroll body under the tabs header (web .arena-main), arena background. */
export function ArenaScroll({
  children,
  refreshing = false,
  onRefresh,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { arena } = useArena();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: arena.bg }}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        gap: spacing.lg,
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={arena.lime}
            colors={[arena.lime]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** Web .arena-panel: panel surface, hairline border, card radius + soft shadow. */
export function ArenaPanel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { arena, theme } = useArena();
  return (
    <View
      style={[
        {
          backgroundColor: arena.panel,
          borderWidth: 1,
          borderColor: arena.line,
          borderRadius: radius.lg,
          padding: spacing.lg,
          ...shadow("card", arenaShadowColor(theme)),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Web .arena-eyebrow: tiny mono uppercase dim label (arena take on "eyebrow"). */
export function ArenaEyebrow({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  const { arena } = useArena();
  return (
    <AppText
      variant="eyebrow"
      color={color ?? arena.dim}
      style={{
        fontFamily: MONO,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 2,
      }}
    >
      {children}
    </AppText>
  );
}

/** Web .arena-section-h: mono uppercase heading with a trailing hairline
 * (+ an optional trailing text action, e.g. "See all"). */
export function ArenaSectionH({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  const { arena } = useArena();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <AppText
        color={arena.muted}
        style={{
          fontFamily: MONO,
          fontSize: 12,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 1.5,
        }}
      >
        {title}
      </AppText>
      <View style={{ flex: 1, height: 1, backgroundColor: arena.line }} />
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={12}
        >
          <AppText color={arena.lime} variant="label" style={{ fontSize: 13 }}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Web .arena-btn / .arena-btn-ghost (+ -sm): mono uppercase action button.
 * Redesign: ripple on Android, pressed-scale 0.97, ≥44dp default target. */
export function ArenaButton({
  title,
  onPress,
  variant = "primary",
  small = false,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  small?: boolean;
  style?: ViewStyle;
  /** Optional leading glyph (lucide icon sized 16–18). */
  icon?: React.ReactNode;
}) {
  const { arena } = useArena();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      android_ripple={{
        color: primary ? "rgba(10, 14, 26, 0.18)" : arena.panel2,
        foreground: true,
      }}
      style={({ pressed }) => [
        {
          backgroundColor: primary ? arena.lime : "transparent",
          borderWidth: primary ? 0 : 1,
          borderColor: arena.line,
          borderRadius: radius.sm,
          paddingVertical: small ? spacing.sm : spacing.md,
          paddingHorizontal: small ? spacing.md : spacing.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
          minHeight: small ? 36 : 46,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {icon ?? null}
      <AppText
        // Web .arena-btn text is the fixed dark ink on lime; ghost uses ink.
        color={primary ? ARENA_BTN_INK : arena.ink}
        style={{
          fontFamily: MONO,
          fontSize: small ? 11 : 12,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {title}
      </AppText>
    </Pressable>
  );
}

/** Arena chip (web .arena-chip): full-round palette chip with an active state. */
export function ArenaChip({
  label,
  active = false,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  const { arena } = useArena();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: arena.panel2, foreground: true }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        backgroundColor: active ? arena.lime : arena.panel,
        borderWidth: 1,
        borderColor: active ? arena.lime : arena.line,
        borderRadius: 999,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        minHeight: 36,
        opacity: pressed ? 0.85 : 1,
        overflow: "hidden",
      })}
    >
      {icon ?? null}
      <AppText
        variant="label"
        color={active ? ARENA_BTN_INK : arena.muted}
        style={{ fontSize: 13 }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
