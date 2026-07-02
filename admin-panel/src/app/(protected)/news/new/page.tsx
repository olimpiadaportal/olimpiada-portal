import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { NewsForm } from "@/components/NewsForm";
import { NewsCoverUploader } from "@/components/NewsCoverUploader";

const FORM_KEYS = [
  "news.field.slug", "news.slugHint", "news.localesNote",
  "news.field.title", "news.field.body", "manage.saving",
];

export default async function NewNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  await requireAdmin();
  const t = await getT();
  const { created } = await searchParams;

  const dict: Record<string, string> = {};
  for (const k of FORM_KEYS) dict[k] = t(k);

  // Two-part "one form with image at the end" flow. Step 1: fill the create form
  // (saveNews creates a draft and redirects back here with ?created=<id>).
  // Step 2: the featured-image uploader appears for that new article, then a
  // Continue link hands off to the full edit page.
  if (created) {
    const supabase = await createClient();
    const { data: n } = await supabase
      .from("news")
      .select("id, cover_media_id")
      .eq("id", created)
      .maybeSingle();

    if (n) {
      // Resolve the current cover (if the admin already uploaded one) for preview.
      let currentCover: { url: string; mime: string } | null = null;
      if (n.cover_media_id) {
        const { data: m } = await supabase
          .from("media_assets")
          .select("bucket, path, mime_type")
          .eq("id", n.cover_media_id)
          .maybeSingle();
        if (m) {
          const { data: pub } = supabase.storage
            .from(m.bucket)
            .getPublicUrl(m.path);
          currentCover = { url: pub.publicUrl, mime: m.mime_type ?? "" };
        }
      }

      return (
        <div className="page">
          <div className="page-head">
            <div className="head-row">
              <div>
                <h1>{t("news.created.title")}</h1>
                <p className="muted">{t("news.created.hint")}</p>
              </div>
              <Link className="btn-ghost" href="/news">
                {t("manage.back")}
              </Link>
            </div>
          </div>

          <section className="card">
            <NewsCoverUploader
              newsId={n.id}
              current={currentCover}
              strings={{
                title: t("news.cover.title"),
                upload: t("news.cover.upload"),
                uploading: t("news.cover.uploading"),
                remove: t("news.cover.remove"),
                none: t("news.cover.none"),
                hint: t("news.cover.hint"),
              }}
            />
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <Link className="btn" href={`/news/${n.id}/edit`}>
              {t("news.created.continue")}
            </Link>
          </section>
        </div>
      );
    }
    // Unknown id → fall through to a fresh create form.
  }

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
        <NewsForm dict={dict} submitLabel={t("manage.add")} afterCreateStay />
      </section>
    </div>
  );
}
