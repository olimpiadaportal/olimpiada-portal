import { getT } from "@/i18n/server";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ timeout?: string }>;
}) {
  const t = await getT();
  const { timeout } = await searchParams;

  return (
    <div className="login-wrap">
      <div className="auth-card">
        <div className="brand-row">
          <span className="brand-dot" aria-hidden /> OlimpIQ{" "}
          <span className="brand-sub">Admin</span>
        </div>
        <h1>{t("login.title")}</h1>
        <p className="muted">{t("login.subtitle")}</p>

        {/* Set by the middleware after a server-enforced 30-minute idle logout. */}
        {timeout === "1" && (
          <p className="form-error" role="status">
            {t("login.timeout")}
          </p>
        )}

        <LoginForm
          strings={{
            email: t("field.email"),
            password: t("field.password"),
            submit: t("login.submit"),
            submitting: t("login.submitting"),
            showPassword: t("auth.showPassword"),
            hidePassword: t("auth.hidePassword"),
          }}
        />
      </div>
    </div>
  );
}
