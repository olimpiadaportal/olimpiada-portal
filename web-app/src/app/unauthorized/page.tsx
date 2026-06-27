import Link from "next/link";
import { getT } from "@/i18n/server";

// Shared "unauthorized" state. Route guards in later stages redirect here when a
// user lacks access. Authorization is always enforced server-side / via RLS.
export default async function UnauthorizedPage() {
  const t = await getT();
  return (
    <div className="container">
      <h1>{t("unauthorized.title")}</h1>
      <p className="muted">{t("unauthorized.desc")}</p>
      <Link href="/">{t("action.goHome")}</Link>
    </div>
  );
}
