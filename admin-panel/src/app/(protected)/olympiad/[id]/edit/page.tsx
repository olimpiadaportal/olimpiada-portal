import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { OlympiadForm } from "@/components/OlympiadForm";
import { OlympiadBulkImport } from "@/components/OlympiadBulkImport";
import { OlympiadCoverUploader } from "@/components/OlympiadCoverUploader";
import { archiveOlympiadPackage } from "@/lib/admin/olympiad";

const FORM_KEYS = [
  "oly2.subject", "oly2.grade", "oly2.price", "oly2.statusLabel",
  "oly2.status.active", "oly2.status.inactive", "oly2.status.archived",
  "oly2.title", "oly2.desc", "manage.select", "manage.saving",
  "oly2.err.subject", "oly2.err.titleAz",
  "oly2.eventAt", "oly2.eventAtHint", "oly2.eventClear",
];
const BULK_KEYS = [
  "olybulk.note", "bulk.fileLabel", "bulk.fileHint", "bulk.template",
  "bulk.submit", "bulk.submitting", "bulk.pickFile", "bulk.invalidJson",
  "bulk.notArray", "bulk.tooLarge", "bulk.resultTitle", "bulk.total",
  "bulk.successful", "bulk.failed", "bulk.noErrors", "bulk.row",
];

export default async function EditOlympiadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();

  const { data: pkg } = await supabase
    .from("olympiad_packages")
    .select("id, subject_id, grade_id, price_amount, status, event_starts_at, cover_media_id")
    .eq("id", id)
    .maybeSingle();
  if (!pkg) notFound();

  // Resolve the current cover image (if any) to a public URL for preview.
  let currentCover: { url: string; mime: string } | null = null;
  if ((pkg as any).cover_media_id) {
    const { data: m } = await supabase
      .from("media_assets")
      .select("bucket, path, mime_type")
      .eq("id", (pkg as any).cover_media_id)
      .maybeSingle();
    if (m) {
      const { data: pub } = supabase.storage.from(m.bucket).getPublicUrl(m.path);
      currentCover = { url: pub.publicUrl, mime: m.mime_type ?? "" };
    }
  }

  const { data: trs } = await supabase
    .from("olympiad_package_translations")
    .select("locale, title, description")
    .eq("olympiad_package_id", id);
  const tr: Record<string, { title: string; desc: string }> = {};
  for (const x of (trs ?? []) as any[]) tr[x.locale] = { title: x.title, desc: x.description ?? "" };

  const [{ data: subjects }, { data: grades }, { count: poolCount }] =
    await Promise.all([
      supabase.from("subjects").select("id, name").order("name"),
      supabase.from("grades").select("id, name, level").order("level"),
      // PRIVATE pool size: questions owned by THIS package only.
      supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("olympiad_package_id", id),
    ]);

  const formDict: Record<string, string> = {};
  for (const k of FORM_KEYS) formDict[k] = t(k);
  const bulkDict: Record<string, string> = {};
  for (const k of BULK_KEYS) bulkDict[k] = t(k);

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("nav.olympiad")}</h1>
            <p className="muted">{tr.az?.title ?? ""}</p>
          </div>
          <Link className="btn-ghost" href="/olympiad">{t("manage.back")}</Link>
        </div>
      </div>
      <section className="card">
        <OlympiadForm
          dict={formDict}
          id={(pkg as any).id}
          subjects={((subjects ?? []) as any[]).map((s) => ({ value: s.id, label: s.name }))}
          grades={((grades ?? []) as any[]).map((g) => ({ value: g.id, label: g.name }))}
          defaults={{
            subject_id: (pkg as any).subject_id,
            grade_id: (pkg as any).grade_id ?? "",
            price: String((pkg as any).price_amount ?? 0),
            status: (pkg as any).status,
            event: (pkg as any).event_starts_at ?? "",
            tr,
          }}
          submitLabel={t("manage.save")}
        />
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <OlympiadCoverUploader
          packageId={(pkg as any).id}
          current={currentCover}
          strings={{
            title: t("oly2.cover.title"),
            upload: t("oly2.cover.upload"),
            uploading: t("oly2.cover.uploading"),
            remove: t("oly2.cover.remove"),
            none: t("oly2.cover.none"),
            hint: t("oly2.cover.hint"),
          }}
        />
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <h3>{t("oly2.pool")}</h3>
        <p className="muted">
          {t("olybulk.count")}: <b>{poolCount ?? 0}</b>
        </p>
        <OlympiadBulkImport packageId={(pkg as any).id} dict={bulkDict} />
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <form action={archiveOlympiadPackage}>
          <input type="hidden" name="__id" value={(pkg as any).id} />
          <button className="link-danger" type="submit">{t("oly2.archive")}</button>
        </form>
      </section>
    </div>
  );
}
