"use client";

// The child's 8-digit login ID, tappable to copy.
//
// WHY A COMPONENT RATHER THAN AN onPress AT EACH SITE. The ID is rendered in
// three places — the parent home card, the Add-Child success screen and the
// per-child subscribe screen — and a parent reads it from whichever one they
// happen to be on. Three copies of "copy, then confirm, then reset" is three
// chances for one of them to drift into not confirming, which is the failure
// that matters: a silent copy is indistinguishable from a tap that missed.
//
// WHAT IT COPIES. The RAW digits, never the grouped display form. `groupChildId`
// inserts spaces for readability ("2721 0253"); pasting that into the login
// field would fail, and the parent would blame the ID rather than the spaces.
//
// ACCESSIBILITY. One button with a label that says what tapping does, and the
// confirmation is announced through an aria-live region rather than only shown
// as a colour change.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing, radius } from "@/theme/tokens";

export function CopyableId({
  id,
  display,
  label,
  copiedLabel,
  a11yLabel,
  fontSize = 20,
}: {
  /** RAW digits — what actually gets copied. */
  id: string;
  /** The grouped, readable form shown on screen. */
  display: string;
  /** Hint shown next to the number ("Copy"). */
  label: string;
  /** Confirmation shown after a successful copy ("Copied"). */
  copiedLabel: string;
  a11yLabel: string;
  fontSize?: number;
}) {
  const { tokens } = useTheme();
  const [copied, setCopied] = useState(false);
  // Cleared on unmount: a parent who copies and immediately navigates away
  // would otherwise set state on a gone component.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(id);
    } catch {
      // A clipboard write can be refused by the OS. Saying "Copied" then would
      // be a lie the parent only discovers at the login screen, so the state
      // simply does not change and the number stays selectable.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }, [id]);

  return (
    <Pressable
      onPress={() => void onCopy()}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      hitSlop={8}
      style={({ pressed }) => ({
        opacity: pressed ? 0.75 : 1,
        borderRadius: radius.md,
        gap: 2,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <AppText
          variant="mono"
          style={{ fontSize, fontWeight: "700", letterSpacing: 1 }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {display}
        </AppText>
        {copied ? (
          <Check size={16} color={tokens.ok} strokeWidth={2.5} />
        ) : (
          <Copy size={15} color={tokens.muted} strokeWidth={2} />
        )}
      </View>
      <AppText
        variant="muted"
        style={{ fontSize: 11 }}
        accessibilityLiveRegion="polite"
        color={copied ? tokens.ok : tokens.muted}
      >
        {copied ? copiedLabel : label}
      </AppText>
    </Pressable>
  );
}
