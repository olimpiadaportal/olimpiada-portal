import Link from "next/link";
import { getT } from "@/i18n/server";
import { BackLink } from "@/components/BackLink";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; link?: string }>;
}) {
  const t = await getT();
  const { sent, link } = await searchParams;
  // A reset link that could not be redeemed lands here (lib/auth/confirmEmail
  // linkFailurePath). Whitelisted: only these two values render anything.
  const linkState = link === "expired" || link === "invalid" ? link : null;
  const dict: Record<string, string> = {};
  for (const k of [
    "parent.auth.email",
    "parent.auth.submitting",
    "forgot.submit",
    "parent.err.email",
    "parent.auth.emailPh",
  ])
    dict[k] = t(k);

  return (
    <section className="prose" style={{ maxWidth: 440 }}>
      <BackLink label={t("nav.back")} fallbackHref="/login" />
      <h1>{t("forgot.title")}</h1>
      {linkState && !sent && (
        <div className="auth-note" role="alert">
          <p style={{ margin: 0 }}>
            {t(linkState === "expired" ? "forgot.linkExpired" : "forgot.linkInvalid")}
          </p>
        </div>
      )}
      {sent ? (
        <p>{t("forgot.sent")}</p>
      ) : (
        <>
          <p className="muted">{t("forgot.hint")}</p>
          <ForgotPasswordForm dict={dict} />
        </>
      )}
      <p className="muted" style={{ marginTop: 14 }}>
        <Link href="/login">{t("nav.login")}</Link>
      </p>
    </section>
  );
}
