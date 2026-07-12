// Shared parent-surface UI primitives: scrollable screen body (headers come
// from the navigator, so no top inset here), pills, summary rows, the child
// selector chips and the bottom-sheet shell every commerce sheet reuses
// (plain RN Modal — AccountSheet pattern).
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import type { ChildRow } from "@/lib/data";

/** Scroll body for screens that live under a navigator header. */
export function ScreenScroll({
  children,
  refreshing = false,
  onRefresh,
  keyboard = false,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Wrap in KeyboardAvoidingView (form screens). */
  keyboard?: boolean;
}) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        gap: spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
  if (!keyboard) return scroll;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {scroll}
    </KeyboardAvoidingView>
  );
}

/** Status pill (web .pill contract; tone recolours for access states). */
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
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: tokens.pillBg,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <AppText variant="label" color={color} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

/** Label/value line used in quote summaries, billing rows and detail sheets. */
export function KeyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
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
      }}
    >
      <AppText variant={strong ? "label" : "muted"} style={{ flexShrink: 1 }}>
        {label}
      </AppText>
      <AppText
        variant={strong ? "title" : "body"}
        color={strong ? tokens.text : undefined}
        style={strong ? { fontSize: 18 } : undefined}
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

/** Horizontal child selector chips (subscription/olympiads tabs). */
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
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              backgroundColor: active ? tokens.accent : tokens.chipBg,
              borderRadius: 999,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active ? "rgba(255,255,255,0.25)" : tokens.pillBg,
              }}
            >
              <AppText
                variant="label"
                color={active ? "#ffffff" : tokens.pillText}
                style={{ fontSize: 12 }}
              >
                {(name[0] ?? "•").toUpperCase()}
              </AppText>
            </View>
            <AppText variant="label" color={active ? "#ffffff" : tokens.chipText}>
              {name}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Bottom-sheet modal shell (AccountSheet pattern: dim scrim + rounded sheet). */
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
        style={{
          backgroundColor: tokens.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.lg,
          maxHeight: "88%",
        }}
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
