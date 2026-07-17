// Full-screen branded lock overlay, rendered ON TOP of the navigator (the
// Stack stays mounted — navigation state survives the lock). Auto-prompts
// biometrics when it appears, offers a retry and a logout escape, and eats
// the Android hardware back while up. Token-driven — correct in both themes.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import { Lock } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/features/auth/authStore";
import { useAppLockStore } from "./appLockStore";

export function LockOverlay() {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const status = useAuthStore((s) => s.status);
  const signOut = useAuthStore((s) => s.signOut);
  const locked = useAppLockStore((s) => s.locked);
  const setLocked = useAppLockStore((s) => s.setLocked);
  const [busy, setBusy] = useState(false);

  // Only a live session can be locked (sign-out clears the state anyway).
  const visible = locked && status === "signedIn";

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: t("mob.lock.prompt"),
        // Device PIN/pattern stays available as the fallback path.
        disableDeviceFallback: false,
      });
      if (res.success) setLocked(false);
    } catch {
      // prompt failed/cancelled — the retry button stays
    } finally {
      setBusy(false);
    }
  }, [setLocked, t]);

  // Auto-prompt once per lock (not on every re-render/locale switch).
  const prompted = useRef(false);
  useEffect(() => {
    if (!visible) {
      prompted.current = false;
      return;
    }
    if (prompted.current) return;
    prompted.current = true;
    void tryUnlock();
  }, [visible, tryUnlock]);

  // Android hardware back must not dismiss the lock (or pop screens under it).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [visible]);

  if (!visible) return null;

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: tokens.bg,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing.xxl,
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.xl,
        },
      ]}
    >
      <BrandMark size={56} />
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.md,
          backgroundColor: tokens.chipBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Lock size={30} color={tokens.accent} strokeWidth={2} />
      </View>
      <AppText variant="title" style={{ textAlign: "center" }}>
        {t("mob.lock.lockedTitle")}
      </AppText>
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {t("mob.lock.lockedBody")}
      </AppText>
      <Button
        title={t("mob.lock.unlock")}
        variant="gradient"
        pending={busy}
        onPress={() => void tryUnlock()}
        style={{ alignSelf: "stretch" }}
      />
      <Button
        title={t("drawer.logout")}
        variant="ghost"
        onPress={() => void signOut()}
        style={{ alignSelf: "stretch" }}
      />
    </View>
  );
}
