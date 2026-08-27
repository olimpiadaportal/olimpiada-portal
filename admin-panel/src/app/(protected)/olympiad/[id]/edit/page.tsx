import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { getDict, getT, getLocale } from "@/i18n/server";
import { OlympiadForm } from "@/components/OlympiadForm";
import { OlympiadCoverUploader } from "@/components/OlympiadCoverUploader";
import { OlympiadGradesManager } from "@/components/OlympiadGradesManager";
import {
  OlympiadQuestionManager,
  type OlympiadPoolRow,
} from "@/components/OlympiadQuestionManager";
import { OlympiadPackageDangerZone } from "@/components/OlympiadPackageDangerZone";
import { olympiadLocalDict, olympiadLocalStrings } from "@/lib/admin/olympiad-strings";
import { PER_ATTEMPT_DEFAULT } from "@/lib/admin/olympiad-per-attempt";
import {
  olympiadLifecycleState,
  lifecyclePillClass,
} from "@/lib/admin/olympiad-lifecycle";
import { formatBakuDateTime } from "@/lib/admin/datetime";
import { mergeLocalDict } from "@/lib/admin/question-flow-labels";
import { localDict } from "../../labels";

const FORM_KEYS = [
  "oly2.subject", "oly2.grade", "oly2.price", "oly2.statusLabel",
  "oly2.status.active", "oly2.status.inactive", "oly2.status.archived",
  "oly2.title", "oly2.desc", "manage.select", "manage.saving",
  "oly2.err.subject", "oly2.err.titleAz",
  "oly2.eventAt", "oly2.eventAtHint", "oly2.eventClear",
  "oly2.duration", "oly2.durationHelp",
];

// NOTE (migration 108, owner 2026-08-11): a target grade's pool is APPENDABLE.
// Bulk upload lives per grade inside Grades & Pools (OlympiadGradeBulkAppend) —
// including the package's OWN grade, which the add-grade form can never offer
// because it is already a target. A row whose content is already in that pool
// is reported and skipped, so re-uploading a file is safe.
// Round 21 item 2: single questions are still managed one by one below
// (add/edit/archive/delete via OlympiadQuestionManager); the count shown is the
// real pool row count.
// Round 49: an attempt serves exactly questions_per_attempt questions, drawn
// per student on a non-repeating cycle over that grade's pool — so the pool
// total and the per-attempt count are two different numbers on this page.
/**
 * The ENTIRE private pool for a package, in creation order.
 *
 * Pages until a short page arrives. A package with more than `FETCH_PAGE`
 * questions used to render silently truncated, which made "select all on
 * screen" select a subset the admin could not see they were missing.
 */
const POOL_FETCH_PAGE = 1000;

async function fetchWholePool(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packageId: string,
) {
  const cols =
    "id, status, grade_id, primary_locale, updated_at, question_translations(locale, body, media_asset_id), answer_options(count)";
  const all: any[] = [];
  for (let from = 0; ; from += POOL_FETCH_PAGE) {
    const { data, error } = await supabase
      .from("questions")
      .select(cols)
      .eq("olympiad_package_id", packageId)
      .order("created_at", { ascending: true })
      .range(from, from + POOL_FETCH_PAGE - 1);
    if (error) return { data: all, error };
    const page = data ?? [];
    all.push(...page);
    if (page.length < POOL_FETCH_PAGE) break;
  }
  return { data: all, error: null };
}

export default async function EditOlympiadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const t = await getT();
  const locale = await getLocale();
  const lt = olympiadLocalStrings(locale);
  const supabase = await createClient();

  const { data: pkg } = await supabase
    .from("olympiad_packages")
    // `code` is not an editable field; it is read here because the pool's bulk
    // delete makes the admin type it as the confirmation the RPC re-checks.
    .select("id, code, subject_id, grade_id, olympiad_type_id, price_amount, status, event_starts_at, sale_starts_at, sale_ends_at, duration_minutes, questions_per_attempt, cover_media_id")
    .eq("id", id)
    .maybeSingle();
  if (!pkg) notFound();

  // Derived lifecycle chip + effective public availability — computed HERE in
  // the server component from the DB row against SERVER time (no client clock
  // trust). Dates render as Baku wall-clock (lib/admin/datetime.ts).
  const lifecycle = olympiadLifecycleState(
    {
      status: String((pkg as any).status),
      sale_starts_at: (pkg as any).sale_starts_at ?? null,
      sale_ends_at: (pkg as any).sale_ends_at ?? null,
    },
    Date.now(),
  );
  const saleStartLabel = formatBakuDateTime((pkg as any).sale_starts_at, locale);
  const saleEndLabel = formatBakuDateTime((pkg as any).sale_ends_at, locale);
  const availabilityLines: string[] = [];
  if (lifecycle === "archived") {
    availabilityLines.push(lt("oly2.avail.archived"));
  } else if (lifecycle === "inactive") {
    availabilityLines.push(lt("oly2.avail.inactive"));
  } else if (lifecycle === "scheduled") {
    availabilityLines.push(
      lt("oly2.avail.scheduled").replace("{date}", saleStartLabel),
    );
    if (saleEndLabel) {
      availabilityLines.push(lt("oly2.avail.closes").replace("{date}", saleEndLabel));
    }
  } else if (lifecycle === "expired") {
    availabilityLines.push(lt("oly2.avail.expired").replace("{date}", saleEndLabel));
  } else if (saleEndLabel) {
    availabilityLines.push(
      lt("oly2.avail.openUntil").replace("{date}", saleEndLabel),
    );
  } else {
    availabilityLines.push(lt("oly2.avail.open"));
  }

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

  const [
    { data: subjects },
    { data: grades },
    { data: poolQuestions },
    { data: otypes },
    { data: qtypeRows },
    { data: pkgGradeRows },
    fullDict,
  ] =
    await Promise.all([
      supabase.from("subjects").select("id, name").order("name"),
      supabase.from("grades").select("id, name, level").order("level"),
      // PRIVATE pool: questions owned by THIS package only, with what the
      // list needs (az/primary body excerpt, option count, image flag).
      // Paged, NOT a bare select: PostgREST caps one response at max-rows
      // (1000), and a truncated pool makes the header checkbox's promise --
      // "select every question on screen" -- quietly false. Every bulk action
      // stands on this array being the whole pool. Same pattern as
      // lib/admin/question-options.ts.
      //
      // topic_id/subtopic_id ride along so the pool can be filtered by topic.
      // Both are nullable by design for olympiad questions, which is why the
      // filter needs an explicit "no topic" option.
      fetchWholePool(supabase, id),
      supabase.from("olympiad_types").select("id, name").order("name"),
      supabase
        .from("question_types")
        .select("code, name, status, options_required, correct_required")
        .eq("status", "active")
        .order("code"),
      // Round 34: the package's TARGET grades — each owns a separate pool.
      supabase
        .from("olympiad_package_grades")
        // Migration 106: each grade carries its own questions_per_attempt and
        // duration_minutes (NULL = inherit the package's).
        .select("grade_id, questions_per_attempt, duration_minutes, grades(id, name, level)")
        .eq("olympiad_package_id", id),
      getDict(),
    ]);

  // Round 34: target grades (sorted by level) + per-grade published counts.
  const targetGrades = ((pkgGradeRows ?? []) as any[])
    .map((r) => ({
      id: String(r.grade_id),
      name: String(r.grades?.name ?? ""),
      level: Number(r.grades?.level ?? 0),
      // Empty string = no override stored; the form shows the package value as
      // a placeholder and posts nothing, so the DB keeps inheriting.
      perAttempt: r.questions_per_attempt == null ? "" : String(r.questions_per_attempt),
      duration: r.duration_minutes == null ? "" : String(r.duration_minutes),
    }))
    .sort((a, b) => a.level - b.level);
  const targetGradeIds = new Set(targetGrades.map((g) => g.id));

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
    const gradeName =
      ((grades ?? []) as any[]).find((g) => g.id === q.grade_id)?.name ?? "—";
    return {
      id: String(q.id),
      num: i + 1,
      gradeId: q.grade_id ? String(q.grade_id) : "",
      // Nullable BY DESIGN for olympiad questions, which is why the
      gradeName: String(gradeName),
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
  // Published pool size per target grade (drives the Grades & Pools manager).
  const publishedByGrade = new Map<string, number>();
  for (const q of (poolQuestions ?? []) as any[]) {
    if (q.status !== "published" || !q.grade_id) continue;
    const k = String(q.grade_id);
    publishedByGrade.set(k, (publishedByGrade.get(k) ?? 0) + 1);
  }
  const gradesWithCounts = targetGrades.map((g) => ({
    ...g,
    questions: publishedByGrade.get(g.id) ?? 0,
  }));
  const addableGrades = ((grades ?? []) as any[])
    .filter((g) => !targetGradeIds.has(String(g.id)))
    .map((g) => ({ value: String(g.id), label: String(g.name) }));
  // Client-side row-validation rules for the add-grade and per-grade append
  // uploads (UX mirror — the server stays the authority).
  const activeTypeRules = ((qtypeRows ?? []) as any[]).map((r) => ({
    code: String(r.code ?? ""),
    name: String(r.name),
    options_required: r.options_required ?? null,
    correct_required: r.correct_required ?? null,
  }));
  const poolDict = localDict(locale);

  const formDict: Record<string, string> = { ...olympiadLocalDict(locale) };
  for (const k of FORM_KEYS) formDict[k] = t(k);

  return (
    // olympiad-page: the 1560px opt-in shared with the other data-table pages;
    // olympiad-form-page caps the forms at the measure they had before, so the
    // extra room goes to the pool table and nothing else moves (globals.css).
    <div className="page olympiad-page olympiad-form-page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {t("nav.olympiad")}
              <span className={`pill ${lifecyclePillClass(lifecycle)}`}>
                {lt(`oly2.state.${lifecycle}`)}
              </span>
            </h1>
            <p className="muted">{tr.az?.title ?? ""}</p>
            {availabilityLines.map((line, i) => (
              <p className="hint" key={i}>{line}</p>
            ))}
          </div>
          <Link className="btn-ghost" href="/olympiad">{t("manage.back")}</Link>
        </div>
      </div>
      <section className="card">
        <OlympiadForm
          dict={formDict}
          locale={locale}
          id={(pkg as any).id}
          subjects={((subjects ?? []) as any[]).map((s) => ({ value: s.id, label: s.name }))}
          olympiadTypes={((otypes ?? []) as any[]).map((o) => ({ value: o.id, label: o.name }))}
          // Reuses the per-grade published counts the page already computes.
          gradePools={gradesWithCounts}
          defaults={{
            subject_id: (pkg as any).subject_id,
            olympiad_type_id: (pkg as any).olympiad_type_id ?? "",
            price: String((pkg as any).price_amount ?? 0),
            status: (pkg as any).status,
            event: (pkg as any).event_starts_at ?? "",
            saleStart: (pkg as any).sale_starts_at ?? "",
            saleEnd: (pkg as any).sale_ends_at ?? "",
            duration: String((pkg as any).duration_minutes ?? 25),
            perAttempt: String(
              (pkg as any).questions_per_attempt ?? PER_ATTEMPT_DEFAULT,
            ),
            tr,
          }}
          submitLabel={t("manage.save")}
        />
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <OlympiadGradesManager
          // The FULL dict, not a hand-picked list: the per-grade append panel
          // shares the whole bulk.* / bulk.err.* family with BulkUploadModal, and
          // every key it forgot would render as a bare key string.
          // mergeLocalDict puts messages.ts on top of the local strings, so no
          // existing label changes.
          dict={{ ...mergeLocalDict(fullDict, locale), ...olympiadLocalDict(locale), ...poolDict }}
          packageId={(pkg as any).id}
          targetGrades={gradesWithCounts}
          addableGrades={addableGrades}
          typeRules={activeTypeRules}
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
            removing: t("pend.deleting"),
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
        {/* Attempts draw from the FULL published pool; whole files go in through
            the per-grade bulk append above, single questions right here. */}
        <p className="hint">{lt("oly2.allQuestionsNote")}</p>
        <p className="hint">{poolDict["olyq.manageNote"]}</p>
        <p className="hint">{poolDict["olyq.archivedNote"]}</p>
        <OlympiadQuestionManager
          // Per-grade floors, for the pre-flight preview only. The SERVER
          // always re-decides -- this exists so an admin is told BEFORE
          // clicking that an archive will be refused or will demote the
          // package, instead of discovering it from an error.
          floors={targetGrades.map((g) => ({
            gradeId: g.id,
            label: g.name,
            perAttempt: Number(g.perAttempt || (pkg as any).questions_per_attempt || 0),
          }))}
          dict={{ ...poolDict, "pend.loading": t("pend.loading"), "pend.processing": t("pend.processing"), "pend.deleting": t("pend.deleting") }}
          // Selection + bulk delete (migration 112). The package code IS asked
          // for — admin_delete_olympiad_questions compares it under the
          // package's row lock — and the acknowledgement is demanded on top,
          // the same friction the grade-pool dialog uses. No `blockedTitle`:
          // this dialog has no preview RPC to report blocks up front, so a
          // refusal arrives with the action result under its own heading.
          bulkStrings={{
            open: t("del.bulk.open"),
            title: t("del.bulk.title"),
            loading: t("del.loading"),
            loadFailed: t("del.loadFailed"),
            warnTitle: t("del.warnTitle"),
            irreversible: t("del.irreversible"),
            codeLabel: t("del.codeLabel"),
            // The package's code, exactly like the grade-pool dialog above it.
            codeHint: t("del.grade.codeHint"),
            ackLabel: t("del.ackLabel"),
            cancel: t("action.cancel"),
            close: t("modal.close"),
            working: t("pend.deleting"),
            selected: t("del.bulk.selected"),
            // Not the generic qbulk.selectAll: this box selects the VISIBLE
            // rows, and the label has to say so or it over-promises.
            selectAll: t("del.bulk.selectAll"),
            selectRow: t("del.bulk.selectRow"),
            clear: t("del.bulk.clear"),
            count: t("del.bulk.count"),
            grades: t("del.bulk.grades"),
            deleteTitle: t("del.bulk.deleteTitle"),
            deleteDesc: t("del.bulk.deleteDesc"),
            deleteAction: t("del.bulk.deleteAction"),
          }}
          packageId={(pkg as any).id}
          packageCode={String((pkg as any).code ?? "")}
          subjectName={subjectName}
          packageGrades={targetGrades.map((g) => ({ value: g.id, label: g.name }))}
          rows={poolRows}
        />
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        {/* Archive / restore / delete together — see the component header for
            why restore lands on INACTIVE rather than back on active. */}
        <OlympiadPackageDangerZone
          packageId={(pkg as any).id}
          isArchived={String((pkg as any).status) === "archived"}
          strings={{
            heading: t("del.package.heading"),
            archive: t("oly2.archive"),
            archiving: t("pend.processing"),
            restore: t("del.restore"),
            restoring: t("pend.processing"),
            restoreHint: t("del.restoreHint"),
            open: t("del.package.open"),
            title: t("del.package.title"),
            loading: t("del.loading"),
            loadFailed: t("del.loadFailed"),
            blockedTitle: t("del.package.blockedTitle"),
            warnTitle: t("del.warnTitle"),
            irreversible: t("del.irreversible"),
            codeLabel: t("del.codeLabel"),
            codeHint: t("del.codeHint"),
            ackLabel: t("del.ackLabel"),
            cancel: t("action.cancel"),
            close: t("modal.close"),
            working: t("pend.deleting"),
            questions: t("del.questions"),
            outcomeDelete: t("del.package.outcomeDelete"),
            outcomeArchive: t("del.package.outcomeArchive"),
            cascade: t("del.package.cascade"),
            media: t("del.media"),
            deleteTitle: t("del.package.deleteTitle"),
            deleteDesc: t("del.package.deleteDesc"),
            deleteAction: t("del.package.deleteAction"),
          }}
        />
      </section>
    </div>
  );
}
