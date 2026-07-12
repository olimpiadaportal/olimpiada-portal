// Celebratory countdown banner (web GiveawayBanner parity: live d/h/m/s,
// 1s tick, 2-digit padded h/m/s). Used for the giveaway window (from
// get_mobile_config payment.giveawayEndsAt) and parent free-access intervals.
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "./AppText";
import { BRAND_GRADIENT, radius, spacing } from "@/theme/tokens";

function parts(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return {
    d: Math.floor(s / 86400),
    h: String(Math.floor((s % 86400) / 3600)).padStart(2, "0"),
    m: String(Math.floor((s % 3600) / 60)).padStart(2, "0"),
    s: String(s % 60).padStart(2, "0"),
  };
}

export function CountdownBanner({
  endsAt,
  title,
  subtitle,
  labels,
}: {
  /** ISO timestamp the window ends; banner hides itself once past. */
  endsAt: string;
  title: string;
  subtitle?: string;
  labels: { d: string; h: string; m: string; s: string };
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(endMs) || endMs <= now) return null;
  const p = parts(endMs - now);

  return (
    <LinearGradient
      colors={[...BRAND_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{
        borderRadius: radius.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        gap: spacing.xs,
      }}
    >
      <AppText variant="label" color="#ffffff">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="muted" color="rgba(255,255,255,0.85)">
          {subtitle}
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        {(
          [
            [String(p.d), labels.d],
            [p.h, labels.h],
            [p.m, labels.m],
            [p.s, labels.s],
          ] as const
        ).map(([v, l], i) => (
          <View key={i} style={{ alignItems: "center" }}>
            <AppText variant="mono" color="#ffffff" style={{ fontSize: 20, fontWeight: "700" }}>
              {v}
            </AppText>
            <AppText variant="muted" color="rgba(255,255,255,0.8)" style={{ fontSize: 11 }}>
              {l}
            </AppText>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}
