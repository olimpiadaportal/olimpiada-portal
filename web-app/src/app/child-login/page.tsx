import { getT } from "@/i18n/server";
import { ArenaLogin } from "@/components/ArenaLogin";

const KEYS = [
  "child.id", "child.password", "child.login", "child.loggingIn",
  "parent.auth.email", "parent.auth.password", "parent.auth.login",
  "parent.auth.submitting", "parent.auth.noAccount", "nav.register",
  "auth.tab.student", "auth.tab.parent", "auth.brandTagline",
  "auth.child.err.idFormat", "auth.child.err.passwordRequired",
  "auth.child.err.invalidCredentials", "auth.child.err.locked",
  "parent.err.email", "parent.err.password", "parent.err.required",
  "parent.err.invalid",
  "parent.auth.emailPh", "parent.auth.passwordPh",
  "auth.showPassword", "auth.hidePassword",
];

// Student-first entry: opens on the Şagird (Student) tab. The Valideyn (Parent)
// tab is available too. No Center/Admin tab (admin is a separate panel).
export default async function ChildLoginPage() {
  const t = await getT();
  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;600;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap"
        rel="stylesheet"
      />
      <div className="arena arena-auth">
        <div className="arena-auth-brandside">
          <span className="arena-brand" style={{ fontSize: "1.4rem" }}>
            {t("arena.brand")}
          </span>
          <h1>{t("child.loginTitle")}</h1>
          <p className="arena-muted">{t("auth.brandTagline")}</p>
        </div>
        <div className="arena-auth-formside">
          <ArenaLogin dict={dict} defaultTab="student" />
        </div>
      </div>
    </>
  );
}
