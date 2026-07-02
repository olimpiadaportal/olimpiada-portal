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

// Unified login with two user-type tabs: Şagird (Student) and Valideyn (Parent)
// ONLY — no Center/Admin tab. Both tabs route to the existing server actions.
// Opens on the Parent tab here (the public entry); Student is one tap away.
export default async function LoginPage() {
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
      <div
        className="arena"
        style={{
          minHeight: 0,
          background: "transparent",
          maxWidth: 420,
          margin: "8px auto 0",
        }}
      >
        <p className="arena-eyebrow">{t("arena.brand")}</p>
        <h1 style={{ marginBottom: 20 }}>{t("login.title")}</h1>
        <ArenaLogin dict={dict} defaultTab="parent" />
      </div>
    </>
  );
}
