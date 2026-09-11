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
import { ActionAreaShell } from "@/components/ActionArea";
import { scrollBodyBottomInset } from "@/components/actionAreaLayout";
import { scrollPaddingBottom } from "@/components/keyboardLayout";
import { KeyboardFocusProvider, useKeyboardAwareScroll } from "@/lib/useKeyboardAware";
import { radius, shadow, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useContentGutter } from "@/lib/useContentWidth";
import { useArena } from "./useArena";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/**
 * Fixed dark ink used on the lime accent. Tracks ARENA_DARK.bg, which the
 * 2026-09-10 neutral-charcoal pass moved off the web's blue-black; the ink is
 * luminance-matched, so its contrast on lime is unchanged (16.18:1).
 */
export const ARENA_BTN_INK = "#100e0e";

/** Arena shadow color: soft neutral in light palettes, deep in the dark arena. */
function arenaShadowColor(theme: "light" | "dark"): string {
  return theme === "dark" ? "rgba(0, 0, 0, 0.5)" : "rgba(22, 32, 58, 0.14)";
}

/**
 * Scroll body under the tabs header (web .arena-main), arena background.
 *
 * Keyboard-aware exactly like `Screen scroll` / `ScreenScroll`
 * (`@/lib/useKeyboardAware`): this body hosts the student profile's name and
 * password forms, which previously had NO avoidance at all and whose Save
 * button needed two taps while the keyboard was up (no
 * `keyboardShouldPersistTaps` — the first tap was swallowed dismissing it).
 * Both come from the shared contract now.
 */
export function ArenaScroll({
  children,
  refreshing = false,
  onRefresh,
  topInset = false,
  actions,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Add the safe-area top padding (screens that hide the navigator header —
   *  the test chain draws its own back bar instead). */
  topInset?: boolean;
  /**
   * The screen's primary action(s), laid out in the shared ActionArea BELOW
   * this body rather than as the last thing in the scroll. The test setup
   * page's Start button was ~900pt down a page that is three screenfuls tall on
   * a small phone; here it is always on screen and always above the gesture
   * bar. See components/actionAreaLayout.ts.
   */
  actions?: React.ReactNode;
}) {
  const { arena } = useArena();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { keyboardInset, scrollProps, focusApi } = useKeyboardAwareScroll();
  const gutter = useContentGutter();
  const hasActions = Boolean(actions);
  const body = (
    <ScrollView
      {...scrollProps}
      style={{ flex: 1, backgroundColor: arena.bg }}
      contentContainerStyle={{
        padding: spacing.lg,
        // 0 on every phone. On a tablet this centres the content column
        // instead of letting a layout drawn for a 390pt phone stretch across
        // 1024pt. It overrides the `padding` above for left/right because
        // React Native resolves the MORE SPECIFIC property last regardless of
        // key order — this does not depend on the two lines staying in this
        // sequence, so reordering them is safe and reordering them is also
        // not what makes it work.
        paddingHorizontal: spacing.lg + gutter + Math.max(insets.left, insets.right),
        paddingTop: topInset ? insets.top + spacing.md : spacing.lg,
        // Live keyboard overlap on top of the resting padding; exactly
        // `insets.bottom + spacing.xxl` again once the keyboard closes. With
        // an action area below, the bottom inset belongs to the BAR.
        paddingBottom: scrollPaddingBottom(
          scrollBodyBottomInset(insets.bottom, hasActions) + spacing.xxl,
          keyboardInset,
        ),
        gap: spacing.lg,
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={arena.lime}
            colors={[arena.lime]}
            // Android draws the spinner from the scroll view's own top edge;
            // on a headerless screen that puts it under the status bar.
            progressViewOffset={topInset ? insets.top : 0}
            accessibilityLabel={t("mob.refreshing")}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );

  return (
    <KeyboardFocusProvider value={focusApi}>
      {hasActions ? (
        <ActionAreaShell background={arena.bg} borderColor={arena.line} actions={actions}>
          {body}
        </ActionAreaShell>
      ) : (
        body
      )}
    </KeyboardFocusProvider>
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

/** Web .arena-eyebrow: tiny mono uppercase section label (arena take on
 *  "eyebrow"). 11pt uppercase is READ, so it defaults to `muted`, not `dim`
 *  (see ARENA_DARK in theme/tokens.ts). */
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
      color={color ?? arena.muted}
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
        numberOfLines={1}
        style={{
          // Long az/ru headings compress (hairline gives way first) so the
          // trailing action never leaves the screen on narrow phones.
          flexShrink: 1,
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
        color: primary ? "rgba(16, 14, 14, 0.18)" : arena.panel2,
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
          // Width-constrained buttons (flex:1 rows) wrap long az/ru labels
          // inside the box instead of overflowing it.
          flexShrink: 1,
          textAlign: "center",
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
