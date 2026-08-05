import Link from "next/link";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/BackLink";
import { ResendConfirmationForm } from "@/components/ResendConfirmationForm";
import { getPendingVerifyEmail } from "@/lib/auth/pendingVerifyEmail";

// The address is carried here in a short-lived httpOnly cookie set by
// registerParent (lib/auth/pendingVerifyEmail.ts) — NOT in the URL, which would
// write a real person's email into history, logs and every Referer header.
//
// When it is present the page resends silently: the user just typed that
// address, and asking for it again reads like the app forgot. When it is absent
// — a bookmark opened days later, a second device, the login screen's "verify
// your email" error, or simply an expired cookie — the form falls back to
// asking. That fallback is not optional: without it the exact user this feature
// exists for, the one whose mail never arrived and who came back later, would
// have no way to trigger a resend at all.
//
// Asking leaks nothing either way: the resend endpoint refuses to say whether an
// address exists. Same shape as /forgot-password.
//
// `?sent=1` remains a content-free flag meaning "a confirmation mail went out
// this instant", which arms the resend cooldown so the first tap cannot claim
// success for a mail GoTrue would refuse to send inside its minimum interval.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const t = await getT();
  const { sent } = await searchParams;
  const pendingEmail = await getPendingVerifyEmail();
  const dict: Record<string, string> = {};
  for (const k of [
    "parent.auth.email",
    "parent.auth.emailPh",
    "parent.auth.submitting",
    "verify.resend",
    "verify.resent",
  ])
    dict[k] = t(k);

  return (
    <section className="prose" style={{ maxWidth: 460 }}>
      <BackLink label={t("nav.back")} fallbackHref="/login" />
      <h1>{t("verify.title")}</h1>
      {/* Naming the inbox turns "check your email" into something the user can
          act on — it is also how they notice a typo in the address they just
          typed, which is the commonest reason the mail "never arrives". */}
      {pendingEmail ? (
        <p>
          {t("verify.bodyTo")} <strong>{pendingEmail}</strong>
        </p>
      ) : (
        <p>{t("verify.body")}</p>
      )}
      <p className="muted">{t("verify.hint")}</p>
      <p className="muted" style={{ marginTop: 18 }}>
        {t("verify.resendPrompt")}
      </p>
      <ResendConfirmationForm
        dict={dict}
        justSent={sent === "1"}
        knownEmail={pendingEmail}
      />
      <p style={{ marginTop: 14 }}>
        <Link className="btn-ghost" href="/login">
          {t("nav.login")}
        </Link>
      </p>
    </section>
  );
}
