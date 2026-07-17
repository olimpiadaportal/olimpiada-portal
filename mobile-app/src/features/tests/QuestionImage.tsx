// TEST ENGINE (M3.1) — question figure (web QuestionImage.tsx parity,
// migration 056/057): the attempt/review payloads carry an optional
// locale-aware image ref; this renders it between the question body and the
// options, and a tap opens the full-size figure in a full-screen viewer (zoom
// for small diagrams). The URL is a PUBLIC-bucket URL built like the web
// (bucket+path → getPublicUrl, a pure URL builder — no request); all strings
// arrive translated via props. Skeleton pulse while loading; a broken figure
// hides silently and never blocks the question (expo-image defaults, no
// caching hacks).
import React, { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/StatusViews";
import { radius, spacing, type ArenaTokens } from "@/theme/tokens";
import { tint } from "./ui";

const FIGURE_HEIGHT = 220;

export function QuestionImage({
  arena,
  url,
  alt,
  hint,
  closeLabel,
}: {
  arena: ArenaTokens;
  /** Public storage URL (publicStorageUrl(bucket, path) — web getPublicUrl parity). */
  url: string;
  /** Translated alt text ("question image"). */
  alt: string;
  /** Translated zoom hint (a11y label on the tappable figure). */
  hint: string;
  /** Translated close label for the viewer. */
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const insets = useSafeAreaInsets();

  // Silent hide on error (web behavior: a broken <img> never blocks the flow).
  if (failed) return null;

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={hint}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          borderWidth: 1,
          borderColor: arena.line,
          borderRadius: radius.md,
          backgroundColor: arena.panel2,
          overflow: "hidden",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Image
          source={{ uri: url }}
          contentFit="contain"
          style={{ width: "100%", height: FIGURE_HEIGHT }}
          accessibilityLabel={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
        {!loaded ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
            <Skeleton height={FIGURE_HEIGHT} />
          </View>
        ) : null}
      </Pressable>

      {/* Full-screen viewer: dark scrim, contained image, tap or the close
          button dismisses (Android back via onRequestClose). */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityLabel={closeLabel}
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: tint("#000000", 0.92),
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              padding: spacing.lg,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={() => setOpen(false)}
              hitSlop={10}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                backgroundColor: "rgba(255,255,255,0.12)",
                borderRadius: 999,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.lg,
                minHeight: 40,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <X size={16} color="#ffffff" strokeWidth={2.5} />
              <AppText variant="label" color="#ffffff" style={{ fontSize: 13 }}>
                {closeLabel}
              </AppText>
            </Pressable>
          </View>
          <Image
            source={{ uri: url }}
            contentFit="contain"
            style={{ flex: 1, marginBottom: spacing.xl }}
            accessibilityLabel={alt}
          />
        </Pressable>
      </Modal>
    </>
  );
}
