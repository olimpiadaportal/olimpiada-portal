// Round header button that opens the AccountSheet (web .pnav-right avatar
// trigger parity). Shows the real Avatar: for a STUDENT the parent-set avatar
// (preset PNG / photo signed with the student's own session) wins over the
// legacy self-uploaded photo (web ChildProfileDrawer priority); parents keep
// the own-profile photo; both fall back to initials on the deterministic
// pastel (RLS scopes every read to the signed-in user).
import React, { useState } from "react";
import { Pressable } from "react-native";
import { ChildAvatar } from "./ChildAvatar";
import { AccountSheet } from "./AccountSheet";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/features/auth/authStore";
import { useOwnProfile } from "@/features/profile/useOwnProfile";
import { useStudentProfile } from "@/features/profile/studentProfile";

export function HeaderAvatarButton() {
  const { tokens } = useTheme();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const profileId = useAuthStore((s) => s.profileId);
  const role = useAuthStore((s) => s.role);
  const profile = useOwnProfile();
  // Student only — shares the profile screen's query cache; disabled (no
  // students read) for parents.
  const studentProfile = useStudentProfile({ enabled: role === "student" });

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
        <ChildAvatar
          row={role === "student" ? studentProfile.data?.avatar ?? null : null}
          name={name}
          seed={profileId}
          fallbackUrl={profile.data?.avatarUrl ?? null}
          size={32}
        />
      </Pressable>
      <AccountSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
