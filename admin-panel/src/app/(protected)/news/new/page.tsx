import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { NewsForm } from "@/components/NewsForm";

const FORM_KEYS = [
  "news.field.slug", "news.slugHint", "news.localesNote",
  "news.field.title", "news.field.body", "manage.saving",
];

// One-submission create (Round 20): the cover image is picked INSIDE the
// create form (optional, same validation as the edit page's uploader). On
// submit the article is created, the image — if any — is uploaded + attached
// through the same hardened attach action, and the form continues to the edit
// page. The old two-step ?created=<id> flow is retired.
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
        <NewsForm
          dict={dict}
          submitLabel={t("manage.add")}
          cover={{
            strings: {
              title: t("news.cover.title"),
              upload: t("news.cover.upload"),
              uploading: t("news.cover.uploading"),
              remove: t("news.cover.remove"),
              none: t("news.cover.none"),
              hint: t("news.cover.hint"),
              continueEdit: t("news.created.continue"),
            },
          }}
        />
      </section>
    </div>
  );
}
