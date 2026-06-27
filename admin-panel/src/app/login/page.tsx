import { getT } from "@/i18n/server";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const t = await getT();

  return (
    <div className="login-wrap">
      <div className="auth-card">
        <div className="brand-row">
          <span className="brand-dot" aria-hidden /> Olimpiada{" "}
          <span className="brand-sub">Admin</span>
        </div>
        <h1>{t("login.title")}</h1>
        <p className="muted">{t("login.subtitle")}</p>

        <LoginForm
          strings={{
            email: t("field.email"),
            password: t("field.password"),
            submit: t("login.submit"),
            submitting: t("login.submitting"),
          }}
        />
      </div>
    </div>
  );
}
