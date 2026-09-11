// Parent registration (web /register parity): first/last name, email,
// password, OPTIONAL E.164 phone (Apple 5.1.1(v) — the app may not require
// personal data its core functionality does not need). Runs through the BFF,
// which enforces the exact same validation + rate limits as the web action.
// When the Supabase project requires email confirmation the BFF returns
// verify_email instead of tokens and this screen shows the check-your-inbox
// notice (restyled as a success card per plan §3). Card-grouped fields +
// gradient CTA.
//
// The notice also carries the RESEND control (web /verify-email parity): a
// confirmation mail that never arrives otherwise strands the account for good —
// the parent cannot log in (unconfirmed) and a password reset does not help an
// unconfirmed account. Here the address is already in state, so resending costs
// no typing; on the web the user re-types it. The same control also sits on
// Login behind the "confirm your email" error, for the parent who comes back
// days later — this card is local state and is gone by then.
import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { MailCheck } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { PasswordField, TextField } from "@/components/TextField";
import { PhoneField, E164_RE, usePhoneValue } from "@/components/PhoneField";
import { Card } from "@/components/Card";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ResendConfirmation } from "@/components/ResendConfirmation";
import { radius, spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { useFieldChain } from "@/lib/useFieldChain";
import { backOrTo, popToOrReplace } from "@/lib/navigation";
import { checkNewPassword } from "@/lib/passwordPolicy";
import { useAuthStore } from "@/features/auth/authStore";

export default function Register() {
  const { t } = useT();
  const { tokens } = useTheme();
  const router = useRouter();
  const registerParent = useAuthStore((s) => s.registerParent);

  // Register is always pushed (welcome CTA or the Login link), but a cold deep
  // link can make it the stack root — then Login is the natural place back.
  const goBack = () => backOrTo(router, "/(public)/login");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // The phone is TWO pieces of state, and both live HERE rather than inside
  // PhoneField. Owner bug: typing a number and moving to the password cleared
  // it. State owned by the screen survives anything that remounts the field —
  // and the platform autofill that is the remaining suspect cannot blank it
  // either, because `applyPhoneEdit` refuses a write it did not watch the user
  // make. `phone` stays the composed E.164 string every submit path reads.
  const [phoneValue, setPhoneValue] = usePhoneValue();
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  // The i18n KEY, not the rendered sentence — the language switcher above can
  // change the locale while an error is on screen, and the message has to
  // follow it.
  const [error, setError] = useState<string | null>(null);
  // Normalized address the server rejected as already registered, or null.
  const [rejectedEmail, setRejectedEmail] = useState<string | null>(null);
  const [verifySent, setVerifySent] = useState(false);

  async function submit() {
    // Client-side mirrors of the server rules — UX only, the BFF re-validates.
    if (!firstName.trim() || !lastName.trim()) return setError("parent.err.required");
    if (!email.trim()) return setError("parent.err.email");
    // The phone is OPTIONAL (Apple 5.1.1(v), rejection of 2026-08-31): an empty
    // value passes and is stored as NULL. A number that IS entered still has to
    // be well-formed — the DB constraint would refuse a malformed one anyway.
    // `phone` is "" (not a bare dial code) when the field is empty; see
    // composeE164. Never restore the unconditional test here.
    if (phone && !E164_RE.test(phone)) return setError("parent.err.phone");
    // FEEDBACK ONLY — the BFF re-runs the identical rule and is authoritative.
    // `tooShort` keeps the existing message; the strength dimensions the old
    // length test never covered share the one passwordWeak string.
    const pwProblem = checkNewPassword(password);
    if (pwProblem) {
      return setError(
        pwProblem === "tooShort" ? "parent.err.password" : "parent.err.passwordWeak",
      );
    }

    setPending(true);
    setError(null);
    const res = await registerParent({ firstName, lastName, email, password, phone });
    setPending(false);
    if (res.error) {
      // "Already registered" is the one failure resubmitting cannot fix — the
      // same address is rejected identically every time. Remember it so the
      // button stays blocked until the field actually changes (web parity).
      if (res.error === "parent.err.emailExists") {
        setRejectedEmail(email.trim().toLowerCase());
      }
      return setError(res.error);
    }
    // The card's resend control starts on cooldown: sign-up just triggered the
    // confirmation mail, so GoTrue's per-address window is already running.
    if (res.verifyEmail) setVerifySent(true);
    // Tokens case: the (public) layout redirects into the parent tabs.
  }

  // ONE contiguous run: first → last → e-mail → phone (the composite's national
  // number, the country trigger is a Pressable and never joins a chain) →
  // password. "Done" calls the SAME submit the button calls, and only when the
  // button would be pressable (Button blocks itself while pending).
  // Blocked only while the field still holds the exact address the server
  // rejected; editing it (case/whitespace aside — the server normalizes both)
  // frees the button immediately.
  const emailRejected =
    rejectedEmail !== null && email.trim().toLowerCase() === rejectedEmail;

  const chain = useFieldChain(5, {
    onLast: () => {
      if (!pending) void submit();
    },
  });
  const phoneField = chain.field(3);

  if (verifySent) {
    return (
      // SCROLLS, AND THE ACTION IS PINNED — the same contract as every other
      // screen in this pass (components/actionAreaLayout.ts). This state was a
      // non-scrolling `flex: 1` column that CENTRED a content-sized card, and
      // centring is what made it dangerous: past the window height the overflow
      // is split between the two ends, so the card was clipped at the TOP and
      // the BOTTOM at once with no way to reach either. At 320x568 with the
      // 1.3x font scale AppText allows, the ru strings already exceed the
      // column — and the first thing the user DOES here makes it worse, because
      // a successful Resend inserts verify.resent (~99 ru characters, four
      // lines at 1.3x) directly above the button. The card now gives way and
      // scrolls; Resend cannot move, because it is the only control on the
      // screen and the account is unusable until it is pressed.
      <Screen
        scroll
        actions={<ResendConfirmation email={email.trim()} startOnCooldown />}
      >
        {/* The account now exists pending verification, so back must not
            re-open the submitted form — it leads to Login, where the user
            lands after confirming the email.

            popToOrReplace(), not replace(): Register is USUALLY pushed FROM
            Login, so the stack already holds it and a replace left
            `[…, login, login]` — the first back press then re-rendered the
            same screen and read as a dead tap. POP_TO returns to the login
            route that is already there; when there is none (the welcome CTA
            replaces itself into Register, and a cold /register deep link makes
            it the stack root) it replaces, which is what this line did before
            and is still correct — the submitted form must not stay behind. */}
        <BackButton
          label={t("arena.quizPrev")}
          onPress={() => popToOrReplace(router, "/(public)/login")}
        />
        <View style={{ gap: spacing.xl, paddingTop: spacing.sm }}>
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
            {/* WHICH inbox. The address is the one thing the user cannot check
                from here, and a typo in it is the commonest reason the mail
                "never arrived" — resending to the same typo would not help.
                It is data, not copy, so it needs no string; middle-ellipsis
                keeps the domain readable at 320pt. */}
            <AppText
              variant="label"
              numberOfLines={1}
              ellipsizeMode="middle"
              style={{ textAlign: "center", maxWidth: "100%" }}
            >
              {email.trim()}
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
      <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
        {/* No native header on this screen, so the back arrow + language chip
            ride in the content — in flow, not absolute: the form scrolls under
            a keyboard and a floating chip would sit on top of the fields. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <BackButton label={t("nav.back")} onPress={goBack} />
          <LocaleSwitcher />
        </View>
        <View style={{ alignItems: "center", gap: spacing.md }}>
          <BrandMark size={56} />
          <AppText variant="title">{t("parent.auth.register")}</AppText>
          <AppText variant="muted" style={{ textAlign: "center" }}>
            {t("parent.auth.registerNote")}
          </AppText>
        </View>
        {/* AUTOFILL. Every field states its own hints — an unset field is one
            the platform identifies by heuristic, and a heuristic that guesses
            wrong is what lets an autofill service believe it may rewrite a row
            it never filled. `importantForAutofill="yes"` is the Android half
            (the `autoComplete` hint alone does not enrol the view); iOS reads
            the derived `textContentType`, which is why the password below says
            "new" and its twin on Login says "current" — a manager offers to
            SAVE here and to FILL there. */}
        <Card style={{ gap: spacing.lg }}>
          <TextField
            {...chain.field(0)}
            label={t("parent.auth.firstName")}
            placeholder={t("parent.auth.firstNamePh")}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="given-name"
            textContentType="givenName"
            importantForAutofill="yes"
          />
          <TextField
            {...chain.field(1)}
            label={t("parent.auth.lastName")}
            placeholder={t("parent.auth.lastNamePh")}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="family-name"
            textContentType="familyName"
            importantForAutofill="yes"
          />
          <TextField
            {...chain.field(2)}
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
            importantForAutofill="yes"
          />
          <PhoneField
            label={t("parent.auth.phone")}
            searchPlaceholder={t("parent.auth.phoneSearch")}
            closeLabel={t("drawer.close")}
            value={phoneValue}
            onChange={setPhoneValue}
            onChangeE164={setPhone}
            // The composite exposes only its national-number input to a chain.
            inputRef={phoneField.ref}
            returnKeyType={phoneField.returnKeyType}
            submitBehavior={phoneField.submitBehavior}
            onSubmitEditing={phoneField.onSubmitEditing}
          />
          <PasswordField
            {...chain.field(4)}
            label={t("parent.auth.password")}
            placeholder={t("parent.auth.passwordPh")}
            value={password}
            onChangeText={setPassword}
            showLabel={t("mob.pw.show")}
            hideLabel={t("mob.pw.hide")}
            purpose="new"
          />
          {error ? (
            <AppText variant="muted" color={tokens.danger}>
              {t(error)}
            </AppText>
          ) : null}
          <Button
            title={t("parent.auth.register")}
            variant="gradient"
            pending={pending}
            pendingTitle={t("parent.auth.submitting")}
            disabled={emailRejected}
            onPress={() => void submit()}
          />
        </Card>

        {/* Privacy consent line (web /register parity). Legal notice, not a
            marketing link — the owner's "auth surfaces stay minimal" rule bans
            info/marketing CTAs here, and a data-protection notice at the point
            where a parent creates the family account is the opposite of that.
            The three parts are separate keys and render inline as
            "{Pre} {Link}{Post}", so each language keeps its own word order and
            the sentence wraps naturally at 320pt instead of being three stacked
            fragments. The policy opens IN-APP; nothing here leaves the app. */}
        <AppText
          variant="muted"
          style={{ textAlign: "center", lineHeight: 20 }}
        >
          {t("privacy.consentPre")}{" "}
          <AppText
            variant="label"
            color={tokens.accent}
            accessibilityRole="link"
            onPress={() => router.push("/(public)/privacy")}
            suppressHighlighting
          >
            {t("privacy.consentLink")}
          </AppText>
          {t("privacy.consentPost")}
        </AppText>
      </View>
    </Screen>
  );
}
