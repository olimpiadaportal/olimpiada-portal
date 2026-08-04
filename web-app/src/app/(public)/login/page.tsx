import { getT } from "@/i18n/server";
import { ArenaLogin } from "@/components/ArenaLogin";
import { BackLink } from "@/components/BackLink";

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
// Opens on the Parent tab by default; `?tab=student` (whitelisted server-side)
// opens the Student tab — this replaced the retired standalone /child-login page.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; verify?: string }>;
}) {
  const { tab, verify } = await searchParams;
  // Whitelist: only the exact value "student" flips the initial tab; anything
  // else (missing, garbage, arrays) falls back to the parent tab.
  const defaultTab: "student" | "parent" = tab === "student" ? "student" : "parent";
  // Outcome of an email-confirmation link (/auth/confirm, /auth/callback).
  // Until 2026-08-04 those routes redirected here with `?verify=failed` and
  // NOTHING rendered it — a user whose link had expired was dropped on a login
  // form with no explanation and no way to tell a dead link from a typo. Only
  // these three values are honoured; anything else renders nothing.
  const verifyState =
    verify === "failed" || verify === "expired" || verify === "ok" ? verify : null;
  const t = await getT();
  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap"
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
        {/* Round 51 (audit 4.1): mobile auth screens got a Round-45 back
            arrow; the web pages had no back affordance at all. */}
        <BackLink label={t("nav.back")} />
        <p className="arena-eyebrow">{t("arena.brand")}</p>
        <h1 style={{ marginBottom: 20 }}>{t("login.title")}</h1>
        {verifyState && (
          <div
            role="status"
            className={verifyState === "ok" ? "auth-note auth-note-ok" : "auth-note"}
            style={{ marginBottom: 16 }}
          >
            <p style={{ margin: 0 }}>{t(`verify.state.${verifyState}`)}</p>
            {verifyState !== "ok" && (
              // A dead link needs an ACTION, not just an apology.
              <p style={{ margin: "6px 0 0" }}>
                <a href="/verify-email">{t("verify.resend")}</a>
              </p>
            )}
          </div>
        )}
        <ArenaLogin dict={dict} defaultTab={defaultTab} />
      </div>
    </>
  );
}
