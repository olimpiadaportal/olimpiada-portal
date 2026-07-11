// The gradient logo mark: 135° purple→orange rounded square, −4° tilt, with
// the wordmark beside it (web .pnav-brand / landing logo parity).
import React from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "./AppText";
import { BRAND_GRADIENT, radius } from "@/theme/tokens";

export function BrandMark({ size = 40, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <LinearGradient
        colors={[...BRAND_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: radius.sm,
          transform: [{ rotate: "-4deg" }],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText variant="title" color="#ffffff" style={{ fontSize: size * 0.5 }}>
          IQ
        </AppText>
      </LinearGradient>
      {showWordmark ? (
        <AppText variant="title" style={{ letterSpacing: 0.5 }}>
          OlympIQ
        </AppText>
      ) : null}
    </View>
  );
}
