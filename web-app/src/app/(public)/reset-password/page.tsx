import Link from "next/link";
import { getT } from "@/i18n/server";
import { getParent } from "@/lib/auth/session";
import { BackLink } from "@/components/BackLink";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage() {
  const t = await getT();
  // The form only works inside the session a reset link creates. Without one
  // (opened directly, or the session has lapsed) it used to render anyway and
  // every submit failed with a generic error — explain instead, and offer the
  // one action that helps.
  const parent = await getParent();
  if (!parent) {
    return (
      <section className="prose" style={{ maxWidth: 440 }}>
        <BackLink label={t("nav.back")} fallbackHref="/login" />
        <h1>{t("reset.title")}</h1>
        <p className="muted">{t("reset.noSession")}</p>
        <p style={{ marginTop: 16 }}>
          <Link className="btn" href="/forgot-password">
            {t("reset.requestNew")}
          </Link>
        </p>
      </section>
    );
  }
  const dict: Record<string, string> = {};
  for (const k of [
    "reset.newPassword",
    "reset.submit",
    "parent.auth.submitting",
    "parent.err.password",
    "parent.err.passwordWeak",
    "parent.err.tooMany",
    "parent.err.invalid",
    "parent.auth.passwordPh",
    "auth.showPassword",
    "auth.hidePassword",
  ])
    dict[k] = t(k);

  return (
    <section className="prose" style={{ maxWidth: 440 }}>
      <BackLink label={t("nav.back")} fallbackHref="/login" />
      <h1>{t("reset.title")}</h1>
      <p className="muted">{t("reset.hint")}</p>
      <ResetPasswordForm dict={dict} />
    </section>
  );
}
