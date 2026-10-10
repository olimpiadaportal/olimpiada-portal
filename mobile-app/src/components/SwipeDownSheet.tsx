// THE SWIPE-TO-DISMISS BOTTOM SHEET — every bottom sheet's card goes through
// this one component.
//
// Owner bug (Android, 2026-10-10): a sheet whose content fills the screen could
// not be closed. The backdrop Pressable above the card is the only close
// affordance most sheets had, and a tall card leaves it zero pixels high; the
// 44×4 grab line looked draggable and did nothing. Now the line is real: hold
// the strip at the top of the card and pull down.
//
// Rules this file keeps, so the next sheet does not have to rediscover them:
//
//   1. THE GESTURE LIVES ON THE HANDLE STRIP ONLY. Attaching a PanResponder to
//      the whole card would fight the ScrollView/FlatList inside it for every
//      vertical drag. The strip is full width and HANDLE_STRIP tall (>= the
//      44pt iOS / 48dp-ish Material touch minimum), and it REPLACES the card's
//      top padding — the card's own paddingTop is forced to 0 so the strip is
//      the top edge, and the 4pt bar sits roughly where it always sat.
//
//   2. BUILT-IN PanResponder + Animated ONLY. The app runs in Expo Go and ships
//      OTA, so no new native module; transform-only animation, so the native
//      driver carries the release animation on both platforms.
//
//   3. `onDismiss === undefined` MEANS STRICTLY MODAL. SheetDialog relies on it:
//      an in-flight destructive request must not be abandonable. With no
//      handler the strip is decorative — no pan, no accessibility button.
//
//   4. SCREEN READERS GET A BUTTON, NOT A GESTURE. The strip is announced as a
//      "Close" button and its `activate` action dismisses (VoiceOver double-tap
//      and TalkBack double-tap both arrive as `activate`). A plain sighted TAP
//      deliberately does not close — a handle brushed while reaching for the
//      first row must not throw the sheet away.
//
//   5. BACKDROP TAP AND ANDROID BACK ARE UNTOUCHED — they stay on the caller's
//      Pressable and Modal `onRequestClose`; this is an additional way out.
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { HANDLE_STRIP, shouldDismissOnRelease } from "./swipeDismiss";

export function SwipeDownSheet({
  visible = true,
  onDismiss,
  closeLabel,
  style,
  children,
}: {
  /** The owning Modal's visibility — the sheet snaps back to rest on each open. */
  visible?: boolean;
  /** Swipe-down / screen-reader close. `undefined` = strictly modal (no swipe). */
  onDismiss?: () => void;
  /** Accessibility label for the handle strip (it is a close button). */
  closeLabel: string;
  /** The card's style (background, radii, padding, shadow…). paddingTop is overridden. */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { tokens } = useTheme();
  const translateY = useRef(new Animated.Value(0)).current;
  const sheetHeight = useRef(0);
  // Refs, so the PanResponder (created once) always sees the current props.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const closing = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const refuseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      closing.current = false;
      translateY.setValue(0);
    }
  }, [visible, translateY]);

  useEffect(
    () => () => {
      if (refuseTimer.current) clearTimeout(refuseTimer.current);
    },
    [],
  );

  const springBack = useRef(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  }).current;

  const dismiss = useRef(() => {
    const handler = onDismissRef.current;
    if (!handler || closing.current) return;
    closing.current = true;
    Animated.timing(translateY, {
      toValue: sheetHeight.current + HANDLE_STRIP,
      duration: 180,
      useNativeDriver: true,
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
        springBack();
      }, 400);
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
        onPanResponderMove: (_e, g) => translateY.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (shouldDismissOnRelease(g.dy, g.vy, sheetHeight.current)) dismiss();
          else springBack();
        },
        onPanResponderTerminate: () => springBack(),
      }),
    [translateY, dismiss, springBack],
  );

  const dismissable = !!onDismiss;

  return (
    <Animated.View
      onLayout={(e: LayoutChangeEvent) => {
        sheetHeight.current = e.nativeEvent.layout.height;
      }}
      style={[style, { paddingTop: 0, transform: [{ translateY }] }]}
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
            width: 44,
            height: 4,
            borderRadius: 2,
            backgroundColor: tokens.border,
          }}
        />
      </View>
      {children}
    </Animated.View>
  );
}
