// Round header button that opens the AccountSheet (web .pnav-right avatar
// trigger parity). Shows the real Avatar: a STUDENT renders ONLY their students
// row (preset PNG / photo signed with their own session from the private
// bucket) — never `useOwnProfile().avatarUrl`, which is a PUBLIC storage URL
// and must never carry a child's photograph; parents keep their own-profile
// photo. Both fall back to initials on the deterministic pastel (RLS scopes
// every read to the signed-in user).
//
// THE RING IS ON AN INNER VIEW, NOT ON THE PRESSABLE. The button itself is now
// the box every header control shares (components/iconButtonLayout.ts), so
// the bell beside it and the chevron across the bar are declared at the same
// size — which is what makes the container iOS 26 draws behind each of them
// come out identical. The ring keeps its old geometry exactly: a 32pt avatar
// inside a 1pt hairline is the same 34pt circle it has always been, and it is
// the one container in the header that stays - not because it clips anything
// (ChildAvatar masks its own image with overflow:"hidden"), but because it is a
// RING AROUND A PHOTOGRAPH rather than a chip behind a glyph. A photo needs an
// edge against the header to read as a control; a glyph does not, which is why
// the other three shed theirs
// rather than decorating a glyph.
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { ChildAvatar } from "./ChildAvatar";
import { AccountSheet } from "./AccountSheet";
import { HEADER_BUTTON_HIT_SLOP, headerButtonBox } from "./iconButtonLayout";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/features/auth/authStore";
import { useOwnProfile } from "@/features/profile/useOwnProfile";
import { useStudentProfile } from "@/features/profile/studentProfile";

/** Avatar diameter inside the 1pt ring — 32 + 1 + 1 = the shared 34pt box. */
const AVATAR_SIZE = 32;

export function HeaderAvatarButton() {
  const { tokens } = useTheme();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const profileId = useAuthStore((s) => s.profileId);
  const role = useAuthStore((s) => s.role);
  const isStudent = role === "student";
  const profile = useOwnProfile();
  // Student only — shares the profile screen's query cache; disabled (no
  // students read) for parents.
  const studentProfile = useStudentProfile({ enabled: isStudent });

  const name = profile.data?.displayName?.trim() || profile.data?.email || "";

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("drawer.profileBtn")}
        onPress={() => setOpen(true)}
        // 34pt box + 8pt slop = 50pt of touch. It was 6pt of slop on a 34pt
        // box, which cleared the iOS 44pt minimum but not Material's 48dp.
        hitSlop={HEADER_BUTTON_HIT_SLOP}
        style={({ pressed }) => [
          headerButtonBox,
          { marginRight: 12, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <View
          style={{
            borderRadius: (AVATAR_SIZE + 2) / 2,
            borderWidth: 1,
            borderColor: tokens.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChildAvatar
            row={isStudent ? studentProfile.data?.avatar ?? null : null}
            name={name}
            seed={profileId}
            // PARENTS ONLY. The parent's own avatar is a public-bucket URL by
            // design (an adult publishing their own picture); a student must
            // resolve through the private signed path above or show initials.
            fallbackUrl={isStudent ? null : profile.data?.avatarUrl ?? null}
            size={AVATAR_SIZE}
          />
        </View>
      </Pressable>
      <AccountSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
