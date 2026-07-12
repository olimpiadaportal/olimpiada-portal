// Arena UI primitives — native ports of the web `.arena-*` contract classes
// (globals.css): panel, eyebrow, section heading with trailing hairline, the
// lime/ghost mono buttons and the pull-to-refresh scroll body. All colors come
// from the palette-aware useArena() hook so every piece follows the child's
// chosen palette and the dark arena automatically.
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
import { radius, spacing } from "@/theme/tokens";
import { useArena } from "./useArena";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

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

/** Web .arena-panel: panel surface, hairline border, 14px radius. */
export function ArenaPanel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { arena } = useArena();
  return (
    <View
      style={[
        {
          backgroundColor: arena.panel,
          borderWidth: 1,
          borderColor: arena.line,
          borderRadius: radius.md,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Web .arena-eyebrow: tiny mono uppercase dim label. */
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

/** Web .arena-section-h: mono uppercase heading with a trailing hairline. */
export function ArenaSectionH({ title }: { title: string }) {
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
    </View>
  );
}

/** Web .arena-btn / .arena-btn-ghost (+ -sm): mono uppercase action button. */
export function ArenaButton({
  title,
  onPress,
  variant = "primary",
  small = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  small?: boolean;
  style?: ViewStyle;
}) {
  const { arena } = useArena();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: primary ? arena.lime : "transparent",
          borderWidth: primary ? 0 : 1,
          borderColor: arena.line,
          borderRadius: 8,
          paddingVertical: small ? spacing.sm : spacing.md,
          paddingHorizontal: small ? spacing.md : spacing.lg,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
          minHeight: small ? 36 : 46,
        },
        style,
      ]}
    >
      <AppText
        // Web .arena-btn text is the fixed dark ink on lime; ghost uses ink.
        color={primary ? "#0a0e1a" : arena.ink}
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
