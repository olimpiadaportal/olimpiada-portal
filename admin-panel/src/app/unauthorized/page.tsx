import Link from "next/link";
import { getT } from "@/i18n/server";

// Shown when a signed-in user lacks access (e.g., a Content Manager hitting an
// admin-only route). Access is enforced server-side by the guards, not by hiding.
export default async function UnauthorizedPage() {
  const t = await getT();
  return (
    <div className="standalone">
      <h1>{t("unauthorized.title")}</h1>
      <p className="muted">{t("unauthorized.desc")}</p>
      <Link href="/login">{t("action.signInDifferent")}</Link>
    </div>
  );
}
