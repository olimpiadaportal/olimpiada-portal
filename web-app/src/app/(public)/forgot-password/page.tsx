import Link from "next/link";
import { getT } from "@/i18n/server";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const t = await getT();
  const { sent } = await searchParams;
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
      <h1>{t("forgot.title")}</h1>
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
