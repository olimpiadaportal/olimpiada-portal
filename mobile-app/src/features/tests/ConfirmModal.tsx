// TEST ENGINE (M3) — arena-styled confirm dialog (web shared <Modal/> parity)
// used by the runner's submit / cancel / leave-guard flows. Pure presentation;
// the caller owns all state and wording.
import React from "react";
import { Modal, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { radius, shadow, spacing, type ArenaTokens } from "@/theme/tokens";
import { ArenaButton, tint } from "./ui";

/** Stable no-op so a pending dialog's close handler never changes identity. */
function noop() {}

export function ConfirmModal({
  arena,
  visible,
  title,
  message,
  /**
   * Failure of the primary action, shown inside the dialog so the retry sits
   * where the user is looking (a message rendered behind the dialog, or far up
   * a long scroll, reads as "nothing happened" and invites a second tap).
   */
  errorText = null,
  /** Right-hand emphasized action. */
  primaryLabel,
  onPrimary,
  primaryKind = "primary",
  primaryPending = false,
  primaryPendingLabel,
  /** Left-hand quiet action. */
  secondaryLabel,
  onSecondary,
  /**
   * The SAFE close path (backdrop tap / Android back on the dialog). Defaults
   * to onSecondary; the leave-guard dialog passes "stay" here so dismissing
   * the dialog can never leave the attempt.
   */
  onDismiss,
}: {
  arena: ArenaTokens;
  visible: boolean;
  title: string;
  message: string;
  errorText?: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  primaryKind?: "primary" | "danger" | "ghost";
  primaryPending?: boolean;
  primaryPendingLabel?: string;
  secondaryLabel: string;
  onSecondary: () => void;
  onDismiss?: () => void;
}) {
  const dismiss = onDismiss ?? onSecondary;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // While the primary action is in flight the dialog is modal in the strict
      // sense: Android's hardware back cannot close it out from under a request
      // that is still deciding the attempt's fate.
      onRequestClose={primaryPending ? noop : dismiss}
    >
      <Pressable
        accessibilityLabel={secondaryLabel}
        onPress={primaryPending ? undefined : dismiss}
        style={{
          flex: 1,
          backgroundColor: tint("#000000", 0.55),
          justifyContent: "center",
          padding: spacing.xl,
        }}
      >
        {/* Inner pressable swallows taps so the card never closes itself. */}
        <Pressable
          onPress={() => {}}
          style={[
            {
              backgroundColor: arena.panel,
              borderColor: arena.line,
              borderWidth: 1,
              borderRadius: radius.xl,
              padding: spacing.xl,
              gap: spacing.md,
            },
            shadow("float"),
          ]}
        >
          <AppText variant="title" color={arena.ink}>
            {title}
          </AppText>
          <AppText color={arena.muted} style={{ fontSize: 15, lineHeight: 21 }}>
            {message}
          </AppText>
          {errorText ? (
            <AppText
              accessibilityLiveRegion="polite"
              color={arena.red}
              style={{ fontSize: 14, lineHeight: 20 }}
            >
              {errorText}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
            <ArenaButton
              arena={arena}
              kind="ghost"
              title={secondaryLabel}
              onPress={onSecondary}
              disabled={primaryPending}
              style={{ flex: 1 }}
            />
            <ArenaButton
              arena={arena}
              kind={primaryKind}
              title={primaryLabel}
              onPress={onPrimary}
              pending={primaryPending}
              pendingTitle={primaryPendingLabel}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
