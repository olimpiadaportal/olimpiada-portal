// Global toast overlay — mounted ONCE in the root layout, driven by
// features/toast/toastStore.
//
// Anchored to the TOP under the safe-area inset on purpose: AppTabBar sizes
// itself from its content plus the bottom inset, so there is no height to lift
// a bottom toast above, and the bottom edge belongs to the tab bar. The
// wrapper never receives touches, so nothing underneath is ever blocked.
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, CircleAlert } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, shadow, spacing } from "@/theme/tokens";
import { useToastStore, type ToastTone } from "@/features/toast/toastStore";

const IN_MS = 180;
const OUT_MS = 160;

// A second host lives inside the news modals (a Modal is its own native
// window), so both would announce the same toast. Announce once per toast id,
// whichever host gets there first.
let announcedId = 0;

export function ToastHost() {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const id = useToastStore((s) => s.id);
  const message = useToastStore((s) => s.message);
  const tone = useToastStore((s) => s.tone);

  // The store clears `message` on auto-hide, but the card must survive long
  // enough to fade out — so it keeps its own copy until the exit finishes.
  const [shown, setShown] = useState<{ message: string; tone: ToastTone } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (message) {
      setShown({ message, tone });
      // Android reads accessibilityLiveRegion; iOS only reacts to an explicit
      // announcement, so both paths are covered.
      if (announcedId !== id) {
        announcedId = id;
        AccessibilityInfo.announceForAccessibility(message);
      }
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: IN_MS,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(anim, {
      toValue: 0,
      duration: OUT_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // A new toast interrupting the exit reports finished:false — keep it.
      if (finished) setShown(null);
    });
  }, [id, message, tone, anim]);

  if (!shown) return null;

  const bad = shown.tone === "error";
  const accent = bad ? tokens.danger : tokens.ok;
  const Glyph = bad ? CircleAlert : Check;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: insets.top + spacing.sm,
        left: spacing.lg + insets.left,
        right: spacing.lg + insets.right,
        alignItems: "center",
        zIndex: 100,
      }}
    >
      <Animated.View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            maxWidth: "100%",
            backgroundColor: tokens.surface,
            borderWidth: 1,
            borderColor: tokens.border,
            borderRadius: radius.lg,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            opacity: anim,
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 0],
                }),
              },
            ],
          },
          shadow("float", tokens.shadow),
        ]}
      >
        <Glyph size={18} color={accent} strokeWidth={2.2} />
        <AppText variant="label" style={{ flexShrink: 1 }}>
          {shown.message}
        </AppText>
      </Animated.View>
    </View>
  );
}
