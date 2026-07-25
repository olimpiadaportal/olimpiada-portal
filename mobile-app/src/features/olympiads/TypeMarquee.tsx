// Round 43 — animated olympiad-type marquee (web .poly-type parity). The type
// sits in a fixed-height, overflow-hidden, single-line strip at the TOP of each
// olympiad card. It scrolls right-to-left in a seamless two-copy loop ONLY when
// the text is wider than the strip; short text stays static + ellipsized. The
// strip never changes the card's height (fixed height, absolute measuring
// probe). Reduced motion (AccessibilityInfo) disables the animation entirely
// and shows the static, ellipsized label — a11y parity with the web's
// prefers-reduced-motion gate. Touch has no hover, so there is no pause-on-hover.
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { AppText } from "@/components/AppText";

// Trailing gap between the two looped copies (web .poly-type-seg padding-right).
const GAP = 44;
// Continuous scroll speed (px/sec) — length-independent, so long and short
// overflowing names move at the same readable pace.
const SPEED = 45;
const STRIP_HEIGHT = 20;

export function TypeMarquee({
  text,
  color,
  style,
}: {
  text: string;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;

  // Reduced-motion: initial read + live subscription (RN returns a subscription
  // with .remove()). A user toggling the OS setting flips this mid-session.
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (active) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) =>
      setReduceMotion(v),
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  // Animate strictly when the text overflows the strip AND motion is allowed.
  const overflow = textW > 0 && containerW > 0 && textW > containerW + 1;
  const animate = overflow && !reduceMotion;

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    if (!animate) return;
    const distance = textW + GAP; // one copy + its trailing gap = one period
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: -distance,
        duration: (distance / SPEED) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, textW, translateX]);

  const segStyle: TextStyle = {
    color,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };

  const onContainerLayout = (e: LayoutChangeEvent) =>
    setContainerW(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onContainerLayout}
      style={[{ height: STRIP_HEIGHT, overflow: "hidden", justifyContent: "center" }, style]}
    >
      {animate ? (
        <Animated.View
          style={{ flexDirection: "row", transform: [{ translateX }] }}
          // The scrolling track can exceed the parent — never wraps.
          pointerEvents="none"
        >
          <AppText style={segStyle}>{text}</AppText>
          <View style={{ width: GAP }} />
          <AppText style={segStyle} accessibilityElementsHidden importantForAccessibility="no">
            {text}
          </AppText>
        </Animated.View>
      ) : (
        <AppText numberOfLines={1} ellipsizeMode="tail" style={segStyle}>
          {text}
        </AppText>
      )}

      {/* Off-screen probe: measures the intrinsic single-line text width without
          wrapping (wide container) or affecting layout (absolute + hidden). */}
      <View
        style={{ position: "absolute", left: 0, top: 0, width: 4000, opacity: 0 }}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <AppText
          style={segStyle}
          onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
        >
          {text}
        </AppText>
      </View>
    </View>
  );
}
