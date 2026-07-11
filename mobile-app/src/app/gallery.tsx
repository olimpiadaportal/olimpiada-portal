// Dev design-system gallery (M1 acceptance: every primitive renders in all
// themes × locales without overflow). Reachable from Welcome in __DEV__ only.
import React, { useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Segmented } from "@/components/Segmented";
import { ChildIdField, PasswordField, TextField } from "@/components/TextField";
import { PhoneField } from "@/components/PhoneField";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { arenaTokens, ARENA_PALETTES, spacing, type ArenaPalette } from "@/theme/tokens";
import { useLocaleStore, type Locale } from "@/i18n";
import { useT } from "@/i18n/useT";

export default function Gallery() {
  const theme = useTheme();
  const { t } = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [childId, setChildId] = useState("1234567");
  const [palette, setPalette] = useState<ArenaPalette>("default");
  const arena = arenaTokens(theme.theme, palette);

  return (
    <Screen scroll>
      <View style={{ gap: spacing.xl }}>
        <BrandMark />
        <View style={{ flexDirection: "row", gap: spacing.md, flexWrap: "wrap" }}>
          <Segmented<Locale>
            options={[
              { value: "az", label: "AZ" },
              { value: "en", label: "EN" },
              { value: "ru", label: "RU" },
            ]}
            value={locale}
            onChange={setLocale}
          />
          <Segmented
            options={[
              { value: "light" as const, label: t("drawer2.themeLight") },
              { value: "dark" as const, label: t("drawer2.themeDark") },
            ]}
            value={theme.theme}
            onChange={(v) => theme.setPreference(v)}
          />
        </View>

        <Card style={{ gap: spacing.md }}>
          <AppText variant="heading">Heading 28</AppText>
          <AppText variant="title">Title 22 — Əə Ğğ Şş Çç Üü Öö Iı İi</AppText>
          <AppText>Body 16 — {t("mob.welcome.tagline")}</AppText>
          <AppText variant="muted">Muted 14</AppText>
          <AppText variant="mono">12345678 · 99.5% · 00:25:00</AppText>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Button title={t("parent.auth.login")} onPress={() => {}} />
          <Button title={t("parent.auth.submitting")} onPress={() => {}} pending pendingTitle={t("parent.auth.submitting")} />
          <Button title={t("nav.register")} variant="ghost" onPress={() => {}} />
          <Button title={t("drawer.logout")} variant="danger" onPress={() => {}} />
        </Card>

        <Card style={{ gap: spacing.lg }}>
          <TextField label={t("parent.auth.email")} placeholder={t("parent.auth.emailPh")} />
          <PasswordField
            label={t("parent.auth.password")}
            placeholder={t("parent.auth.passwordPh")}
            showLabel={t("mob.pw.show")}
            hideLabel={t("mob.pw.hide")}
          />
          <ChildIdField
            label={t("mob.childId")}
            placeholder={t("mob.childIdPh")}
            value={childId}
            onChangeDigits={setChildId}
          />
          <PhoneField
            label={t("parent.auth.phone")}
            searchPlaceholder={t("parent.auth.phoneSearch")}
            closeLabel={t("drawer.close")}
            onChangeE164={() => {}}
          />
        </Card>

        <GateNotice title={t("gate.leaderboardOff")} body={t("mob.placeholder.body")} />
        <EmptyState title={t("notif.empty")} body={t("notif.emptyHint")} />
        <Card style={{ gap: spacing.sm }}>
          <Skeleton height={18} width="60%" />
          <Skeleton height={14} />
          <Skeleton height={14} width="80%" />
        </Card>
        <ErrorRetry message={t("mob.boot.error")} retryLabel={t("mob.retry")} onRetry={() => {}} />

        <Card style={{ gap: spacing.md, backgroundColor: arena.bg, borderColor: arena.line }}>
          <AppText variant="title" color={arena.ink}>
            Arena · {palette}
          </AppText>
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            {ARENA_PALETTES.map((p) => (
              <Button
                key={p}
                title={p}
                variant={p === palette ? "primary" : "ghost"}
                onPress={() => setPalette(p)}
                style={{ minHeight: 36, paddingVertical: 6, paddingHorizontal: 12 }}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {[arena.lime, arena.blue, arena.red, arena.gold, arena.panel2].map((c, i) => (
              <View
                key={i}
                style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c, borderWidth: 1, borderColor: arena.line }}
              />
            ))}
          </View>
          <AppText color={arena.muted}>panel/panel2/line/ink/muted/dim</AppText>
        </Card>
      </View>
    </Screen>
  );
}
