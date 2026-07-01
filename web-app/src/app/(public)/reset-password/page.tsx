import { getT } from "@/i18n/server";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage() {
  const t = await getT();
  const dict: Record<string, string> = {};
  for (const k of [
    "reset.newPassword",
    "reset.submit",
    "parent.auth.submitting",
    "parent.err.password",
    "parent.err.invalid",
    "parent.auth.passwordPh",
    "auth.showPassword",
    "auth.hidePassword",
  ])
    dict[k] = t(k);

  return (
    <section className="prose" style={{ maxWidth: 440 }}>
      <h1>{t("reset.title")}</h1>
      <p className="muted">{t("reset.hint")}</p>
      <ResetPasswordForm dict={dict} />
    </section>
  );
}
