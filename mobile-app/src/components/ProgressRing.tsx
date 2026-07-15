// SVG progress ring with an animated sweep (plan §2): result scores, rank
// framing. Optionally strokes with the brand gradient (the sanctioned
// "brand moment" usage). Children render centered inside the ring.
import React, { useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients } from "@/theme/tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ProgressRing({
  progress,
  size = 96,
  strokeWidth = 8,
  color,
  trackColor,
  gradient = false,
  animated = true,
  children,
  style,
}: {
  /** 0..1 (clamped). */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Sweep color (default: theme accent). Ignored when gradient=true. */
  color?: string;
  /** Track color (default: theme border). */
  trackColor?: string;
  /** Stroke the sweep with the brand gradient. */
  gradient?: boolean;
  /** Animate the sweep to the target on mount/update. */
  animated?: boolean;
  /** Centered content (score number, rank…). */
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  const { tokens } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  const sweep = useRef(new Animated.Value(animated ? 0 : clamped)).current;
  useEffect(() => {
    if (!animated) {
      sweep.setValue(clamped);
      return;
    }
    Animated.timing(sweep, {
      toValue: clamped,
      duration: 700,
      useNativeDriver: false, // SVG props are JS-driven
    }).start();
  }, [animated, clamped, sweep]);

  const dashOffset = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const gradientId = "olympiq-ring-gradient";
  const stroke = gradient ? `url(#${gradientId})` : (color ?? tokens.accent);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}
    >
      <Svg width={size} height={size}>
        {gradient ? (
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradients.brand[0]} />
              <Stop offset="1" stopColor={gradients.brand[1]} />
            </LinearGradient>
          </Defs>
        ) : null}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor ?? tokens.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children ? (
        <View
          style={{
            position: "absolute",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}
