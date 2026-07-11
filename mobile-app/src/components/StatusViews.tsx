// Canonical non-content states: GateNotice (flag-gated module), EmptyState
// (branded empty), Skeleton (loading shimmer block), ErrorRetry.
import React, { useEffect, useState } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Card } from "./Card";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";

export function GateNotice({ title, body }: { title: string; body: string }) {
  const { tokens } = useTheme();
  return (
    <Card style={{ alignItems: "center", gap: spacing.sm }}>
      <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
        <Path
          d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z"
          stroke={tokens.muted}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <AppText variant="title" style={{ textAlign: "center" }}>
        {title}
      </AppText>
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {body}
      </AppText>
    </Card>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  const { tokens } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.sm, padding: spacing.xl }}>
      <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={tokens.border} strokeWidth={2} />
        <Path
          d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"
          stroke={tokens.muted}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
      <AppText variant="label" style={{ textAlign: "center" }}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="muted" style={{ textAlign: "center" }}>
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = "100%" as number | `${number}%` }) {
  const { tokens } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={{
        height,
        width,
        borderRadius: radius.sm,
        backgroundColor: tokens.chipBg,
        opacity: pulse,
      }}
    />
  );
}

export function ErrorRetry({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <View style={{ alignItems: "center", gap: spacing.lg, padding: spacing.xl }}>
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {message}
      </AppText>
      <Button title={retryLabel} onPress={onRetry} variant="ghost" />
    </View>
  );
}
