// THE SHARED ACTION AREA: a screen's (or a dialog's) primary action, laid out
// where a thumb can always reach it.
//
// Owner report, small phones: "the 'read the rules' button ... those buttons
// were on the bottom of the screen where they can't touch it somehow." The
// mechanisms are written up in actionAreaLayout.ts; this component is the one
// answer to all of them, and the four containers that host it (Screen,
// ScreenScroll, ArenaScroll, ArenaDialog) all reach it through the same props.
//
// WHY A SIBLING AND NOT AN OVERLAY. An absolutely-positioned bar floating over
// a scroll view has to be paired with a bottom padding on the CONTENT equal to
// its height, and that padding is a number somebody has to keep in sync with a
// bar whose height changes with the locale (az/ru labels wrap), the font scale
// and the number of buttons. Every such constant in this repo has eventually
// been wrong. A sibling below a `flex: 1` body reserves its space structurally:
// the body gets whatever is left, so nothing can be behind the bar because the
// bar is not over anything. mobile-app/CLAUDE.md: "size with flex ... a fixed
// pixel box that fits a Pro Max WILL overflow an SE."
//
// WHY IT DOES NOT CHANGE A LARGE PHONE. The bar is content-sized (`flexShrink:
// 0`, no height of its own) and the body above it is `flex: 1`, so on a screen
// where everything already fitted, the same pixels are in the same places. What
// changes is the SHORT screen, where the body now scrolls inside its own band
// instead of pushing the action off the bottom edge.
//
// AND THE BAR IS CAPPED AGAINST ITSELF. `flexShrink: 0` says the body cannot
// squeeze the bar; nothing in that says the bar cannot outgrow the WINDOW. At a
// raised OS font scale a bar carrying a wrapped consent line, a warning and an
// error above its button can, and then its own primary button is below the
// bottom edge. So the bar's CONTENT takes at most half the space the bar has
// (actionAreaMaxHeight) and scrolls inside that — a ceiling measured from the
// window, never a device constant, and never a height that decides how tall the
// bar IS. It is the content that is capped and not the padded box, or the same
// padding that lifts the bar over the keyboard would consume the allowance and
// leave the buttons no height at all.
import React from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useContentGutter } from "@/lib/useContentWidth";
import { useKeyboardViewInset } from "@/lib/useKeyboardAware";
import {
  ACTION_AREA_PADDING_BOTTOM,
  ACTION_AREA_PADDING_SIDE,
  ACTION_AREA_PADDING_TOP,
  actionAreaBottomPadding,
  actionAreaMaxHeight,
  actionAreaSidePadding,
} from "./actionAreaLayout";

export type ActionAreaProps = {
  children: React.ReactNode;
  /** Bar surface. Opaque on a screen (content scrolls UNDER nothing, but the
   *  hairline needs something to sit on); transparent inside a dialog card. */
  background?: string;
  /** Hairline between the scrolling body and the actions. Omit for none. */
  borderColor?: string;
  /**
   * Live keyboard overlap measured by the host container (`useKeyboardAware`),
   * 0 whenever the keyboard is closed. Lifts the bar above the keyboard on iOS,
   * where the window does not resize; on Android `adjustResize` it is already 0
   * because the window shrank and the bar rode up with it.
   */
  keyboardInset?: number;
  /**
   * True when the bar touches the WINDOW edge (a screen): it then owns the
   * safe-area insets and the shared tablet gutter. False inside a dialog card,
   * whose backdrop already cleared the system bars — adding them twice would
   * push the buttons a navigation bar's height up into the card.
   */
  edge?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ActionArea({
  children,
  background,
  borderColor,
  keyboardInset = 0,
  edge = true,
  style,
}: ActionAreaProps) {
  const insets = useSafeAreaInsets();
  // 0 on every phone; on a tablet it keeps the buttons inside the same centred
  // column as the content above them.
  const gutter = useContentGutter();
  // The bar's own ceiling. `flexShrink: 0` protects the bar from the body, and
  // this protects the bar from ITSELF: without it a bar whose content is taller
  // than the window (a wrapped consent tick + a warning + an error + a button,
  // at the 1.3x font scale AppText allows) pushes its own primary button off
  // the bottom edge — the same defect, entered from the other side. It caps the
  // CONTENT and not the padded box, so the padding that lifts the bar over the
  // keyboard can never be the thing that eats the buttons.
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = actionAreaMaxHeight(windowHeight, keyboardInset);

  return (
    <View
      style={[
        {
          // The two lines that make the reservation structural. Never a height.
          flexGrow: 0,
          flexShrink: 0,
          backgroundColor: background ?? "transparent",
          borderTopWidth: borderColor ? StyleSheet.hairlineWidth : 0,
          borderTopColor: borderColor,
          paddingTop: ACTION_AREA_PADDING_TOP,
          paddingBottom: edge
            ? ACTION_AREA_PADDING_BOTTOM +
              actionAreaBottomPadding(insets.bottom, keyboardInset)
            : 0,
          paddingLeft: edge
            ? actionAreaSidePadding(ACTION_AREA_PADDING_SIDE, insets.left, gutter)
            : 0,
          paddingRight: edge
            ? actionAreaSidePadding(ACTION_AREA_PADDING_SIDE, insets.right, gutter)
            : 0,
        },
        style,
      ]}
    >
      {/* Content-sized until the ceiling, then scrolling — the same
          `flexGrow: 0 / flexShrink: 1` pair the dialog body uses. Below the
          ceiling this measures exactly the height the children always had, so
          no bar on any device today moves by a pixel; past it, the row the user
          is reaching for is one flick away instead of off the screen.
          `bounces={false}`: an iOS ScrollView rubber-bands even when its content
          fits, and a button row that wobbles reads as broken.
          `keyboardShouldPersistTaps`: the bar sits above an open keyboard, and
          its first tap must press the button rather than be eaten dismissing. */}
      <ScrollView
        // maxHeight: derived from the MEASURED window, never a device constant
        // — the only kind of ceiling this contract allows.
        style={{ flexGrow: 0, flexShrink: 1, maxHeight }}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * Shell that hosts a scrolling body and its action area.
 *
 * WHY THE KEYBOARD OVERLAP IS MEASURED HERE AND NOT ON THE SCROLL VIEW. The bar
 * has to ride above the keyboard on iOS, where the window does not resize. The
 * obvious source for that number — the scroll body's own measured overlap — is a
 * FEEDBACK LOOP: lifting the bar shrinks the scroll body, the shrunken body no
 * longer overlaps the keyboard, the overlap reads 0, the bar drops back, and the
 * layout flickers between the two states forever. This shell is `flex: 1`, so
 * its frame never moves whatever the bar does underneath it, and the number it
 * measures is therefore stable. The scroll body inside keeps its own
 * keyboard-aware contract untouched; once the bar has lifted, that body simply
 * measures no overlap of its own, which is the truth.
 *
 * Rendered only when a container actually has actions, so a screen without them
 * mounts no extra keyboard listener.
 */
export function ActionAreaShell({
  children,
  actions,
  background,
  borderColor,
}: {
  /** The scrolling (or otherwise flexible) body. Must be `flex: 1`-ish. */
  children: React.ReactNode;
  actions: React.ReactNode;
  background: string;
  borderColor?: string;
}) {
  const { keyboardInset, viewProps } = useKeyboardViewInset();
  return (
    <View {...viewProps} style={{ flex: 1, backgroundColor: background }}>
      {children}
      <ActionArea
        background={background}
        borderColor={borderColor}
        keyboardInset={keyboardInset}
      >
        {actions}
      </ActionArea>
    </View>
  );
}
