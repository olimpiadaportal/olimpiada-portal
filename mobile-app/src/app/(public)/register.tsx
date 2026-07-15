// Parent registration (web /register parity): first/last name, email,
// password, MANDATORY E.164 phone. Runs through the BFF, which enforces the
// exact same validation + rate limits as the web action. When the Supabase
// project requires email confirmation the BFF returns verify_email instead of
// tokens and this screen shows the check-your-inbox notice (restyled as a
// success card per plan §3). Card-grouped fields + gradient CTA.
import React, { useState } from "react";
import { View } from "react-native";
import { MailCheck } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { BrandMark } from "@/components/BrandMark";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { PasswordField, TextField } from "@/components/TextField";
import { PhoneField, E164_RE } from "@/components/PhoneField";
import { Card } from "@/components/Card";
import { radius, spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/features/auth/authStore";

export default function Register() {
  const { t } = useT();
  const { tokens } = useTheme();
  const registerParent = useAuthStore((s) => s.registerParent);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifySent, setVerifySent] = useState(false);

  async function submit() {
    // Client-side mirrors of the server rules — UX only, the BFF re-validates.
    if (!firstName.trim() || !lastName.trim()) return setError(t("parent.err.required"));
    if (!email.trim()) return setError(t("parent.err.email"));
    if (!E164_RE.test(phone)) return setError(t("parent.err.phone"));
    if (password.length < 8) return setError(t("parent.err.password"));

    setPending(true);
    setError(null);
    const res = await registerParent({ firstName, lastName, email, password, phone });
    setPending(false);
    if (res.error) return setError(t(res.error));
    if (res.verifyEmail) setVerifySent(true);
    // Tokens case: the (public) layout redirects into the parent tabs.
  }

  if (verifySent) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: spacing.xl }}>
          <Card variant="hero" style={{ alignItems: "center", gap: spacing.md }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.md,
                backgroundColor: tokens.chipBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MailCheck size={30} color={tokens.ok} strokeWidth={2} />
            </View>
            <AppText variant="title" style={{ textAlign: "center" }}>
              {t("verify.title")}
            </AppText>
            <AppText variant="muted" style={{ textAlign: "center" }}>
              {t("verify.body")}
            </AppText>
            <AppText variant="muted" style={{ textAlign: "center" }}>
              {t("verify.hint")}
            </AppText>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg, paddingTop: spacing.xl }}>
        <View style={{ alignItems: "center", gap: spacing.md }}>
          <BrandMark size={56} />
          <AppText variant="title">{t("parent.auth.register")}</AppText>
          <AppText variant="muted" style={{ textAlign: "center" }}>
            {t("parent.auth.registerNote")}
          </AppText>
        </View>
        <Card style={{ gap: spacing.lg }}>
          <TextField
            label={t("parent.auth.firstName")}
            placeholder={t("parent.auth.firstNamePh")}
            value={firstName}
            onChangeText={setFirstName}
            autoComplete="given-name"
            textContentType="givenName"
          />
          <TextField
            label={t("parent.auth.lastName")}
            placeholder={t("parent.auth.lastNamePh")}
            value={lastName}
            onChangeText={setLastName}
            autoComplete="family-name"
            textContentType="familyName"
          />
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
          <PhoneField
            label={t("parent.auth.phone")}
            searchPlaceholder={t("parent.auth.phoneSearch")}
            closeLabel={t("drawer.close")}
            onChangeE164={setPhone}
          />
          <PasswordField
            label={t("parent.auth.password")}
            placeholder={t("parent.auth.passwordPh")}
            value={password}
            onChangeText={setPassword}
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
            title={t("parent.auth.register")}
            variant="gradient"
            pending={pending}
            pendingTitle={t("parent.auth.submitting")}
            onPress={() => void submit()}
          />
        </Card>
      </View>
    </Screen>
  );
}
