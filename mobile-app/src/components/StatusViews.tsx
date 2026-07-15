// Canonical non-content states: GateNotice (flag-gated module), EmptyState
// (branded empty, lucide glyph + one optional action), Skeleton (loading
// shimmer block), ErrorRetry. Glyphs come from lucide (one icon language).
import React, { useEffect, useState } from "react";
import { Animated, View } from "react-native";
import { CircleAlert, Inbox, Lock } from "lucide-react-native";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Card } from "./Card";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";

function GlyphChip({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: radius.md,
        backgroundColor: tokens.chipBg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
}

export function GateNotice({ title, body }: { title: string; body: string }) {
  const { tokens } = useTheme();
  return (
    <Card style={{ alignItems: "center", gap: spacing.sm }}>
      <GlyphChip>
        <Lock size={26} color={tokens.muted} strokeWidth={2} />
      </GlyphChip>
      <AppText variant="title" style={{ textAlign: "center" }}>
        {title}
      </AppText>
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {body}
      </AppText>
    </Card>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body?: string;
  /** Custom lucide glyph (default: Inbox). */
  icon?: React.ReactNode;
  /** One optional action ("Add child", "Start round"…). */
  action?: { label: string; onPress: () => void };
}) {
  const { tokens } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.sm, padding: spacing.xl }}>
      <GlyphChip>{icon ?? <Inbox size={26} color={tokens.muted} strokeWidth={2} />}</GlyphChip>
      <AppText variant="label" style={{ textAlign: "center" }}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="muted" style={{ textAlign: "center" }}>
          {body}
        </AppText>
      ) : null}
      {action ? (
        <Button
          title={action.label}
          onPress={action.onPress}
          variant="ghost"
          style={{ marginTop: spacing.sm }}
        />
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
  const { tokens } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: spacing.lg, padding: spacing.xl }}>
      <GlyphChip>
        <CircleAlert size={26} color={tokens.muted} strokeWidth={2} />
      </GlyphChip>
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {message}
      </AppText>
      <Button title={retryLabel} onPress={onRetry} variant="ghost" />
    </View>
  );
}
