// THE SHARED ARENA DIALOG SHELL.
//
// Three arena dialogs were written three times over — the daily-exam rules
// gate, the runner's submit/cancel/leave confirm, and "Report a problem" — and
// all three carried the same two defects:
//
//   1. NOT ONE OF THEM MEASURED A SAFE-AREA INSET. A transparent RN <Modal> is
//      its own native window and, under the edge-to-edge windows Android now
//      enforces, that window spans the whole screen INCLUDING the strip behind
//      the gesture pill / three-button bar. This is the same mechanism the
//      Ranking subject picker was fixed for (__tests__/select-sheet-insets),
//      and the rule that fix established is the one applied here: measure
//      `insets`, pad the CONTAINER with them, and let the content end above the
//      system bars instead of behind them.
//
//   2. THE CLAMP WAS A PERCENTAGE OF THE WHOLE WINDOW. `maxHeight: "85%"`
//      centred inside a full-window backdrop leaves 7.5% of the window under
//      the card — 48pt on a 640pt-tall phone, which is exactly a three-button
//      navigation bar. And ConfirmModal had no clamp at all, so a long az/ru
//      message on a short screen simply grew the card until its buttons were
//      off the bottom of the window, with no scroll to reach them.
//
// The shell replaces both with plain flex: the backdrop reserves the insets,
// the card `flexShrink: 1`s into whatever is left, the BODY scrolls, and the
// ACTIONS sit in the shared ActionArea, which cannot shrink. So the primary
// action is on screen at every height, in every locale, at every font scale —
// mobile-app/CLAUDE.md: "size with flex ... a fixed pixel box that fits a Pro
// Max WILL overflow an SE."
//
// ONE MORE RULE, and it is the one the owner's report turns on: anything the
// primary action DEPENDS ON belongs in `actions`, not in the scrolling body. In
// the rules gate the Start button is disabled until the consent tick is set;
// with the tick inside the scroll and the button outside it, a short screen
// showed a visible, permanently inert button and hid the only control that
// would enable it. "Those buttons ... they can't touch it somehow."
import React from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ActionArea } from "@/components/ActionArea";
import { dialogEdgePadding } from "@/components/actionAreaLayout";
import { KeyboardFocusBoundary } from "@/lib/useKeyboardAware";
import { radius, shadow, spacing, type ArenaTokens } from "@/theme/tokens";
import { tint } from "./ui";

/** Stable no-op so a pending dialog's close handler never changes identity. */
function noop() {}

export function ArenaDialog({
  arena,
  visible,
  title,
  children,
  actions,
  onDismiss,
  dismissLabel,
  keyboardAvoiding = false,
}: {
  arena: ArenaTokens;
  visible: boolean;
  /** Dialog heading. Never scrolls away — it is what the actions refer to. */
  title: string;
  /** The dialog's readable body. Scrolls when it does not fit. */
  children: React.ReactNode;
  /** Buttons, plus any control the buttons depend on. Never scrolls. */
  actions: React.ReactNode;
  /**
   * Backdrop tap + Android hardware back. `undefined` makes the dialog strictly
   * modal, which is what an in-flight request needs: it must never be
   * abandoned halfway with the user unsure what happened.
   */
  onDismiss?: () => void;
  /** Accessibility label for the backdrop (it is a Pressable). */
  dismissLabel: string;
  /**
   * Wrap in a KeyboardAvoidingView + KeyboardFocusBoundary — for a dialog that
   * hosts a text input. A Modal is its own native WINDOW (so KAV is the right
   * tool here, unlike on a screen body) but NOT its own REACT tree, so without
   * the boundary an input inside would report focus to the scroll container of
   * the screen behind it.
   */
  keyboardAvoiding?: boolean;
}) {
  // The provider lives outside this Modal, so these are the SCREEN's insets —
  // which is exactly right: the Modal's window is the whole screen.
  const insets = useSafeAreaInsets();

  const content = (
    <Pressable
      accessibilityLabel={dismissLabel}
      onPress={onDismiss}
      style={{
        flex: 1,
        backgroundColor: tint("#000000", 0.55),
        justifyContent: "center",
        // The insets are ADDED to the visual margin rather than maxed with it:
        // a dialog whose edge merely reaches the top of the gesture bar still
        // reads as falling off the screen.
        paddingTop: dialogEdgePadding(spacing.xl, insets.top),
        paddingBottom: dialogEdgePadding(spacing.xl, insets.bottom),
        paddingLeft: dialogEdgePadding(spacing.xl, insets.left),
        paddingRight: dialogEdgePadding(spacing.xl, insets.right),
      }}
    >
      {/* Inner pressable swallows taps so the card never closes itself. */}
      <Pressable
        onPress={noop}
        style={[
          {
            backgroundColor: arena.panel,
            borderColor: arena.line,
            borderWidth: 1,
            borderRadius: radius.xl,
            padding: spacing.xl,
            gap: spacing.md,
            // The whole clamp. No percentage, no measured height: the card
            // takes what it needs and shrinks into the padded backdrop when it
            // needs more, which is when the body below starts to scroll.
            flexShrink: 1,
          },
          shadow("float"),
        ]}
      >
        <AppText variant="title" color={arena.ink}>
          {title}
        </AppText>
        {/* flexGrow 0 keeps the card content-sized on a tall screen (identical
            to the layout before this shell existed); flexShrink 1 is what lets
            it give way — and therefore scroll — on a short one. */}
        <ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {/* edge={false}: the backdrop already cleared the system bars, so the
            bar must not add them a second time. */}
        <ActionArea edge={false}>{actions}</ActionArea>
      </Pressable>
    </Pressable>
  );

  const body = keyboardAvoiding ? (
    <KeyboardFocusBoundary>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {content}
      </KeyboardAvoidingView>
    </KeyboardFocusBoundary>
  ) : (
    content
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss ?? noop}
    >
      {body}
    </Modal>
  );
}

/** A dialog whose body is a single paragraph still goes through the shell, so
 *  a long az/ru string scrolls instead of pushing the buttons off-screen. */
export function DialogText({ arena, children }: { arena: ArenaTokens; children: React.ReactNode }) {
  return (
    <AppText color={arena.muted} style={{ fontSize: 15, lineHeight: 21 }}>
      {children}
    </AppText>
  );
}
