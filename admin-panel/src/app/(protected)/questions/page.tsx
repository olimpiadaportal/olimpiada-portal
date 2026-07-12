import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guards";
import { getDict, getT } from "@/i18n/server";
import { localeNames, locales, type Locale } from "@/i18n/config";
import {
  QuestionsTable,
  type QuestionRow,
  type Taxonomy,
} from "@/components/QuestionsTable";
import {
  QuestionFilters,
  type FilterCurrent,
  type FilterOption,
} from "@/components/QuestionFilters";
import { BulkUploadModal } from "@/components/BulkUploadModal";
import { NewQuestionModal } from "@/components/NewQuestionModal";
import {
  loadQuestionOptions,
  loadQuestionTypeRules,
} from "@/lib/admin/question-options";
import { sanitizeSearchTerm } from "@/lib/admin/search";

// ---------------------------------------------------------------------------
// Round 9 — Questions upgrades: server pagination, text search, cascading
// filters, lifecycle stat cards. All searchParams are validated server-side
// (whitelisted sizes, clamped page, real lifecycle statuses, uuid-shaped ids).
// ---------------------------------------------------------------------------

const PAGE_SIZES = [25, 50, 100] as const;
// Three-state content lifecycle: in_review / published / rejected.
const LIFECYCLE_STATUSES = ["in_review", "published", "rejected"] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

// Numbered pager items: at most ~7 entries with ellipsis gaps.
function pageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  if (lo > 2) items.push("…");
  for (let p = lo; p <= hi; p++) items.push(p);
  if (hi < total - 1) items.push("…");
  items.push(total);
  return items;
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Admin or Content Manager (content.create) may access the questions area.
  const ctx = await requirePermission("content.create");
  const t = await getT();
  const supabase = await createClient();
  const sp = await searchParams;

  // ---- Validated searchParams --------------------------------------------
  const sizeRaw = Number(first(sp, "size"));
  const size = (PAGE_SIZES as readonly number[]).includes(sizeRaw)
    ? sizeRaw
    : 25;
  const pageRaw = Math.floor(Number(first(sp, "page")));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const q = first(sp, "q").trim().slice(0, 200);
  const uuidParam = (key: string): string => {
    const v = first(sp, key).trim();
    return UUID_RE.test(v) ? v : "";
  };
  const subject = uuidParam("subject");
  const topic = uuidParam("topic");
  const subtopic = uuidParam("subtopic");
  const grade = uuidParam("grade");
  const statusRaw = first(sp, "status");
  const status = (LIFECYCLE_STATUSES as readonly string[]).includes(statusRaw)
    ? statusRaw
    : "";
  // One-shot notice banner (whitelisted values only — e.g. the edit page
  // redirects here when an olympiad-pool question id is opened directly).
  const noticeRaw = first(sp, "notice");
  const notice = noticeRaw === "olympiadScoped" ? noticeRaw : "";

  // ---- Text search: resolve matching question ids first ------------------
  // supabase-js cannot filter the parent by an embedded table reliably without
  // an inner join, so we query question_translations directly, then .in() on
  // the main query. Empty match list short-circuits to an empty result.
  let searchIds: string[] | null = null;
  const escaped = sanitizeSearchTerm(q); // M18: shared sanitizer
  if (escaped) {
    const { data: trs } = await supabase
      .from("question_translations")
      .select("question_id")
      .ilike("body", `%${escaped}%`)
      .limit(2000);
    searchIds = Array.from(
      new Set(((trs ?? []) as { question_id: string }[]).map((r) => r.question_id)),
    );
  }
  const emptySearch = searchIds !== null && searchIds.length === 0;

  const from = (page - 1) * size;
  const to = from + size - 1;

  const loadRows = async (): Promise<{ rows: any[]; count: number }> => {
    if (emptySearch) return { rows: [], count: 0 };
    let qb = supabase
      .from("questions")
      .select(
        "id, status, primary_locale, created_at, subjects(name), grades(name), topics(name), question_translations(locale, body)",
        { count: "exact" },
      )
      // PRIVATE olympiad-package questions are excluded from the general list.
      .is("olympiad_package_id", null);
    if (searchIds) qb = qb.in("id", searchIds);
    if (subject) qb = qb.eq("subject_id", subject);
    if (topic) qb = qb.eq("topic_id", topic);
    if (subtopic) qb = qb.eq("subtopic_id", subtopic);
    if (grade) qb = qb.eq("grade_id", grade);
    if (status) qb = qb.eq("status", status);
    const { data, count } = await qb
      .order("created_at", { ascending: false })
      .range(from, to);
    return { rows: (data ?? []) as any[], count: count ?? 0 };
  };

  // Cheap head-only counts for the stat cards (same private-pool exclusion).
  const countByStatus = (st?: string) => {
    let qb = supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .is("olympiad_package_id", null);
    if (st) qb = qb.eq("status", st);
    return qb;
  };

  const [
    main,
    { data: subjects },
    { data: topics },
    { data: subtopics },
    { data: grades },
    { data: qtypes },
    { count: statTotal },
    { count: statReview },
    { count: statPublished },
    { count: statRejected },
    // For the New-question and Bulk-import modals.
    fullDict,
    selectOptions,
    typeRules,
  ] = await Promise.all([
    loadRows(),
    supabase.from("subjects").select("id, name, status").order("name"),
    // Module separation: the Exams surfaces only ever list EXAM-scoped topics
    // (olympiad-package bulk imports create scope='olympiad' topics).
    supabase
      .from("topics")
      .select("id, subject_id, name")
      .eq("scope", "exam")
      .order("name"),
    supabase.from("subtopics").select("id, topic_id, name").order("name"),
    supabase.from("grades").select("id, name, level").order("level"),
    supabase
      .from("question_types")
      .select("id, code, name, status, options_required, correct_required")
      .order("code"),
    countByStatus(),
    countByStatus("in_review"),
    countByStatus("published"),
    countByStatus("rejected"),
    getDict(),
    loadQuestionOptions(t),
    loadQuestionTypeRules(),
  ]);
  const list = main.rows;
  const total = main.count;

  const langName = (loc: string): string =>
    (locales as readonly string[]).includes(loc)
      ? localeNames[loc as Locale]
      : loc;

  const bodySnippet = (r: any): string => {
    const tr = (r.question_translations ?? []).find(
      (x: any) => x.locale === r.primary_locale,
    );
    const b: string = tr?.body ?? "";
    if (!b) return "—";
    return b.length > 60 ? b.slice(0, 60) + "…" : b;
  };

  const display: QuestionRow[] = list.map((r) => ({
    id: r.id,
    subject: r.subjects?.name ?? "—",
    grade: r.grades?.name ?? "—",
    lang: langName(r.primary_locale),
    // Embedded topics.name via questions.topic_id (NULL topic → em dash).
    topic: r.topics?.name ?? "—",
    body: bodySnippet(r),
    status: r.status,
  }));

  // Subtopics have no scope column — they inherit it via their parent topic,
  // so keep only subtopics whose parent is in the exam-scoped topic set above.
  const examTopicIds = new Set(
    ((topics ?? []) as { id: string }[]).map((r) => r.id),
  );
  const examSubtopics = ((subtopics ?? []) as { topic_id: string }[]).filter(
    (s) => examTopicIds.has(s.topic_id),
  );

  const taxonomy: Taxonomy = {
    subjects: (subjects ?? []) as Taxonomy["subjects"],
    topics: (topics ?? []) as Taxonomy["topics"],
    subtopics: examSubtopics as Taxonomy["subtopics"],
  };

  const gradeOptions: FilterOption[] = ((grades ?? []) as any[]).map((g) => ({
    value: g.id,
    label: String(g.name),
  }));
  const statusOptions: FilterOption[] = LIFECYCLE_STATUSES.map((s) => ({
    value: s,
    label: t(`qstatus.${s}`),
  }));

  // Bulk-import modal inputs: ACTIVE subjects only (grades have no status) and
  // active question-type names for the short reference hint.
  const bulkSubjects: FilterOption[] = ((subjects ?? []) as any[])
    .filter((s) => s.status === "active")
    .map((s) => ({ value: s.id, label: String(s.name) }));
  const activeTypeNames: string[] = ((qtypes ?? []) as any[])
    .filter((r) => r.status === "active")
    .map((r) => String(r.name));
  // Structure rules for the bulk-import client-side pre-validation mirror.
  const activeTypeRules = ((qtypes ?? []) as any[])
    .filter((r) => r.status === "active")
    .map((r) => ({
      name: String(r.name),
      options_required: r.options_required ?? null,
      correct_required: r.correct_required ?? null,
    }));

  // Canonical (validated) params — the base for every link on this page.
  const current: FilterCurrent = {
    q,
    subject,
    topic,
    subtopic,
    grade,
    status,
    size: String(size),
  };

  // Build an /questions URL from the current params + overrides. Empty/null
  // values are dropped; defaults (size 25, page 1) are omitted for clean URLs.
  const href = (overrides: Record<string, string | null>): string => {
    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries(current)) if (v) merged[k] = v;
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === "") delete merged[k];
      else merged[k] = v;
    }
    if (merged.size === "25") delete merged.size;
    if (merged.page === "1") delete merged.page;
    const qs = new URLSearchParams(merged).toString();
    return qs ? `/questions?${qs}` : "/questions";
  };

  // ---- Pager numbers -------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil(total / size));
  const items = pageItems(page, totalPages);
  const shownFrom = list.length === 0 ? 0 : from + 1;
  const shownTo = from + list.length;
  const showingLine = t("qpage.showing")
    .replace("{from}", String(shownFrom))
    .replace("{to}", String(shownTo))
    .replace("{total}", String(total));

  // Strings the client table needs (passed as a dict, like QuestionForm).
  const keys = [
    "qbulk.selected", "qbulk.chooseAction", "qbulk.apply", "qbulk.confirmAction",
    "qbulk.confirmDelete", "qbulk.selectAll", "qbulk.assignTopic", "qbulk.assign",
    "qbulk.confirmAssign", "qbulk.optional",
    "action.delete", "action.edit",
    "qfield.subject", "qfield.grade", "qfield.language",
    "qfield.topic", "qfield.subtopic", "qfield.bodyAz", "qfield.status",
    "questions.none",
    "qact.publish", "qact.reject", "qact.to_review",
    "qstatus.in_review", "qstatus.published", "qstatus.rejected",
    "qbulk.applied", "qbulk.updated", "qbulk.skipped",
    "qfilter.search", "qfilter.allSubjects", "qfilter.allTopics",
    "qfilter.allSubtopics", "qfilter.allGrades",
    "qfilter.allStatuses", "qfilter.clear", "qpage.perPage",
  ];
  const dict: Record<string, string> = {};
  for (const k of keys) dict[k] = t(k);

  const statCards: { key: string; label: string; count: number; status: string }[] = [
    { key: "total", label: t("qstat.total"), count: statTotal ?? 0, status: "" },
    { key: "in_review", label: t("qstatus.in_review"), count: statReview ?? 0, status: "in_review" },
    { key: "published", label: t("qstatus.published"), count: statPublished ?? 0, status: "published" },
    { key: "rejected", label: t("qstatus.rejected"), count: statRejected ?? 0, status: "rejected" },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("nav.questions")}</h1>
            <p className="muted">{t("questions.subtitle")}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <BulkUploadModal
              dict={fullDict}
              subjects={bulkSubjects}
              grades={gradeOptions}
              typeNames={activeTypeNames}
              typeRules={activeTypeRules}
            />
            <NewQuestionModal
              dict={fullDict}
              options={selectOptions}
              typeRules={typeRules}
            />
          </div>
        </div>
      </div>

      {notice === "olympiadScoped" && (
        <p className="form-ok" role="status">
          {t("qnotice.olympiadScoped")}
        </p>
      )}

      {/* Lifecycle stat cards — click to filter by status (Total clears it). */}
      <div className="qstat-grid">
        {statCards.map((c) => (
          <Link
            key={c.key}
            className={`qstat-card${current.status === c.status ? " active" : ""}`}
            href={href({ status: c.status || null, page: null })}
            aria-current={current.status === c.status ? "true" : undefined}
          >
            <span className="qstat-value">{c.count}</span>
            <span className="qstat-label">{c.label}</span>
          </Link>
        ))}
      </div>

      <QuestionFilters
        taxonomy={taxonomy}
        grades={gradeOptions}
        statuses={statusOptions}
        current={current}
        dict={dict}
      />

      <QuestionsTable
        rows={display}
        taxonomy={taxonomy}
        dict={dict}
        isAdmin={ctx.isAdmin}
        perms={ctx.permissions}
      />

      {/* Footer pager — server-rendered links preserving all searchParams. */}
      <div className="qpager">
        <span className="qpager-info muted">{showingLine}</span>
        <nav className="qpager-nav" aria-label="pagination">
          {page > 1 ? (
            <Link className="qpage-link" href={href({ page: String(page - 1) })}>
              {t("qpage.prev")}
            </Link>
          ) : (
            <span className="qpage-link disabled">{t("qpage.prev")}</span>
          )}
          {items.map((it, i) =>
            it === "…" ? (
              <span key={`e${i}`} className="qpage-ellipsis">
                …
              </span>
            ) : it === page ? (
              <span key={it} className="qpage-link current" aria-current="page">
                {it}
              </span>
            ) : (
              <Link key={it} className="qpage-link" href={href({ page: String(it) })}>
                {it}
              </Link>
            ),
          )}
          {page < totalPages ? (
            <Link className="qpage-link" href={href({ page: String(page + 1) })}>
              {t("qpage.next")}
            </Link>
          ) : (
            <span className="qpage-link disabled">{t("qpage.next")}</span>
          )}
        </nav>
      </div>
    </div>
  );
}
