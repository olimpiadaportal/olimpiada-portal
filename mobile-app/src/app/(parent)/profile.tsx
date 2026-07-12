// Parent profile screen (web ParentProfile parity, stacked section cards):
// identity (avatar + name/email/phone), security (self-service password
// change), flag-gated notification preferences (self + one row per child),
// help links (FAQ / Contact) and the double-confirm danger zone wired to the
// audited BFF delete flow.
import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { fetchChildren } from "@/lib/data";
import { useAuthStore } from "@/features/auth/authStore";
import { useOwnProfile } from "@/features/profile/useOwnProfile";
import {
  DangerZone,
  IdentityCard,
  LinkRow,
  PasswordSection,
  PrefRow,
} from "@/features/profile/sections";

export default function ParentProfile() {
  const { t } = useT();
  const router = useRouter();
  const config = useMobileConfig();
  const signOut = useAuthStore((s) => s.signOut);

  const profileQ = useOwnProfile();
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: fetchChildren });

  const notificationsOn = config.data?.flags.notifications === true;
  const kids = childrenQ.data ?? [];

  return (
    <Screen scroll>
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

        <PasswordSection t={t} />

        {notificationsOn ? (
          <Card style={{ gap: spacing.lg }}>
            <View style={{ gap: spacing.xs }}>
              <AppText variant="title" style={{ fontSize: 16 }}>
                {t("notif.prefs.title")}
              </AppText>
              <AppText variant="muted" style={{ fontSize: 12 }}>
                {t("notif.prefs.desc")}
              </AppText>
            </View>

            <View style={{ gap: spacing.sm }}>
              <AppText variant="muted" style={{ fontSize: 12 }}>
                {t("notif.prefs.yourChannels")}
              </AppText>
              <PrefRow
                target={null}
                label={
                  profileQ.data?.displayName.trim() || profileQ.data?.email || t("prof2.name")
                }
                t={t}
              />
            </View>

            <View style={{ gap: spacing.lg }}>
              <AppText variant="muted" style={{ fontSize: 12 }}>
                {t("notif.prefs.children")}
              </AppText>
              {kids.length === 0 ? (
                <AppText variant="muted">{t("notif.prefs.noChildren")}</AppText>
              ) : (
                kids.map((c) => (
                  <PrefRow
                    key={c.profile_id}
                    target={c.profile_id}
                    label={
                      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
                      (c.child_unique_id ?? "—")
                    }
                    t={t}
                  />
                ))
              )}
            </View>
          </Card>
        ) : null}

        <Card>
          <LinkRow label={t("nav.faq")} onPress={() => router.push("/(public)/faq" as never)} />
          <LinkRow
            label={t("nav.contact")}
            onPress={() => router.push("/(public)/contact" as never)}
          />
        </Card>

        <DangerZone t={t} onDeleted={() => void signOut()} />
      </View>
    </Screen>
  );
}
