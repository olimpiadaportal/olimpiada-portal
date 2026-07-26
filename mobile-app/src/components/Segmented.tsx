// Segmented control (web LanguageSegmented / ThemeToggle "segmented" parity):
// a soft full-round track with a raised active chip. Public API unchanged.
//
// The chip used to be the active cell's own background, so switching options
// made it HOP. It is now a single absolutely-positioned indicator that slides
// and resizes between cells. The details that make that safe everywhere:
//
//   * Widths are MEASURED (onLayout → `segmentedLayout.ts`), never split
//     evenly: "Həftəlik"/"Aylıq"/"İllik" and their Russian equivalents are very
//     different widths, and an evenly-split indicator would sit under the wrong
//     label. Nothing here has a fixed pixel width — the track still shrinks to
//     its content and never exceeds its parent.
//   * The motion runs on the UI thread (Reanimated — already an SDK-54-aligned
//     dependency and bundled inside Expo Go, so no native code and no new
//     package), which is what keeps it smooth while React is busy re-fetching
//     the screen behind it.
//   * Before the first layout pass the indicator stays invisible, so it never
//     flies in from x=0 on mount.
//   * "Reduce motion" (OS setting, live-subscribed) places the indicator
//     instantly instead of sliding.
//   * iOS: the track deliberately has NO `overflow: "hidden"`. It would clip
//     the indicator's shadow, and it is not needed — the indicator is inset by
//     the track padding and fully rounded itself, so it cannot spill past the
//     track's rounded corners.
//   * Android: siblings paint in elevation order, so the raised indicator would
//     cover the labels; the option cells are lifted one step above it. They
//     carry no background of their own, so Android draws no shadow for them
//     (elevation shadows come from the background outline) and iOS ignores
//     `elevation` entirely — one style, both platforms correct.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { shadow, spacing } from "@/theme/tokens";
import { useReduceMotion } from "@/lib/useReduceMotion";
import {
  indicatorRect,
  layoutChanged,
  segmentIndex,
  type SegmentRect,
} from "./segmentedLayout";

/** Track chrome (the groove around the chip), not layout sizing. */
const TRACK_PADDING = 3;

/** Material's decelerate curve: arrives quickly, settles, never overshoots. */
const SLIDE = { duration: 220, easing: Easing.bezier(0.2, 0, 0, 1) } as const;

// See the Android note in the header comment.
const OPTION_ELEVATION = shadow("card").elevation + 1;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { tokens } = useTheme();
  const reduceMotion = useReduceMotion();
  const [rects, setRects] = useState<(SegmentRect | undefined)[]>([]);

  const index = segmentIndex(options, value);
  const target = indicatorRect(rects, index);
  const targetX = target?.x ?? null;
  const targetWidth = target?.width ?? null;

  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const opacity = useSharedValue(0);
  /** The FIRST placement snaps; only later selections slide. */
  const placed = useRef(false);

  useEffect(() => {
    // A value outside the option set highlights nothing, exactly as before.
    if (index < 0) {
      opacity.value = 0;
      placed.current = false;
      return;
    }
    // Not measured yet — stay hidden rather than guess a position.
    if (targetX === null || targetWidth === null) return;

    if (placed.current && !reduceMotion) {
      x.value = withTiming(targetX, SLIDE);
      width.value = withTiming(targetWidth, SLIDE);
    } else {
      x.value = targetX;
      width.value = targetWidth;
    }
    opacity.value = 1;
    placed.current = true;
  }, [index, targetX, targetWidth, reduceMotion, opacity, width, x]);

  const onOptionLayout = useCallback((position: number, event: LayoutChangeEvent) => {
    const { x: measuredX, width: measuredWidth } = event.nativeEvent.layout;
    const next: SegmentRect = { x: measuredX, width: measuredWidth };
    setRects((previous) => {
      if (!layoutChanged(previous[position], next)) return previous;
      const copy = previous.slice();
      copy[position] = next;
      return copy;
    });
  }, []);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: width.value,
    opacity: opacity.value,
    transform: [{ translateX: x.value }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      style={{
        position: "relative",
        flexDirection: "row",
        backgroundColor: tokens.chipBg,
        borderRadius: 999,
        padding: TRACK_PADDING,
        alignSelf: "flex-start",
        // Never wider than the parent — long az/ru labels compress instead.
        maxWidth: "100%",
      }}
    >
      {/* The only moving part. Decorative: never tappable, never announced. */}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          {
            position: "absolute",
            left: 0,
            top: TRACK_PADDING,
            bottom: TRACK_PADDING,
            borderRadius: 999,
            backgroundColor: tokens.surface,
            zIndex: 0,
          },
          shadow("card", tokens.shadow),
          indicatorStyle,
        ]}
      />
      {options.map((o, position) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            onLayout={(event) => onOptionLayout(position, event)}
            style={{
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              minHeight: 36,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 1,
              minWidth: 0,
              // Keep the labels above the sliding indicator on both platforms.
              zIndex: 1,
              elevation: OPTION_ELEVATION,
            }}
          >
            <AppText
              variant="label"
              numberOfLines={1}
              color={active ? tokens.accent : tokens.muted}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
