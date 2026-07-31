// Login: segmented Parent | Student (web /login + /child-login parity).
// Parent = direct Supabase password sign-in; Student = 8-digit ID + parent
// password through the BFF (lockout + throttle live server-side).
// Redesign (plan §3/§4, tightened Round 23): brand header, card-grouped
// fields, gradient primary CTA and ONE register link — nothing else. The
// owner's rule: auth surfaces carry no marketing/info links (the public pages
// stay routable in-app; pricing shows up inside the parent flows).
//
// The ONE conditional exception: when the server answers parent.err.unverified
// the card grows a resend-confirmation button. It is error RECOVERY, not a
// link — invisible until the server says this account exists but is
// unconfirmed, and gone again the moment the error clears. Without it a parent
// whose confirmation mail was lost is stranded for good (they cannot log in,
// and a password reset does not confirm an address); the register screen's
// "check your inbox" card is local state and is unreachable by then. Web
// closes the same gap with the durable /verify-email URL.
import React, { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Segmented } from "@/components/Segmented";
import { ChildIdField, PasswordField, TextField } from "@/components/TextField";
import { ResendConfirmation } from "@/components/ResendConfirmation";
import { spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { useFieldChain } from "@/lib/useFieldChain";
import { useAuthStore } from "@/features/auth/authStore";
import { bffUrl, isBffConfigured } from "@/lib/env";

type Tab = "parent" | "student";

export default function Login() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "student" ? "student" : "parent");
  const { t } = useT();
  const { tokens } = useTheme();
  const router = useRouter();

  const parentLogin = useAuthStore((s) => s.parentLogin);
  const childLogin = useAuthStore((s) => s.childLogin);

  const [email, setEmail] = useState("");
  const [parentPw, setParentPw] = useState("");
  const [childId, setChildId] = useState("");
  const [childPw, setChildPw] = useState("");
  const [pending, setPending] = useState(false);
  // The i18n KEY, not the rendered sentence — the language switcher above can
  // change the locale while an error is on screen, and the message has to
  // follow it.
  const [error, setError] = useState<string | null>(null);

  async function submitParent() {
    if (!email.trim() || !parentPw) {
      setError("parent.err.required");
      return;
    }
    setPending(true);
    setError(null);
    const res = await parentLogin(email, parentPw);
    setPending(false);
    if (res.error) setError(res.error);
    // Success: the (public) layout redirects to the role home.
  }

  async function submitChild() {
    if (childId.length !== 8) {
      setError("auth.child.err.idFormat");
      return;
    }
    if (!childPw) {
      setError("auth.child.err.passwordRequired");
      return;
    }
    setPending(true);
    setError(null);
    const res = await childLogin(childId, childPw);
    setPending(false);
    if (res.error) setError(res.error);
  }

  // Two independent runs — the Segmented control swaps the whole field set, so
  // a single chain would keep stale slots. "Done" on the last field calls the
  // SAME function the button calls (never a second submit path), and only when
  // the button itself would be pressable: `pending` mirrors Button's own
  // disabled-while-pending guard.
  const parentChain = useFieldChain(2, {
    onLast: () => {
      if (!pending) void submitParent();
    },
  });
  const childChain = useFieldChain(2, {
    onLast: () => {
      if (!pending) void submitChild();
    },
  });

  return (
    <Screen scroll>
      <View style={{ gap: spacing.xl, paddingTop: spacing.sm }}>
        {/* This screen has no native header, so the back arrow + language chip
            ride in the content — in flow, not absolute: the form scrolls under
            a keyboard and a floating chip would sit on top of the fields. The
            arrow shows only when a screen is actually behind (the onboarding):
            after the once-per-install welcome, Login IS the stack root, and
            root screens carry no back per both platforms' guidelines. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {router.canGoBack() ? (
            <BackButton label={t("nav.back")} onPress={() => router.back()} />
          ) : (
            <View />
          )}
          <LocaleSwitcher />
        </View>
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
            <Card style={{ gap: spacing.lg }}>
              <TextField
                {...parentChain.field(0)}
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
                {...parentChain.field(1)}
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
                  {t(error)}
                </AppText>
              ) : null}
              {/* Recovery for the unconfirmed account (see the header note).
                  Keyed on the email in state, so it needs no re-typing; the
                  cooldown starts at zero because nothing was just sent. */}
              {error === "parent.err.unverified" ? (
                <ResendConfirmation email={email.trim()} />
              ) : null}
              <Button
                title={t("parent.auth.login")}
                variant="gradient"
                pending={pending}
                pendingTitle={t("parent.auth.submitting")}
                onPress={() => void submitParent()}
              />
            </Card>
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
          <Card style={{ gap: spacing.lg }}>
            <AppText variant="muted">{t("child.loginNote")}</AppText>
            {/* The OTP-shaped field: a number pad has no return key on iOS, so
                the 8th digit landing is what advances to the password — the
                same auto-advance every one-time-code entry uses. Android may
                still show an action key, so the chain's "next" stays wired. */}
            <ChildIdField
              {...childChain.field(0)}
              label={t("mob.childId")}
              placeholder={t("mob.childIdPh")}
              value={childId}
              onChangeDigits={setChildId}
              onComplete={() => childChain.focus(1)}
            />
            <PasswordField
              {...childChain.field(1)}
              label={t("mob.parentPassword")}
              value={childPw}
              onChangeText={setChildPw}
              showLabel={t("mob.pw.show")}
              hideLabel={t("mob.pw.hide")}
            />
            {error ? (
              <AppText variant="muted" color={tokens.danger}>
                {t(error)}
              </AppText>
            ) : null}
            <Button
              title={t("child.login")}
              variant="gradient"
              pending={pending}
              pendingTitle={t("parent.auth.submitting")}
              onPress={() => void submitChild()}
            />
          </Card>
        )}

        {/* The one non-auth affordance: parent registration. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("nav.register")}
          onPress={() => router.push("/(public)/register")}
          hitSlop={8}
          style={{ alignItems: "center", minHeight: 44, justifyContent: "center" }}
        >
          <AppText variant="label" color={tokens.accent}>
            {t("nav.register")}
          </AppText>
        </Pressable>

        {/* Privacy policy — the ONLY other link this screen carries, and it is
            here for a compliance reason rather than a product one. Apple
            5.1.4(b) expects the children's privacy policy to be reachable in
            the app, and a store reviewer checks that BEFORE creating an
            account: everything else in OlympIQ is behind a login, the account
            sheet does not exist while signed out, and this is the signed-out
            stack's root. Styled as a legal footnote (muted, below the register
            CTA) so it stays subordinate to the auth flow the owner's
            "minimal auth surfaces" rule protects. Opens IN-APP. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t("nav.privacy")}
          onPress={() => router.push("/(public)/privacy")}
          hitSlop={8}
          style={{
            alignItems: "center",
            minHeight: 44,
            justifyContent: "center",
            // Pulls back half of the column's xl gap so the two links read as
            // one footer cluster rather than two unrelated CTAs. Both keep
            // their full 44pt target — only the space between them shrinks.
            marginTop: -spacing.md,
          }}
        >
          <AppText variant="muted">{t("nav.privacy")}</AppText>
        </Pressable>
      </View>
    </Screen>
  );
}
