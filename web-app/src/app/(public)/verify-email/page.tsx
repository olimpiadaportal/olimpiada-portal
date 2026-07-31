import Link from "next/link";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/BackLink";
import { ResendConfirmationForm } from "@/components/ResendConfirmationForm";

// The page never learns WHICH address just registered, and that is deliberate.
// The user this feature exists for is the one whose mail never arrived — they
// come back later, from a bookmark, a second device, or the login screen's
// "verify your email" error, so any address handoff (query string, cookie)
// would be missing exactly when it is needed and would still require this form
// as its fallback. Re-typing also composes with the non-enumeration rule: the
// server refuses to say whether the address exists, so asking for it leaks
// nothing. Same shape as /forgot-password.
//
// `?sent=1` is the ONLY thing registration hands over: a content-free flag (no
// address, nothing to leak through history/logs/Referer) meaning "a
// confirmation mail went out this instant", which arms the resend cooldown so
// the first tap cannot claim success for a mail GoTrue would refuse to send.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const t = await getT();
  const { sent } = await searchParams;
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
      <p>{t("verify.body")}</p>
      <p className="muted">{t("verify.hint")}</p>
      <p className="muted" style={{ marginTop: 18 }}>
        {t("verify.resendPrompt")}
      </p>
      <ResendConfirmationForm dict={dict} justSent={sent === "1"} />
      <p style={{ marginTop: 14 }}>
        <Link className="btn-ghost" href="/login">
          {t("nav.login")}
        </Link>
      </p>
    </section>
  );
}
