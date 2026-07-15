// Student profile screen (web /child/profile parity): identity card (Avatar
// with initials fallback + picker + grouped 8-digit ID), editable name,
// security (password change with the ≠8-digit-ID rule), read-only school info,
// the character-sticker theme picker and the light-mode palette picker (its
// swatches derive from ARENA_LIGHT). No email and no delete-account here — a
// child never gets those. Logout stays in the AccountSheet (header avatar),
// exactly like the parent shell. Body scrolls on the arena background so all
// five palettes + dark skin the screen.
import React from "react";
import { View } from "react-native";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useArena } from "@/features/arena/useArena";
import { ArenaScroll } from "@/features/arena/ui";
import { useStudentProfile } from "@/features/profile/studentProfile";
import {
  PaletteSection,
  SchoolInfoCard,
  StickerThemeSection,
  StudentIdentityCard,
  StudentNameSection,
  StudentPasswordSection,
} from "@/features/profile/studentSections";

export default function StudentProfileScreen() {
  const { t } = useT();
  const { arena, palette } = useArena();
  const profileQ = useStudentProfile();

  return (
    <View style={{ flex: 1, backgroundColor: arena.bg }}>
      <ArenaScroll
        onRefresh={() => void profileQ.refetch()}
        refreshing={profileQ.isRefetching}
      >
        {profileQ.isPending ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={140} />
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={160} />
          </View>
        ) : profileQ.isError ? (
          <ErrorRetry
            message={t("mob.boot.error")}
            retryLabel={t("mob.retry")}
            onRetry={() => void profileQ.refetch()}
          />
        ) : (
          <>
            <StudentIdentityCard profile={profileQ.data} t={t} />
            <StudentNameSection profile={profileQ.data} t={t} />
            <StudentPasswordSection uniqueId={profileQ.data.uniqueId} t={t} />
            <SchoolInfoCard profile={profileQ.data} t={t} />
            <StickerThemeSection t={t} />
            <PaletteSection current={palette} t={t} />
          </>
        )}
      </ArenaScroll>
    </View>
  );
}
