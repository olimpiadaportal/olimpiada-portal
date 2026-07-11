// Login: segmented Parent | Student (web /login + /child-login parity).
// Parent = direct Supabase password sign-in; Student = 8-digit ID + parent
// password through the BFF (lockout + throttle live server-side).
import React, { useState } from "react";
import { Linking, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { BrandMark } from "@/components/BrandMark";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Segmented } from "@/components/Segmented";
import { ChildIdField, PasswordField, TextField } from "@/components/TextField";
import { spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/features/auth/authStore";
import { bffUrl, isBffConfigured } from "@/lib/env";

type Tab = "parent" | "student";

export default function Login() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "student" ? "student" : "parent");
  const { t } = useT();
  const { tokens } = useTheme();

  const parentLogin = useAuthStore((s) => s.parentLogin);
  const childLogin = useAuthStore((s) => s.childLogin);

  const [email, setEmail] = useState("");
  const [parentPw, setParentPw] = useState("");
  const [childId, setChildId] = useState("");
  const [childPw, setChildPw] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitParent() {
    if (!email.trim() || !parentPw) {
      setError(t("parent.err.required"));
      return;
    }
    setPending(true);
    setError(null);
    const res = await parentLogin(email, parentPw);
    setPending(false);
    if (res.error) setError(t(res.error));
    // Success: the (public) layout redirects to the role home.
  }

  async function submitChild() {
    if (childId.length !== 8) {
      setError(t("auth.child.err.idFormat"));
      return;
    }
    if (!childPw) {
      setError(t("auth.child.err.passwordRequired"));
      return;
    }
    setPending(true);
    setError(null);
    const res = await childLogin(childId, childPw);
    setPending(false);
    if (res.error) setError(t(res.error));
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.xl, paddingTop: spacing.xxl }}>
        <View style={{ alignItems: "center", gap: spacing.lg }}>
          <BrandMark size={56} />
          <Segmented<Tab>
            options={[
              { value: "parent", label: t("auth.tab.parent") },
              { value: "student", label: t("auth.tab.student") },
            ]}
            value={tab}
            onChange={(v) => {
              setTab(v);
              setError(null);
            }}
          />
        </View>

        {tab === "parent" ? (
          <View style={{ gap: spacing.lg }}>
            <TextField
              label={t("parent.auth.email")}
              placeholder={t("parent.auth.emailPh")}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="email"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <PasswordField
              label={t("parent.auth.password")}
              placeholder={t("parent.auth.passwordPh")}
              value={parentPw}
              onChangeText={setParentPw}
              showLabel={t("mob.pw.show")}
              hideLabel={t("mob.pw.hide")}
              isParentCredential
            />
            {error ? (
              <AppText variant="muted" color={tokens.danger}>
                {error}
              </AppText>
            ) : null}
            <Button
              title={t("parent.auth.login")}
              pending={pending}
              pendingTitle={t("parent.auth.submitting")}
              onPress={() => void submitParent()}
            />
            {isBffConfigured ? (
              <Button
                title={t("forgot.title")}
                variant="ghost"
                onPress={() => void Linking.openURL(`${bffUrl}/forgot-password`)}
              />
            ) : null}
            {isBffConfigured ? (
              <AppText variant="muted" style={{ textAlign: "center" }}>
                {t("mob.forgotOnWeb")}
              </AppText>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            <AppText variant="muted">{t("child.loginNote")}</AppText>
            <ChildIdField
              label={t("mob.childId")}
              placeholder={t("mob.childIdPh")}
              value={childId}
              onChangeDigits={setChildId}
            />
            <PasswordField
              label={t("mob.parentPassword")}
              value={childPw}
              onChangeText={setChildPw}
              showLabel={t("mob.pw.show")}
              hideLabel={t("mob.pw.hide")}
            />
            {error ? (
              <AppText variant="muted" color={tokens.danger}>
                {error}
              </AppText>
            ) : null}
            <Button
              title={t("child.login")}
              pending={pending}
              pendingTitle={t("parent.auth.submitting")}
              onPress={() => void submitChild()}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}
