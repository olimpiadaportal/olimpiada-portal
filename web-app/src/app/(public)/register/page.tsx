import Link from "next/link";
import { getT, getLocale } from "@/i18n/server";
import { ParentAuthForm } from "@/components/ParentAuthForm";

const KEYS = [
  "parent.auth.firstName", "parent.auth.lastName",
  "parent.auth.email", "parent.auth.password",
  "parent.auth.phone", "parent.auth.phonePh", "parent.auth.phoneCountry",
  "parent.auth.phoneSearch",
  "parent.auth.login", "parent.auth.register", "parent.auth.submitting",
  "parent.err.email", "parent.err.password", "parent.err.required",
  "parent.err.phone",
  "parent.err.invalid", "parent.err.createFailed", "parent.err.emailExists",
  "parent.auth.firstNamePh", "parent.auth.lastNamePh",
  "parent.auth.emailPh", "parent.auth.passwordPh",
  "auth.showPassword", "auth.hidePassword",
];

export default async function RegisterPage() {
  const t = await getT();
  const locale = await getLocale();
  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);
  return (
    <section className="prose" style={{ maxWidth: 440 }}>
      <p className="section-eyebrow">{t("app.brand")}</p>
      <h1>{t("register.title")}</h1>
      <p className="muted">{t("parent.auth.registerNote")}</p>
      <ParentAuthForm mode="register" dict={dict} locale={locale} />
      <p className="muted" style={{ marginTop: 18 }}>
        {t("parent.auth.haveAccount")} <Link href="/login">{t("nav.login")}</Link>
      </p>
    </section>
  );
}
