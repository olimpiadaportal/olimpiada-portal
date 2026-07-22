// Parent profile screen (web ParentProfile parity, stacked section cards):
// identity (avatar + name/email/phone), the phone add/edit module, security
// (self-service password change), help links (FAQ / Contact) and the
// double-confirm danger zone wired to the audited BFF delete flow.
import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Mail } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useAuthStore } from "@/features/auth/authStore";
import { useOwnProfile } from "@/features/profile/useOwnProfile";
import {
  DangerZone,
  IdentityCard,
  LinkRow,
  PasswordSection,
  PhoneSection,
} from "@/features/profile/sections";

export default function ParentProfile() {
  const { t } = useT();
  const { tokens } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const signOut = useAuthStore((s) => s.signOut);

  const profileQ = useOwnProfile();

  const { refreshing, onRefresh } = usePullRefresh([profileQ]);

  return (
    <Screen scroll refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ gap: spacing.lg }}>
        {profileQ.isPending ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={120} />
            <Skeleton height={80} />
          </View>
        ) : profileQ.isError ? (
          <ErrorRetry
            message={t("mob.boot.error")}
            retryLabel={t("mob.retry")}
            onRetry={() => void profileQ.refetch()}
          />
        ) : (
          <IdentityCard profile={profileQ.data} t={t} />
        )}

        <PhoneSection
          current={profileQ.data?.phone ?? null}
          t={t}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ["own-profile"] })}
        />

        <PasswordSection t={t} />

        <Card>
          <LinkRow
            icon={<CircleHelp size={18} color={tokens.accent} strokeWidth={2} />}
            label={t("nav.faq")}
            onPress={() => router.push("/(public)/faq" as never)}
          />
          <LinkRow
            icon={<Mail size={18} color={tokens.accent} strokeWidth={2} />}
            label={t("nav.contact")}
            onPress={() => router.push("/(public)/contact" as never)}
          />
        </Card>

        <DangerZone t={t} onDeleted={() => void signOut()} />
      </View>
    </Screen>
  );
}
