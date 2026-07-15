import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getT, getLocale } from "@/i18n/server";
import { OlympiadForm } from "@/components/OlympiadForm";
import { OlympiadCoverUploader } from "@/components/OlympiadCoverUploader";
import {
  OlympiadQuestionManager,
  type OlympiadPoolRow,
} from "@/components/OlympiadQuestionManager";
import { archiveOlympiadPackage } from "@/lib/admin/olympiad";
import { olympiadLocalStrings } from "@/lib/admin/olympiad-strings";
import { localDict } from "../../labels";

const FORM_KEYS = [
  "oly2.subject", "oly2.grade", "oly2.price", "oly2.statusLabel",
  "oly2.status.active", "oly2.status.inactive", "oly2.status.archived",
  "oly2.title", "oly2.desc", "manage.select", "manage.saving",
  "oly2.err.subject", "oly2.err.titleAz",
  "oly2.eventAt", "oly2.eventAtHint", "oly2.eventClear",
  "oly2.duration", "oly2.durationHelp",
];

// NOTE (Round 20): BULK upload is CREATION-ONLY — the bulk-upload section
// (button + modal) was removed from this edit page and the DB RPC rejects
// imports into a package that already has questions.
// Round 21 item 2: AFTER creation the pool is managed question by question
// below (add/edit/archive/delete via OlympiadQuestionManager). Attempts
// include ALL of a package's published questions (questions_per_attempt is
// legacy/display-only); the count shown is the real pool row count.
export default async function EditOlympiadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const t = await getT();
  const lt = olympiadLocalStrings(await getLocale());
  const supabase = await createClient();

  const { data: pkg } = await supabase
    .from("olympiad_packages")
    .select("id, subject_id, grade_id, price_amount, status, event_starts_at, duration_minutes, cover_media_id")
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

  const [{ data: subjects }, { data: grades }, { data: poolQuestions }, { data: topicRows }] =
    await Promise.all([
      supabase.from("subjects").select("id, name").order("name"),
      supabase.from("grades").select("id, name, level").order("level"),
      // PRIVATE pool: questions owned by THIS package only, with what the
      // list needs (az/primary body excerpt, option count, image flag).
      supabase
        .from("questions")
        .select(
          "id, status, primary_locale, updated_at, question_translations(locale, body, media_asset_id), answer_options(count)",
        )
        .eq("olympiad_package_id", id)
        .order("created_at", { ascending: true }),
      // Optional taxonomy for the editor: OLYMPIAD-scoped topics of the
      // package's subject (module separation — never exam topics).
      supabase
        .from("topics")
        .select("id, grade_id, name")
        .eq("scope", "olympiad")
        .eq("subject_id", (pkg as any).subject_id)
        .order("name"),
    ]);

  // Topics without a grade match any grade; grade-bound topics must match the
  // package's grade.
  const pkgGradeId = (pkg as any).grade_id ?? null;
  const poolTopics = ((topicRows ?? []) as any[])
    .filter((tp) => tp.grade_id == null || pkgGradeId == null || tp.grade_id === pkgGradeId)
    .map((tp) => ({ id: String(tp.id), name: String(tp.name) }));
  let poolSubtopics: { id: string; topic_id: string; name: string }[] = [];
  if (poolTopics.length > 0) {
    const { data: subRows } = await supabase
      .from("subtopics")
      .select("id, topic_id, name")
      .in("topic_id", poolTopics.map((tp) => tp.id))
      .order("name");
    poolSubtopics = ((subRows ?? []) as any[]).map((st) => ({
      id: String(st.id),
      topic_id: String(st.topic_id),
      name: String(st.name),
    }));
  }

  // Pre-shaped list rows (small payload; the edit modal loads the full
  // trilingual question on demand).
  const poolRows: OlympiadPoolRow[] = ((poolQuestions ?? []) as any[]).map((q, i) => {
    const trs = (q.question_translations ?? []) as {
      locale: string;
      body: string | null;
      media_asset_id: string | null;
    }[];
    const body =
      trs.find((x) => x.locale === "az")?.body ??
      trs.find((x) => x.locale === q.primary_locale)?.body ??
      trs[0]?.body ??
      "";
    return {
      id: String(q.id),
      num: i + 1,
      excerpt: body.length > 90 ? `${body.slice(0, 90)}…` : body,
      search: trs
        .map((x) => (x.body ?? "").slice(0, 500))
        .join(" ")
        .toLowerCase(),
      optionCount: Number(q.answer_options?.[0]?.count ?? 0),
      hasImage: trs.some((x) => x.media_asset_id),
      status: String(q.status),
      updatedAt: String(q.updated_at ?? "").slice(0, 10),
    };
  });
  const subjectName =
    ((subjects ?? []) as any[]).find((s) => s.id === (pkg as any).subject_id)?.name ?? "";
  const gradeName =
    ((grades ?? []) as any[]).find((g) => g.id === pkgGradeId)?.name ?? "";
  const poolDict = localDict(await getLocale());

  const formDict: Record<string, string> = {};
  for (const k of FORM_KEYS) formDict[k] = t(k);

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
            duration: String((pkg as any).duration_minutes ?? 25),
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
          {t("olybulk.count")}: <b>{poolRows.length}</b>
        </p>
        {/* Attempts use the FULL published pool; bulk upload is creation-only,
            but individual questions are managed right here (Round 21). */}
        <p className="hint">{lt("oly2.allQuestionsNote")}</p>
        <p className="hint">{poolDict["olyq.manageNote"]}</p>
        <p className="hint">{poolDict["olyq.archivedNote"]}</p>
        <OlympiadQuestionManager
          dict={poolDict}
          packageId={(pkg as any).id}
          subjectName={subjectName}
          gradeName={gradeName}
          topics={poolTopics}
          subtopics={poolSubtopics}
          rows={poolRows}
        />
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
