// TEST ENGINE (M3) — arena-styled confirm dialog (web shared <Modal/> parity)
// used by the runner's submit / cancel / leave-guard flows. Pure presentation;
// the caller owns all state and wording.
//
// Built on the shared ArenaDialog shell since the small-screen reachability
// pass: this file used to draw its own backdrop with no safe-area inset and no
// height clamp at all, so a long az/ru message on a short phone grew the card
// until Ləğv et / Təsdiqlə were off the bottom of the window — with no scroll
// anywhere to reach them. The message now scrolls and the buttons cannot move.
import React from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { spacing, type ArenaTokens } from "@/theme/tokens";
import { ArenaDialog, DialogText } from "./ArenaDialog";
import { ArenaButton } from "./ui";

export function ConfirmModal({
  arena,
  visible,
  title,
  message,
  /**
   * Failure of the primary action, shown inside the dialog so the retry sits
   * where the user is looking (a message rendered behind the dialog, or far up
   * a long scroll, reads as "nothing happened" and invites a second tap).
   *
   * It rides with the ACTIONS, not with the message: it is what explains the
   * button the user is about to press again, so it must never be the thing
   * that scrolled out of sight.
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
    <ArenaDialog
      arena={arena}
      visible={visible}
      title={title}
      dismissLabel={secondaryLabel}
      // While the primary action is in flight the dialog is modal in the strict
      // sense: the backdrop and Android's hardware back are both inert, so a
      // request that is still deciding the attempt's fate cannot be abandoned.
      onDismiss={primaryPending ? undefined : dismiss}
      actions={
        <View style={{ gap: spacing.md }}>
          {errorText ? (
            <AppText
              accessibilityLiveRegion="polite"
              color={arena.red}
              style={{ fontSize: 14, lineHeight: 20 }}
            >
              {errorText}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.md }}>
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
        </View>
      }
    >
      <DialogText arena={arena}>{message}</DialogText>
    </ArenaDialog>
  );
}
