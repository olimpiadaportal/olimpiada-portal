// Shared parent-surface UI primitives: scrollable screen body (headers come
// from the navigator, so no top inset by default), tinted pills, summary rows
// (with an optional lucide icon chip), the child selector chips (Avatar-led),
// the gradient-border card (active/popular highlight pattern) and the
// bottom-sheet shell every commerce sheet reuses (plain RN Modal —
// AccountSheet pattern, grab handle included).
import React from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ChildAvatar } from "@/components/ChildAvatar";
import { scrollPaddingBottom } from "@/components/keyboardLayout";
import { KeyboardFocusProvider, useKeyboardAwareScroll } from "@/lib/useKeyboardAware";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, shadow, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import type { ChildRow } from "@/lib/data";

/** Soft tint from a 6-digit hex token (#rrggbb + alpha byte). */
function tint(hex: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex;
}

/**
 * Scroll body for screens that live under a navigator header.
 *
 * Keyboard-aware like the other two scroll bodies (`Screen scroll`,
 * `ArenaScroll`) — see `@/lib/useKeyboardAware`. The old `keyboard` prop is
 * gone: it wrapped the list in a `KeyboardAvoidingView` whose `behavior` was
 * `undefined` on Android (a documented no-op) and which under-shifted by the
 * navigator header height on iOS. The container now measures its own overlap
 * with the keyboard in window coordinates instead, so no screen has to opt in
 * and no per-screen offset constant exists to get wrong.
 */
export function ScreenScroll({
  children,
  refreshing = false,
  onRefresh,
  topInset = false,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Add the safe-area top padding (screens without a navigator header). */
  topInset?: boolean;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { keyboardInset, scrollProps, focusApi } = useKeyboardAwareScroll();
  return (
    <KeyboardFocusProvider value={focusApi}>
      <ScrollView
        {...scrollProps}
        style={{ flex: 1, backgroundColor: tokens.bg }}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: topInset ? insets.top + spacing.sm : spacing.lg,
          // Grow the CONTENT by the live keyboard overlap so the last field's
          // action button can still be scrolled above the keyboard. Back to
          // exactly `insets.bottom + spacing.xxl` the moment it closes.
          paddingBottom: scrollPaddingBottom(insets.bottom + spacing.xxl, keyboardInset),
          gap: spacing.lg,
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tokens.accent}
              colors={[tokens.accent]}
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
    </KeyboardFocusProvider>
  );
}

/** Status pill (web .pill contract): tone recolours text AND soft background. */
export function Pill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "ok" | "bad" | "muted" | "accent";
}) {
  const { tokens } = useTheme();
  const color =
    tone === "ok"
      ? tokens.ok
      : tone === "bad"
        ? tokens.danger
        : tone === "accent"
          ? tokens.pillText
          : tokens.muted;
  const bg =
    tone === "ok"
      ? tint(tokens.ok, "1F")
      : tone === "bad"
        ? tint(tokens.danger, "1F")
        : tokens.pillBg;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        // 320pt safety: in identity rows the pill compresses (ellipsis) instead
        // of pushing the flex:1 name cell to zero or off-screen.
        flexShrink: 1,
        maxWidth: "100%",
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <AppText variant="label" color={color} numberOfLines={1} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

/** Label/value line used in quote summaries, billing rows and detail sheets.
 *  Optional leading lucide icon (detail sheets). */
export function KeyRow({
  label,
  value,
  strong = false,
  icon,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** Leading glyph (lucide, size 16–18, muted). */
  icon?: React.ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: spacing.xs,
        minHeight: icon ? 32 : undefined,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 }}>
        {icon ?? null}
        <AppText variant={strong ? "label" : "muted"} style={{ flexShrink: 1 }}>
          {label}
        </AppText>
      </View>
      <AppText
        variant={strong ? "title" : "body"}
        color={strong ? tokens.text : undefined}
        style={[{ flexShrink: 1, textAlign: "right" }, strong ? { fontSize: 18 } : null]}
      >
        {value}
      </AppText>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <AppText variant="title" style={{ marginTop: spacing.sm }}>
      {children}
    </AppText>
  );
}

export function childDisplayName(c: ChildRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "—";
}

/** Brand-gradient BORDER wrap (active plan / popular card highlight): a 2px
 *  LinearGradient frame around a flat Card (MA gradient-border pattern). */
export function GradientBorderCard({
  children,
  style,
  innerStyle,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
}) {
  const { tokens } = useTheme();
  return (
    <LinearGradient
      colors={[...gradients.brand]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius.lg, padding: 2 }, shadow("card", tokens.shadow), style]}
    >
      <Card
        variant="flat"
        style={[{ borderWidth: 0, borderRadius: radius.lg - 2 }, innerStyle]}
      >
        {children}
      </Card>
    </LinearGradient>
  );
}

/** Horizontal child selector chips (subscription/olympiads tabs) — Avatar-led. */
export function ChildChips({
  childrenList,
  selectedId,
  onSelect,
  accessibilityLabel,
}: {
  childrenList: ChildRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  accessibilityLabel: string;
}) {
  const { tokens } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
    >
      {childrenList.map((c) => {
        const active = c.profile_id === selectedId;
        const name = childDisplayName(c);
        return (
          <Pressable
            key={c.profile_id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={name}
            onPress={() => onSelect(c.profile_id)}
            // Foreground ripple: a background one replaces this view's drawable
            // and leaves it painting the PREVIOUS theme's colour after a
            // light/dark switch. Full explanation in AnalyticsDashboard.tsx.
            android_ripple={{
              // This file's LOCAL tint() takes an alpha HEX BYTE, not a 0-1
              // number like the one in @/theme/tokens. "24" is ~0.14.
              color: active ? "rgba(255,255,255,0.25)" : tint(tokens.accent, "24"),
              foreground: true,
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              backgroundColor: active ? tokens.accent : tokens.chipBg,
              borderRadius: 999,
              paddingVertical: spacing.xs + 2,
              paddingLeft: spacing.xs + 2,
              paddingRight: spacing.lg,
              minHeight: 44,
              opacity: pressed ? 0.85 : 1,
              overflow: "hidden",
            })}
          >
            <ChildAvatar row={c} name={name} seed={c.profile_id} size={32} />
            <AppText variant="label" color={active ? "#ffffff" : tokens.chipText}>
              {name}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Bottom-sheet modal shell (AccountSheet pattern: dim scrim + rounded sheet
 *  with a grab handle). */
export function SheetShell({
  visible,
  onClose,
  closeLabel,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
      />
      <View
        style={[
          {
            backgroundColor: tokens.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.lg,
            maxHeight: "88%",
          },
          shadow("float", tokens.shadow),
        ]}
      >
        <View
          style={{
            alignSelf: "center",
            width: 44,
            height: 4,
            borderRadius: 2,
            backgroundColor: tokens.border,
          }}
        />
        {children}
      </View>
    </Modal>
  );
}
