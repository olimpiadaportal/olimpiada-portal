import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guards";
import { getDict, getLocale, getT } from "@/i18n/server";
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
  loadQuestionTaxonomy,
} from "@/lib/admin/question-options";
import {
  mergeLocalDict,
  withLocalStrings,
} from "@/lib/admin/question-flow-labels";
import { sanitizeSearchTerm } from "@/lib/admin/search";

// ---------------------------------------------------------------------------
// Round 9 — Questions upgrades: server pagination, text search, cascading
// filters, lifecycle stat cards. All searchParams are validated server-side
// (whitelisted sizes, clamped page, real lifecycle statuses, uuid-shaped ids).
// Round 21 — Rüb/term column, review chips ("needs option E" / "needs term"),
// and the daily-round readiness panel (daily_round_readiness RPC).
// ---------------------------------------------------------------------------

const PAGE_SIZES = [25, 50, 100] as const;
// Three-state content lifecycle: in_review / published / rejected.
const LIFECYCLE_STATUSES = ["in_review", "published", "rejected"] as const;
// Review-chip filters: demoted 4-option questions needing an E option, and
// legacy questions without a term (both excluded from daily rounds).
const REVIEW_FILTERS = ["optionE", "needsTerm"] as const;
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

type ReadinessRow = {
  subject_id: string;
  subject_name: string;
  grade_id: string;
  grade_level: number;
  eligible: number;
  required: number;
};

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Admin or Content Manager (content.create) may access the questions area.
  const ctx = await requirePermission("content.create");
  const locale = await getLocale();
  // Local trilingual strings (Rüb labels, chips, readiness) fill the keys
  // messages.ts does not know yet; messages.ts wins once the keys land.
  const t = withLocalStrings(await getT(), locale);
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
  const reviewRaw = first(sp, "review");
  const review = (REVIEW_FILTERS as readonly string[]).includes(reviewRaw)
    ? reviewRaw
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

  // ---- Review chips: server-computed candidate sets -----------------------
  // "Needs option E" = in_review general-bank questions holding exactly 4
  // options (the migration-055 demotions). Computed via the embedded count so
  // the page never downloads option rows; capped at 2000 questions.
  const { data: optRows } = await supabase
    .from("questions")
    .select("id, answer_options(count)")
    .eq("status", "in_review")
    .is("olympiad_package_id", null)
    .limit(2000);
  const optionEIds = ((optRows ?? []) as any[])
    .filter((r) => Number(r.answer_options?.[0]?.count ?? 0) === 4)
    .map((r) => String(r.id));
  const emptyOptionE = review === "optionE" && optionEIds.length === 0;

  const from = (page - 1) * size;
  const to = from + size - 1;

  const loadRows = async (): Promise<{ rows: any[]; count: number }> => {
    if (emptySearch || emptyOptionE) return { rows: [], count: 0 };
    let qb = supabase
      .from("questions")
      .select(
        "id, status, primary_locale, term, created_at, subjects(name), grades(name), topics(name), question_translations(locale, body)",
        { count: "exact" },
      )
      // PRIVATE olympiad-package questions are excluded from the general list.
      .is("olympiad_package_id", null);
    if (searchIds) qb = qb.in("id", searchIds);
    if (review === "optionE") qb = qb.in("id", optionEIds);
    if (review === "needsTerm") qb = qb.is("term", null);
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
    { count: needsTermCount },
    readiness,
    // For the New-question and Bulk-import modals.
    rawDict,
    selectOptions,
    editorTaxonomy,
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
    // "Needs term" chip count: general-bank questions without a Rüb.
    supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .is("olympiad_package_id", null)
      .is("term", null),
    // Daily-round readiness: eligible/25 per active subject × grade for the
    // current term (SECURITY DEFINER RPC; leaks only counts).
    supabase.rpc("daily_round_readiness"),
    getDict(),
    loadQuestionOptions(),
    loadQuestionTaxonomy(),
  ]);
  const list = main.rows;
  const total = main.count;
  const fullDict = mergeLocalDict(rawDict, locale);

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
    term: r.term != null ? t(`term.${r.term}`) : t("term.review"),
    needsTerm: r.term == null,
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
      code: String(r.code ?? ""),
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
    review,
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

  // Strings for the filter bar (the table now receives fullDict instead — it
  // hosts the edit modal, which needs the whole question-flow dictionary).
  const keys = [
    "qfield.subject", "qfield.grade", "qfield.topic", "qfield.subtopic",
    "qfield.status",
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

  // Review chips (toggle on click; combined with the other filters).
  const chips: { key: string; label: string; count: number }[] = [
    { key: "optionE", label: t("qchip.needsOptionE"), count: optionEIds.length },
    { key: "needsTerm", label: t("qchip.needsTerm"), count: needsTermCount ?? 0 },
  ];

  // ---- Daily-round readiness grid (subject rows × grade columns) -----------
  const readyRows = ((readiness.data ?? []) as ReadinessRow[]).map((r) => ({
    ...r,
    eligible: Number(r.eligible ?? 0),
    required: Number(r.required ?? 25),
  }));
  const readyGradeLevels = Array.from(
    new Set(readyRows.map((r) => r.grade_level)),
  ).sort((a, b) => a - b);
  const readySubjects = Array.from(
    new Map(readyRows.map((r) => [r.subject_id, r.subject_name])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const readyCell = new Map<string, ReadinessRow>();
  for (const r of readyRows) readyCell.set(`${r.subject_id}|${r.grade_level}`, r);
  const readyShort = readyRows.filter((r) => r.eligible < r.required).length;

  return (
    // .questions-page widens .admin-content via :has() (like .locations-page)
    // so the table uses the full desktop width instead of the 1120px cap.
    <div className="page questions-page">
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
              taxonomy={editorTaxonomy}
            />
          </div>
        </div>
      </div>

      {notice === "olympiadScoped" && (
        <p className="form-ok" role="status">
          {t("qnotice.olympiadScoped")}
        </p>
      )}

      {/* Daily-round readiness — eligible/25 per subject × grade, current
          term. Collapsed by default; the summary carries the red shortfall
          count so gaps stay visible at a glance. */}
      <details className="card ready-panel">
        <summary>
          {t("ready.title")}
          {" · "}
          {readyShort > 0 ? (
            <span className="ready-flag">
              {t("ready.short").replace("{n}", String(readyShort))}
            </span>
          ) : (
            <span className="ready-ok">{t("ready.allOk")}</span>
          )}
        </summary>
        <p className="hint">{t("ready.subtitle")}</p>
        {readyRows.length === 0 ? (
          <p className="muted">{t("ready.empty")}</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-compact ready-table">
              <thead>
                <tr>
                  <th>{t("qfield.subject")}</th>
                  {readyGradeLevels.map((lv) => (
                    <th key={lv} className="col-narrow">
                      {lv}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readySubjects.map(([sid, sname]) => (
                  <tr key={sid}>
                    <td>{sname}</td>
                    {readyGradeLevels.map((lv) => {
                      const cell = readyCell.get(`${sid}|${lv}`);
                      const low = cell != null && cell.eligible < cell.required;
                      return (
                        <td
                          key={lv}
                          className={`ready-cell${low ? " low" : ""}`}
                        >
                          {cell ? `${cell.eligible}/${cell.required}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

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

      {/* Review chips — the demoted/legacy queues that need editor attention. */}
      <div className="review-chips">
        {chips.map((c) => (
          <Link
            key={c.key}
            className={`review-chip${review === c.key ? " active" : ""}`}
            href={href({ review: review === c.key ? null : c.key, page: null })}
            aria-current={review === c.key ? "true" : undefined}
          >
            {c.label} <b>{c.count}</b>
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

      {/* fullDict (not the slim `dict`): the table hosts the edit modal, whose
          QuestionForm needs the complete question-flow dictionary — same one
          the create modal receives. */}
      <QuestionsTable
        rows={display}
        taxonomy={taxonomy}
        dict={fullDict}
        isAdmin={ctx.isAdmin}
        perms={ctx.permissions}
        editorOptions={selectOptions}
        editorTaxonomy={editorTaxonomy}
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
