// User avatar (plan §2): photo via expo-image when a URL exists, otherwise
// initials on a deterministic per-user pastel (seeded by profileId so the
// color is stable across screens and sessions). Replaces every "•"/emoji
// placeholder. Decorative pastel pairs are component-local by design —
// tokens.ts only mirrors web values, and these exist solely for avatars
// (each pair is AA for the bold initial glyphs in both app themes).
import React from "react";
import { View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { AppText } from "./AppText";
import { weight } from "@/theme/tokens";

/** [background, ink] — soft field + deep same-hue ink (≥ 4.5:1). */
const PASTELS: [string, string][] = [
  ["#f3e8ff", "#6d28d9"], // violet
  ["#ffedd5", "#c2410c"], // orange
  ["#dcfce7", "#15803d"], // green
  ["#dbeafe", "#1d4ed8"], // blue
  ["#fce7f3", "#be185d"], // pink
  ["#fef9c3", "#a16207"], // amber
  ["#ccfbf1", "#0f766e"], // teal
  ["#fee2e2", "#b91c1c"], // red
];

function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** "AB" initials from a display name ("Aysel Bayramova" → "AB"). */
export function avatarInitials(name: string | null | undefined): string {
  const src = (name ?? "").trim();
  if (!src) return "•";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function Avatar({
  name,
  seed,
  url = null,
  size = 40,
  style,
}: {
  /** Display name — source of the initials and the a11y label. */
  name: string | null | undefined;
  /** Stable pastel key (profileId). Falls back to the name. */
  seed?: string | null;
  /** Photo URL — rendered with expo-image when present. */
  url?: string | null;
  size?: number;
  style?: ViewStyle;
}) {
  const key = (seed ?? "").trim() || (name ?? "").trim() || "olympiq";
  const [bg, ink] = PASTELS[hashSeed(key) % PASTELS.length];

  if (url) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: bg }, style]}>
        <Image
          source={{ uri: url }}
          recyclingKey={url}
          contentFit="cover"
          transition={150}
          accessible
          accessibilityLabel={name ?? undefined}
          style={{ width: size, height: size }}
        />
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name ?? undefined}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <AppText
        color={ink}
        numberOfLines={1}
        style={{ fontSize: Math.round(size * 0.38), fontWeight: weight.bold, letterSpacing: 0.5 }}
      >
        {avatarInitials(name)}
      </AppText>
    </View>
  );
}
