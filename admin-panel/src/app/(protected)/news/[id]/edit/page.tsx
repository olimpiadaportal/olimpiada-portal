import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { NewsForm } from "@/components/NewsForm";
import { NewsLifecycle } from "@/components/NewsLifecycle";
import { NewsCoverUploader } from "@/components/NewsCoverUploader";

const FORM_ID = "news-form";

const FORM_KEYS = [
  "news.field.slug", "news.slugHint", "news.localesNote",
  "news.field.title", "news.field.body", "manage.saving",
];
const LIFE_KEYS = [
  "news.act.publish", "news.act.unpublish", "news.act.archive",
  "news.act.delete", "news.act.confirmDelete",
];

export default async function EditNewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();

  const { data: n } = await supabase
    .from("news")
    .select("id, slug, status, cover_media_id")
    .eq("id", id)
    .maybeSingle();
  if (!n) notFound();

  // Resolve the current cover image (if any) to a public URL for preview.
  let currentCover: { url: string; mime: string } | null = null;
  if (n.cover_media_id) {
    const { data: m } = await supabase
      .from("media_assets")
      .select("bucket, path, mime_type")
      .eq("id", n.cover_media_id)
      .maybeSingle();
    if (m) {
      const { data: pub } = supabase.storage.from(m.bucket).getPublicUrl(m.path);
      currentCover = { url: pub.publicUrl, mime: m.mime_type ?? "" };
    }
  }

  const { data: trs } = await supabase
    .from("news_translations")
    .select("locale, title, body")
    .eq("news_id", id);
  const translations: Record<string, { title: string; body: string }> = {};
  for (const tr of (trs ?? []) as any[]) {
    translations[tr.locale] = { title: tr.title, body: tr.body };
  }

  const dict: Record<string, string> = {};
  for (const k of FORM_KEYS) dict[k] = t(k);
  const lifeDict: Record<string, string> = {};
  for (const k of LIFE_KEYS) lifeDict[k] = t(k);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("nav.news")}</h1>
            <p className="muted">
              {t("news.statusLabel")}: {t(`news.status.${n.status}`)}
            </p>
          </div>
          <Link className="btn-ghost" href="/news">
            {t("manage.back")}
          </Link>
        </div>
      </div>

      {/* Primary actions live in a sticky toolbar at the TOP of the edit page.
          Save submits the form below via the `form="…"` association; the
          lifecycle actions (publish/unpublish/archive/delete) sit beside it. */}
      <div
        className="card"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button className="btn" type="submit" form={FORM_ID}>
          {t("manage.save")}
        </button>
        <NewsLifecycle id={n.id} status={n.status} dict={lifeDict} />
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <NewsForm
          dict={dict}
          id={n.id}
          formId={FORM_ID}
          hideSubmit
          defaults={{ slug: n.slug, translations }}
          submitLabel={t("manage.save")}
        />
      </section>

      <section className="card" style={{ marginTop: 16 }}>
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
    </div>
  );
}
