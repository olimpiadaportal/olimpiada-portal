// Round header button that opens the AccountSheet (web .pnav-right avatar
// trigger parity). Shows the real Avatar: photo when the profile has one,
// otherwise initials on the user's deterministic pastel (both roles share the
// own-profile read; RLS scopes it to the signed-in user).
import React, { useState } from "react";
import { Pressable } from "react-native";
import { Avatar } from "./Avatar";
import { AccountSheet } from "./AccountSheet";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/features/auth/authStore";
import { useOwnProfile } from "@/features/profile/useOwnProfile";

export function HeaderAvatarButton() {
  const { tokens } = useTheme();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const profileId = useAuthStore((s) => s.profileId);
  const profile = useOwnProfile();

  const name = profile.data?.displayName?.trim() || profile.data?.email || "";

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("drawer.profileBtn")}
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={({ pressed }) => ({
          borderRadius: 17,
          borderWidth: 1,
          borderColor: tokens.border,
          marginRight: 12,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Avatar name={name} seed={profileId} url={profile.data?.avatarUrl ?? null} size={32} />
      </Pressable>
      <AccountSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
