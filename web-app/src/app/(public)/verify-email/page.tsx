import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function VerifyEmailPage() {
  const t = await getT();
  return (
    <section className="prose" style={{ maxWidth: 460 }}>
      <h1>{t("verify.title")}</h1>
      <p>{t("verify.body")}</p>
      <p className="muted">{t("verify.hint")}</p>
      <p style={{ marginTop: 14 }}>
        <Link className="btn-ghost" href="/login">
          {t("nav.login")}
        </Link>
      </p>
    </section>
  );
}
