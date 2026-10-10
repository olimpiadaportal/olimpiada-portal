// THE BOTTOM-SHEET CARD — every bottom sheet's card goes through this one
// component, which owns its height detents and its drag handle.
//
// Owner bugs (Android, 2026-10-10):
//   * A sheet whose content filled the screen could not be closed. The backdrop
//     above the card was the only way out and a tall card leaves it zero pixels
//     high, while the grab line looked draggable and did nothing.
//   * A tall sheet opened all the way to the top of the window, its grab line
//     under the camera cutout — and the line itself (the faint `border` token)
//     was barely visible in either theme.
//
// Rules this file keeps, so the next sheet does not have to rediscover them:
//
//   1. TWO DETENTS (components/swipeDismiss.ts). The card's height cap starts at
//      COLLAPSED_FRACTION of the window; content taller than that scrolls inside
//      the card. Dragging the handle UP grows the cap to the FULL detent, whose
//      top edge is the top safe-area inset (or the caller's own larger top
//      margin) — never the notch. A card shorter than the collapsed cap keeps
//      its natural height and only moves down. The component sets NO top
//      margin of its own: a margin between the caller's dim backdrop and the
//      card would be an undimmed stripe. When something else shrinks the window
//      below the computed caps (the keyboard, under a KeyboardAvoidingView),
//      `flexShrink: 1` gives way and the caller's backdrop keeps the top inset
//      (`minHeight: insets.top` on the one sheet that hosts an input).
//
//   2. THE GESTURE LIVES ON THE HANDLE STRIP ONLY. A PanResponder on the whole
//      card would fight the ScrollView/FlatList inside it for every vertical
//      drag. The strip is full width and HANDLE_STRIP tall (the 44pt touch
//      minimum) and REPLACES the card's top padding.
//
//   3. BUILT-IN PanResponder + Animated ONLY — the app runs in Expo Go and
//      ships OTA, so no native module. Growing the card is a real height change
//      (a translate would push the card's bottom — its action row — off the
//      window), and `maxHeight` cannot run on the native driver, so every value
//      here is JS-driven. The animations are short springs on one view.
//
//   4. `onDismiss === undefined` MEANS STRICTLY MODAL. SheetDialog relies on it:
//      an in-flight destructive request must not be abandonable. With no
//      handler the card does not move at all — no pan, no expand, no
//      accessibility button.
//
//   5. SCREEN READERS GET A BUTTON, NOT A GESTURE. The strip is announced as a
//      close button and its `activate` action dismisses (VoiceOver and TalkBack
//      double-tap both arrive as `activate`). A plain sighted TAP deliberately
//      does nothing — a handle brushed on the way to the first row must not
//      throw the sheet away.
//
//   6. BACKDROP TAP AND ANDROID BACK ARE UNTOUCHED — they stay on the caller's
//      Pressable and Modal `onRequestClose`; this is an additional way out.
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import {
  HANDLE_STRIP,
  HANDLE_THICKNESS,
  HANDLE_WIDTH,
  dragPosition,
  releaseOutcome,
  sheetDetents,
  sheetHandleColor,
  type ReleaseOutcome,
  type SheetDetent,
} from "./swipeDismiss";

/** How long a refused close waits before the card comes back (see dismiss). */
const REFUSED_CLOSE_MS = 400;

export function SwipeDownSheet({
  visible = true,
  onDismiss,
  closeLabel,
  style,
  children,
}: {
  /** The owning Modal's visibility — the card returns to collapsed on each open. */
  visible?: boolean;
  /** Swipe-down / screen-reader close. `undefined` = strictly modal (card is fixed). */
  onDismiss?: () => void;
  /** Accessibility label for the handle strip (it is a close button). */
  closeLabel: string;
  /**
   * The card's style (background, radii, padding, shadow…). The component owns
   * paddingTop (the handle strip), maxHeight (the detents) and flexShrink; a
   * caller marginTop is kept, and counted as the card's top clearance.
   */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  // The provider is outside the Modal, so these are the SCREEN's insets — which
  // is right: a transparent Modal's window IS the screen.
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const flat = StyleSheet.flatten(style) ?? {};
  const callerTop = typeof flat.marginTop === "number" ? flat.marginTop : 0;
  const topGuard = Math.max(callerTop, insets.top);
  const { collapsed: collapsedCap, full: fullCap } = sheetDetents(windowHeight, topGuard);

  // extra: points the height cap stands above the collapsed cap (0 = collapsed).
  // drop:  translateY below the collapsed rest (the way out).
  const extra = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(0)).current;
  const maxHeight = useMemo(
    () =>
      extra.interpolate({
        inputRange: [0, 1],
        outputRange: [collapsedCap, collapsedCap + 1],
        extrapolate: "extend",
      }),
    [extra, collapsedCap],
  );

  // Everything the PanResponder (created once) reads lives in refs.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const geometry = useRef({ collapsedCap, fullCap });
  geometry.current = { collapsedCap, fullCap };
  const detent = useRef<SheetDetent>("collapsed");
  /** Extra-space position of the full detent; trimmed to the content once seen. */
  const maxExtra = useRef(Math.max(0, fullCap - collapsedCap));
  /** Whether the content is taller than the collapsed cap (expandable). */
  const tall = useRef(false);
  const sheetHeight = useRef(0);
  const resting = useRef(true);
  const closing = useRef(false);
  const startPos = useRef(0);
  const refuseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    resting.current = true;
    detent.current = "collapsed";
    extra.setValue(0);
    drop.setValue(0);
  }, [visible, extra, drop]);

  useEffect(
    () => () => {
      if (refuseTimer.current) clearTimeout(refuseTimer.current);
    },
    [],
  );

  /** Re-derive what the card can do from its height while it is at rest. */
  const settle = useRef((height: number) => {
    const { collapsedCap: cap, fullCap: full } = geometry.current;
    if (detent.current === "collapsed") {
      // Only a card the cap is actually holding back has anywhere to grow.
      tall.current = height >= cap - 1 && full > cap;
      maxExtra.current = Math.max(0, full - cap);
      return;
    }
    if (height <= cap + 1) {
      // Expanded, but the content now fits the collapsed cap: fold back.
      detent.current = "collapsed";
      tall.current = false;
      extra.setValue(0);
      return;
    }
    // Expanded content shorter than the full cap: pull the detent down to it,
    // so the next drag moves the card from its first pixel (no dead zone).
    const fitted = Math.max(0, Math.min(full, height) - cap);
    if (fitted < maxExtra.current - 1) {
      maxExtra.current = fitted;
      extra.setValue(fitted);
    }
  }).current;

  const animateTo = useRef((outcome: Exclude<ReleaseOutcome, "dismiss">) => {
    const target = outcome === "expanded" && tall.current ? maxExtra.current : 0;
    resting.current = false;
    Animated.parallel([
      Animated.spring(extra, {
        toValue: target,
        useNativeDriver: false,
        bounciness: 0,
        speed: 18,
      }),
      Animated.spring(drop, { toValue: 0, useNativeDriver: false, bounciness: 0, speed: 18 }),
    ]).start(() => {
      detent.current = target > 0 ? "expanded" : "collapsed";
      resting.current = true;
      settle(sheetHeight.current);
    });
  }).current;

  const dismiss = useRef(() => {
    const handler = onDismissRef.current;
    if (!handler || closing.current) return;
    closing.current = true;
    resting.current = false;
    Animated.timing(drop, {
      toValue: sheetHeight.current + HANDLE_STRIP,
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      handler();
      // Some owners REFUSE to close while a request is in flight (CancelSheet's
      // close() returns early while pending). Their Modal stays up, so a card
      // left off-screen would strand the user behind an empty backdrop: if we
      // are still mounted and still visible shortly after, come back.
      refuseTimer.current = setTimeout(() => {
        refuseTimer.current = null;
        if (!visibleRef.current) return;
        closing.current = false;
        animateTo("collapsed");
      }, REFUSED_CLOSE_MS);
    });
  }).current;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!onDismissRef.current && !closing.current,
        onMoveShouldSetPanResponder: (_e, g) =>
          !!onDismissRef.current && !closing.current && Math.abs(g.dy) > 2,
        // Once the finger is on the handle, nothing inside the card may take it.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          // Catch a card mid-animation where it is, not where it was going.
          let e = 0;
          let d = 0;
          extra.stopAnimation((v) => {
            e = v;
          });
          drop.stopAnimation((v) => {
            d = v;
          });
          startPos.current = e - d;
          resting.current = false;
        },
        onPanResponderMove: (_e, g) => {
          const next = dragPosition(startPos.current, g.dy, tall.current ? maxExtra.current : 0);
          extra.setValue(next.extra);
          drop.setValue(next.drop);
        },
        onPanResponderRelease: (_e, g) => {
          const outcome = releaseOutcome({
            start: startPos.current,
            dy: g.dy,
            vy: g.vy,
            maxExtra: tall.current ? maxExtra.current : 0,
            restHeight: Math.min(sheetHeight.current, geometry.current.collapsedCap),
          });
          if (outcome === "dismiss") dismiss();
          else animateTo(outcome);
        },
        onPanResponderTerminate: () => animateTo(detent.current),
      }),
    [extra, drop, dismiss, animateTo],
  );

  const dismissable = !!onDismiss;

  return (
    <Animated.View
      onLayout={(e: LayoutChangeEvent) => {
        sheetHeight.current = e.nativeEvent.layout.height;
        if (resting.current) settle(sheetHeight.current);
      }}
      style={[
        style,
        {
          paddingTop: 0,
          flexShrink: 1,
          maxHeight,
          transform: [{ translateY: drop }],
        },
      ]}
    >
      <View
        {...(dismissable ? pan.panHandlers : null)}
        accessible={dismissable}
        accessibilityRole={dismissable ? "button" : undefined}
        accessibilityLabel={dismissable ? closeLabel : undefined}
        accessibilityActions={dismissable ? [{ name: "activate", label: closeLabel }] : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "activate") dismiss();
        }}
        importantForAccessibility={dismissable ? "yes" : "no-hide-descendants"}
        style={{
          alignSelf: "stretch",
          height: HANDLE_STRIP,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: HANDLE_WIDTH,
            height: HANDLE_THICKNESS,
            borderRadius: HANDLE_THICKNESS / 2,
            backgroundColor: sheetHandleColor(tokens),
          }}
        />
      </View>
      {children}
    </Animated.View>
  );
}
