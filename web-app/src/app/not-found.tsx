import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="container">
      <h1>{t("notFound.title")}</h1>
      <p className="muted">{t("notFound.desc")}</p>
      <Link href="/">{t("action.goHome")}</Link>
    </div>
  );
}
