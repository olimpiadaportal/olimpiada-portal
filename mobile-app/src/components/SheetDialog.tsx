// THE BOTTOM-SHEET DIALOG, on the shared reachability contract.
//
// This is the parent-side twin of features/tests/ArenaDialog: same three rules,
// different palette (theme tokens instead of the student's arena tokens).
//
//   1. MEASURE THE SAFE AREA. A transparent RN <Modal> is its own native window
//      and, under the edge-to-edge windows Android now enforces, that window
//      spans the whole screen INCLUDING the strip behind the gesture pill /
//      three-button bar. A sheet with a flat bottom padding therefore draws its
//      buttons UNDER the navigation bar — which is exactly what the
//      account-deletion sheet did: 24pt of padding and no inset anywhere in the
//      file, so on a three-button Android phone the lower ~48pt of "Sil" and
//      "Ləğv et" were behind the system bar.
//
//   2. CLAMP BY FLEX, NEVER BY A PERCENTAGE OR A HEIGHT. The card takes the
//      height it needs and `flexShrink: 1`s into what the window leaves; the
//      top margin is what keeps it off the status bar. A `maxHeight: "88%"`
//      measures the whole window, system bars included, and is the same
//      mistake in a different disguise.
//
//   3. THE BODY SCROLLS, THE ACTIONS DO NOT. The deletion sheet's confirmation
//      paragraph is ~180 characters in az and longer in ru; at the 1.3x font
//      scale AppText allows, plus an error line, it outgrew a short window and
//      there was no scroll anywhere — the buttons simply left the screen. Now
//      the paragraph gives way and the buttons cannot move, which is the whole
//      contract in one sentence (components/actionAreaLayout.ts).
import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ActionArea } from "@/components/ActionArea";
import { dialogEdgePadding } from "@/components/actionAreaLayout";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, shadow, spacing } from "@/theme/tokens";

/** Stable no-op so a strictly-modal sheet's close handler keeps its identity. */
function noop() {}

export function SheetDialog({
  visible,
  title,
  titleColor,
  children,
  actions,
  onDismiss,
  dismissLabel,
}: {
  visible: boolean;
  /** Sheet heading. Never scrolls away — it is what the actions refer to. */
  title: string;
  /** Danger sheets tint the heading; omit for the default ink. */
  titleColor?: string;
  /** The readable body. Scrolls when it does not fit. */
  children: React.ReactNode;
  /** Buttons, plus anything they depend on (an error line, a tick). Never scrolls. */
  actions: React.ReactNode;
  /**
   * Backdrop tap + Android hardware back. `undefined` makes the sheet strictly
   * modal — what an in-flight destructive request needs, so it can never be
   * abandoned halfway with the user unsure whether it happened.
   */
  onDismiss?: () => void;
  /** Accessibility label for the backdrop (it is a Pressable). */
  dismissLabel: string;
}) {
  const { tokens } = useTheme();
  // The provider is outside this Modal, so these are the SCREEN's insets —
  // which is right: the Modal's window IS the screen.
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss ?? noop}>
      {/* Backdrop above the card: `flex: 1` with a 0 basis, so it yields all of
          its height to the card before the card gives up any of its own. */}
      <Pressable
        accessibilityLabel={dismissLabel}
        onPress={onDismiss}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
      />
      <View
        style={[
          {
            backgroundColor: tokens.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: spacing.xl,
            // The sheet touches the bottom and side window edges, so the sheet
            // owns those insets (the ActionArea inside is edge={false} and must
            // not add them a second time).
            paddingBottom: dialogEdgePadding(spacing.xl, insets.bottom),
            paddingLeft: dialogEdgePadding(spacing.xl, insets.left),
            paddingRight: dialogEdgePadding(spacing.xl, insets.right),
            // The whole clamp: a margin the card cannot grow into, and a shrink
            // that takes effect the moment it tries. No percentage, no height.
            marginTop: dialogEdgePadding(spacing.xl, insets.top),
            flexShrink: 1,
            gap: spacing.lg,
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
        <AppText variant="title" color={titleColor}>
          {title}
        </AppText>
        {/* flexGrow 0 keeps the sheet content-sized on a tall screen (pixel for
            pixel what it was before); flexShrink 1 is what lets it give way —
            and therefore scroll — on a short one. */}
        <ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {/* edge={false}: the sheet's own padding already cleared the system
            bars; adding them again would park the buttons a navigation bar's
            height up inside the card. */}
        <ActionArea edge={false}>{actions}</ActionArea>
      </View>
    </Modal>
  );
}
