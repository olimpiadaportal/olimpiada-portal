// Dev design-system gallery (M1 acceptance: every primitive renders in all
// themes × locales without overflow). Showcases the redesign primitives
// (Avatar, ListRow, StepDots, ProgressRing, SectionHeader, AppTabBar items,
// Card variants, gradient Button, shadow levels) alongside the originals.
//
// NOT A PRODUCT SURFACE, AND NO LONGER REACHABLE AS ONE (2026-09-22). The link
// into it was removed from the onboarding in Round 23, but a link is not a
// route: expo-router registers EVERY file under src/app, so olympiq://gallery
// still resolved in a release build and dropped whoever opened it — a child
// included — into a developer screen with no product meaning. __DEV__ is the
// gate because it is the fact the screen already claimed about itself: this is
// a development tool. In a release bundle the route redirects to the session's
// own home and renders nothing else.
import React, { useState } from "react";
import { View } from "react-native";
import { ArrowRight, Bell, Mail, Settings, UserRound } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { ListRow } from "@/components/ListRow";
import { StepDots } from "@/components/StepDots";
import { ProgressRing } from "@/components/ProgressRing";
import { SectionHeader } from "@/components/SectionHeader";
import { AppTabBarItem, appTabPalette, arenaTabPalette } from "@/components/AppTabBar";
import { TabIcon } from "@/components/TabIcon";
import { Segmented } from "@/components/Segmented";
import { ChildIdField, PasswordField, TextField } from "@/components/TextField";
import { PhoneField, usePhoneValue } from "@/components/PhoneField";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import {
  arenaTokens,
  ARENA_PALETTES,
  shadow,
  radius,
  spacing,
  type ArenaPalette,
} from "@/theme/tokens";
import { useLocaleStore, type Locale } from "@/i18n";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/features/auth/authStore";
import { GroupRedirect } from "@/lib/TabRedirect";

/**
 * The ROUTE. In a release bundle it is a redirect and nothing else, so a deep
 * link to /gallery lands the user on their own home instead of in here.
 *
 * GroupRedirect, not expo-router's <Redirect>: these targets are root GROUPS,
 * and a plain replace onto a group that is already in the root stack mints a
 * second copy of it (lib/navigation.ts). The fallbacks mirror the ones in
 * (public)/_layout.tsx so the two guards cannot drift apart.
 *
 * The two hooks above the branch run on every render, in the same order, in
 * both bundles; <Gallery/> owns the rest and is only ever mounted in dev.
 */
export default function GalleryRoute() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  if (!__DEV__) {
    const home =
      status === "signedIn" && role === "parent"
        ? "/(parent)/(tabs)/home"
        : status === "signedIn" && role === "student"
          ? "/(student)/(tabs)/home"
          : "/(public)/login";
    return <GroupRedirect href={home} />;
  }
  return <Gallery />;
}

function Gallery() {
  const theme = useTheme();
  const { tokens } = theme;
  const { t } = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [childId, setChildId] = useState("1234567");
  const [phoneValue, setPhoneValue] = usePhoneValue();
  const [palette, setPalette] = useState<ArenaPalette>("default");
  const [step, setStep] = useState(0);
  const [ring, setRing] = useState(0.72);
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
          <AppText variant="display">Display 32</AppText>
          <AppText variant="heading">Heading 28</AppText>
          <AppText variant="title">Title 22 — Əə Ğğ Şş Çç Üü Öö Iı İi</AppText>
          <AppText>Body 16 — {t("mob.welcome.tagline")}</AppText>
          <AppText variant="muted">Muted 14</AppText>
          <AppText variant="eyebrow">EYEBROW 12 +0.4</AppText>
          <AppText variant="mono">12345678 · 99.5% · 00:25:00</AppText>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Button title={t("parent.auth.login")} variant="gradient" onPress={() => {}} />
          <Button
            title={t("mob.onb.next")}
            onPress={() => {}}
            icon={<ArrowRight size={18} color="#ffffff" strokeWidth={2} />}
          />
          <Button title={t("parent.auth.submitting")} onPress={() => {}} pending pendingTitle={t("parent.auth.submitting")} />
          <Button title={t("nav.register")} variant="ghost" onPress={() => {}} />
          <Button title={t("drawer.logout")} variant="danger" onPress={() => {}} />
        </Card>

        {/* Card variants + shadow levels */}
        <Card variant="flat" style={{ gap: spacing.xs }}>
          <AppText variant="label">Card flat</AppText>
          <AppText variant="muted">border only</AppText>
        </Card>
        <Card variant="raised" style={{ gap: spacing.xs }}>
          <AppText variant="label">Card raised</AppText>
          <AppText variant="muted">shadow(&quot;card&quot;)</AppText>
        </Card>
        <Card variant="hero" style={{ gap: spacing.xs }}>
          <AppText variant="label">Card hero</AppText>
          <AppText variant="muted">radius.xl + shadow(&quot;float&quot;)</AppText>
        </Card>
        <View
          style={[
            {
              backgroundColor: tokens.surface,
              borderRadius: radius.lg,
              padding: spacing.lg,
            },
            shadow("float", tokens.shadow),
          ]}
        >
          <AppText variant="muted">raw shadow(&quot;float&quot;) surface</AppText>
        </View>

        {/* Avatar */}
        <Card style={{ gap: spacing.md }}>
          <SectionHeader title="AVATAR" />
          <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center", flexWrap: "wrap" }}>
            <Avatar name="Aysel Bayramova" seed="a1" size={48} />
            <Avatar name="Murad Əliyev" seed="b2" size={48} />
            <Avatar name="Nigar" seed="c3" size={40} />
            <Avatar name="Tural Həsənli" seed="d4" size={32} />
            <Avatar name="" seed="e5" size={32} />
          </View>
        </Card>

        {/* ListRow */}
        <Card style={{ gap: spacing.xs }}>
          <SectionHeader title="LISTROW" action={{ label: "···", onPress: () => {} }} />
          <ListRow
            icon={<UserRound size={20} color={tokens.accent} strokeWidth={2} />}
            title={t("drawer.profileBtn")}
            subtitle={t("drawer2.account")}
            onPress={() => {}}
          />
          <ListRow
            icon={<Bell size={20} color={tokens.accent} strokeWidth={2} />}
            title={t("notif.title")}
            value="12"
            onPress={() => {}}
          />
          <ListRow
            icon={<Mail size={20} color={tokens.accent} strokeWidth={2} />}
            title={t("contact.emailLabel")}
            subtitle="info@olympiq.ai"
          />
          <ListRow
            icon={<Settings size={20} color={tokens.danger} strokeWidth={2} />}
            title={t("drawer.logout")}
            danger
            chevron={false}
            onPress={() => {}}
          />
        </Card>

        {/* StepDots + ProgressRing */}
        <Card style={{ gap: spacing.lg, alignItems: "center" }}>
          <StepDots count={3} index={step} />
          <Button
            title={`StepDots → ${(step + 1) % 3}`}
            variant="ghost"
            onPress={() => setStep((s) => (s + 1) % 3)}
          />
          <View style={{ flexDirection: "row", gap: spacing.xl, alignItems: "center" }}>
            <ProgressRing progress={ring} size={96} gradient>
              <AppText variant="mono" style={{ fontSize: 20, fontWeight: "700" }}>
                {Math.round(ring * 100)}%
              </AppText>
            </ProgressRing>
            <ProgressRing progress={ring} size={64} strokeWidth={6}>
              <AppText variant="mono" style={{ fontSize: 14 }}>
                {Math.round(ring * 100)}
              </AppText>
            </ProgressRing>
          </View>
          <Button
            title="ProgressRing random"
            variant="ghost"
            onPress={() => setRing(Math.round(Math.random() * 100) / 100)}
          />
        </Card>

        {/* AppTabBar preview: parent palette + arena palette */}
        <Card style={{ gap: spacing.md, padding: 0, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", backgroundColor: tokens.surface }}>
            {(["home", "chart", "medal"] as const).map((n, i) => {
              const p = appTabPalette(tokens);
              const focused = i === 0;
              return (
                <AppTabBarItem
                  key={n}
                  label={n}
                  focused={focused}
                  palette={p}
                  icon={<TabIcon name={n} color={focused ? p.active : p.inactive} focused={focused} />}
                  onPress={() => {}}
                />
              );
            })}
          </View>
          <View style={{ flexDirection: "row", backgroundColor: arena.panel }}>
            {(["arena", "test", "rank"] as const).map((n, i) => {
              const p = arenaTabPalette(arena);
              const focused = i === 0;
              return (
                <AppTabBarItem
                  key={n}
                  label={n}
                  focused={focused}
                  palette={p}
                  icon={<TabIcon name={n} color={focused ? p.active : p.inactive} focused={focused} />}
                  onPress={() => {}}
                />
              );
            })}
          </View>
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
            value={phoneValue}
            onChange={setPhoneValue}
            onChangeE164={() => {}}
          />
        </Card>

        <GateNotice title={t("gate.leaderboardOff")} body={t("mob.placeholder.body")} />
        <EmptyState
          title={t("notif.empty")}
          body={t("notif.emptyHint")}
          action={{ label: t("mob.retry"), onPress: () => {} }}
        />
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
