import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";

/**
 * Base screen container: themed background, safe-area padding, optional
 * scrolling with keyboard avoidance (every form screen uses scroll=true).
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  background,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  background?: string;
}) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const bg = background ?? tokens.bg;
  const pad = padded ? spacing.lg : 0;

  if (!scroll) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: pad + insets.left,
          paddingRight: pad + insets.right,
        }}
      >
        {children}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + pad,
          paddingBottom: insets.bottom + pad,
          paddingLeft: pad + insets.left,
          paddingRight: pad + insets.right,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
