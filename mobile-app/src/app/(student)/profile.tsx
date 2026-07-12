// Student profile screen (web /child/profile parity): identity card (avatar
// picker + name + grouped 8-digit ID), editable name, security (password
// change with the ≠8-digit-ID rule), read-only school info, the character-
// sticker theme picker and the light-mode palette picker. No email and no
// delete-account here — a child never gets those. Logout stays in the
// AccountSheet (header avatar), exactly like the parent shell.
import React from "react";
import { View } from "react-native";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { arenaTokens, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { ScreenScroll } from "@/features/parent/ui";
import { useStudentProfile } from "@/features/profile/studentProfile";
import { useArenaPalette } from "@/features/profile/useArenaPalette";
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
  const { theme } = useTheme();
  const palette = useArenaPalette();
  const arena = arenaTokens(theme, palette);
  const profileQ = useStudentProfile();

  return (
    <View style={{ flex: 1, backgroundColor: arena.bg }}>
      <ScreenScroll
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
      </ScreenScroll>
    </View>
  );
}
