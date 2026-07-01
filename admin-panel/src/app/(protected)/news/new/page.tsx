import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { NewsForm } from "@/components/NewsForm";

const FORM_KEYS = [
  "news.field.slug", "news.slugHint", "news.localesNote",
  "news.field.title", "news.field.body", "manage.saving",
];

export default async function NewNewsPage() {
  await requireAdmin();
  const t = await getT();
  const dict: Record<string, string> = {};
  for (const k of FORM_KEYS) dict[k] = t(k);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("news.new")}</h1>
          </div>
          <Link className="btn-ghost" href="/news">
            {t("manage.back")}
          </Link>
        </div>
      </div>
      <section className="card">
        <NewsForm dict={dict} submitLabel={t("manage.add")} />
      </section>
    </div>
  );
}
