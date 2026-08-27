import { Suspense } from "react";
import Link from "next/link";
import { PendingLink } from "@/components/PendingLink";
import { redirect } from "next/navigation";
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
  type QuestionTaxonomy,
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
// Round 21 — Rüb/term column, review chips ("needs option E" / "needs term").
// Round 37 — the daily-round readiness panel is GONE: rounds generate fully
// automatically (lazy, cumulative-term, subtopic-balanced) with no admin prep.
// Round 52 (§9) — the Rüb column became a first-class filter dimension: a term
// select (1–4 + "no term") in the filter bar, a sortable Rüb column header, and
// colour-coded term badges. Both new params are validated like every other one
// (whitelist, never interpolated into a query) and both round-trip through the
// URL, so a filtered list stays shareable and the pager keeps working.
// ---------------------------------------------------------------------------

const PAGE_SIZES = [25, 50, 100] as const;
// Three-state content lifecycle: in_review / published / rejected.
const LIFECYCLE_STATUSES = ["in_review", "published", "rejected"] as const;
// Review-chip filters: demoted 4-option questions needing an E option, and
// legacy questions without a term (both excluded from daily rounds).
const REVIEW_FILTERS = ["optionE", "needsTerm"] as const;
// Rüb filter: a real term, or "none" for the legacy NULL-term rows.
const TERM_FILTERS = ["1", "2", "3", "4", "none"] as const;
// Sort order. "" (default) = newest first; the Rüb column header cycles
// term_asc → term_desc → default.
// Shared by the shell's option-E scan and the child's text search: both cap
// their `.in()` id lists at the same URL-safe size.
const MAX_IN_IDS = 200;

const SORTS = ["term_asc", "term_desc"] as const;
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
  const locale = await getLocale();
  // Local trilingual strings (Rüb labels, chips) fill the keys
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
  const termRaw = first(sp, "term");
  const term = (TERM_FILTERS as readonly string[]).includes(termRaw)
    ? termRaw
    : "";
  const sortRaw = first(sp, "sort");
  const sort = (SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "";
  // One-shot notice banner (whitelisted values only — e.g. the edit page
  // redirects here when an olympiad-pool question id is opened directly).
  const noticeRaw = first(sp, "notice");
  const notice = noticeRaw === "olympiadScoped" ? noticeRaw : "";
  // Deep link into the edit modal — used by a question report's "open question"
  // link. Validated like every other id; the modal's own loader re-authorizes
  // and refuses an olympiad-pool question regardless of what arrives here.
  const editQuestionId = uuidParam("edit");

  // ---- Review chips: server-computed candidate sets -----------------------
  // "Needs option E" = in_review general-bank questions holding exactly 4
  // options (the migration-055 demotions). Computed via the embedded count so
  // the page never downloads option rows; capped at 2000 questions.
  // Only scanned when the chip is actually in use. This used to run on EVERY
  // page view — a full pass over the in_review bank with an aggregate embed,
  // before the 25 visible rows could render — including when the chip was off.
  // It is also `.in()`-bound like the search above, so it carries the same cap
  // and reports it the same way.
  let optionEIds: string[] = [];
  let optionECapped = false;
  if (review === "optionE") {
    const { data: optRows, error: optErr } = await supabase
      .from("questions")
      .select("id, answer_options(count)")
      .eq("status", "in_review")
      .is("olympiad_package_id", null)
      .limit(2000);
    if (optErr) console.error("[admin] option-E scan failed", optErr.code ?? "unknown");
    const all = ((optRows ?? []) as any[])
      .filter((r) => Number(r.answer_options?.[0]?.count ?? 0) === 4)
      .map((r) => String(r.id));
    optionECapped = all.length > MAX_IN_IDS;
    optionEIds = all.slice(0, MAX_IN_IDS);
  }
  const emptyOptionE = review === "optionE" && optionEIds.length === 0;

  // The eight `count: exact` helpers that used to live here are GONE, replaced
  // by the single admin_question_bank_stats() call below (migration 148).
  //
  // Do not bring them back one at a time. Each was a full pass over the bank,
  // none of them depended on the page being viewed, and together they were what
  // pushed the list query past the authenticated role's 8s statement_timeout
  // while a bulk import was writing to the same table — the admin saw populated
  // stat cards above a list that had failed to load. Another counter belongs in
  // that RPC, not in another round trip.

  const [
    { data: subjects },
    { data: grades },
    { data: qtypes },
    { data: bankStats },
    // For the New-question and Bulk-import modals.
    rawDict,
    selectOptions,
    editorTaxonomy,
  ] = await Promise.all([
    supabase.from("subjects").select("id, name, status").order("name"),
    supabase.from("grades").select("id, name, level").order("level"),
    supabase
      .from("question_types")
      .select("id, code, name, status, options_required, correct_required")
      .order("code"),
    // ONE call for all eight counters (migration 148). These were eight
    // separate `count: exact` full passes over the bank, recomputed on every
    // page step even though none of them depend on the page — and under a bulk
    // import they were enough to push the list query past the 8s statement
    // timeout. See the RPC's comment for the measurement.
    supabase.rpc("admin_question_bank_stats"),
    getDict(),
    loadQuestionOptions(),
    loadQuestionTaxonomy(),
  ]);
  // A failed stats call must not read as "the bank is empty": every card falls
  // back to null, which the card renderer already shows as a dash.
  const stats = (bankStats ?? {}) as Record<string, number | null>;
  const num = (k: string): number | null => {
    const v = stats[k];
    return typeof v === "number" ? v : null;
  };
  const statTotal = num("total");
  const statReview = num("in_review");
  const statPublished = num("published");
  const statRejected = num("rejected");
  const needsTermCount = num("needs_term");
  const explAzCount = num("expl_az");
  const explEnCount = num("expl_en");
  const explRuCount = num("expl_ru");

  const fullDict = mergeLocalDict(rawDict, locale);

  // The filter bar's cascade reuses loadQuestionTaxonomy's tree instead of
  // re-querying: it is already EXAM-scoped (olympiad bulk imports create
  // scope='olympiad' topics that must never appear on the Exams surfaces),
  // already parent-filtered, and — unlike a bare select() — PAGED, so the
  // curriculum's 1077 subtopics are not silently cut at PostgREST's 1000-row
  // cap. Extra fields (grade_id/term) are simply unused here.
  const taxonomy: Taxonomy = {
    subjects: (subjects ?? []) as Taxonomy["subjects"],
    topics: editorTaxonomy.topics,
    subtopics: editorTaxonomy.subtopics,
  };

  const gradeOptions: FilterOption[] = ((grades ?? []) as any[]).map((g) => ({
    value: g.id,
    label: String(g.name),
  }));
  const statusOptions: FilterOption[] = LIFECYCLE_STATUSES.map((s) => ({
    value: s,
    label: t(`qstatus.${s}`),
  }));
  // Rüb filter options: the four real terms plus the legacy no-term bucket.
  const termOptions: FilterOption[] = TERM_FILTERS.map((v) => ({
    value: v,
    label: v === "none" ? t("qfilter.noTerm") : t(`term.${v}`),
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
    term,
    sort,
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

  // Strings for the filter bar (the table now receives fullDict instead — it
  // hosts the edit modal, which needs the whole question-flow dictionary).
  const keys = [
    "qfield.subject", "qfield.grade", "qfield.topic", "qfield.subtopic",
    "qfield.status", "qfield.term",
    "qfilter.search", "qfilter.allSubjects", "qfilter.allTopics",
    "qfilter.allSubtopics", "qfilter.allGrades",
    "qfilter.allStatuses", "qfilter.allTerms", "qfilter.clear",
    "qpage.perPage",
  ];
  const dict: Record<string, string> = {};
  for (const k of keys) dict[k] = t(k);

  // `?? 0` used to turn a FAILED count into a confident zero — an RLS problem
  // or a timeout was indistinguishable from an empty bank, on the very cards an
  // admin reads to decide whether there is work to do. A null count now renders
  // as an em dash: unknown, not none.
  const statCards: { key: string; label: string; count: number | null; status: string }[] = [
    { key: "total", label: t("qstat.total"), count: statTotal ?? null, status: "" },
    { key: "in_review", label: t("qstatus.in_review"), count: statReview ?? null, status: "in_review" },
    { key: "published", label: t("qstatus.published"), count: statPublished ?? null, status: "published" },
    { key: "rejected", label: t("qstatus.rejected"), count: statRejected ?? null, status: "rejected" },
  ];

  // Review chips (toggle on click; combined with the other filters).
  // `count: null` renders the chip with NO number.
  //
  // "Needs option E" cannot be counted cheaply — it means "has exactly 4
  // answer options", which is an aggregate over answer_options that PostgREST
  // cannot express, so the old number was the length of a truncated in-memory
  // scan: it plateaued below the real backlog and moved between refreshes. A
  // number that is wrong in an unknown direction is worse than no number,
  // especially on a chip whose whole job is to say "this queue is not finished
  // yet". Selecting the chip runs the scan and shows what it found.
  const chips: { key: string; label: string; count: number | null }[] = [
    {
      key: "optionE",
      label: t("qchip.needsOptionE"),
      count: review === "optionE" ? optionEIds.length : null,
    },
    { key: "needsTerm", label: t("qchip.needsTerm"), count: needsTermCount ?? 0 },
  ];

  // Rüb column sort: term_asc → term_desc → back to the default (newest).
  const nextSort = sort === "term_asc" ? "term_desc" : sort === "term_desc" ? null : "term_asc";
  const termSortHref = href({ sort: nextSort, page: null });
  const clearHref = href({
    q: null,
    subject: null,
    topic: null,
    subtopic: null,
    grade: null,
    status: null,
    review: null,
    term: null,
    page: null,
  });
  const resultsKey = resultsKeyOf(sp);
  const anyFilter = Boolean(q || subject || topic || subtopic || grade || status || review || term);

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
              locale={locale}
              subjects={bulkSubjects}
              grades={gradeOptions}
              // Curriculum for the per-row "Topic not found" pre-check and the
              // AI prompt's embedded topic/subtopic list (§6/§7).
              taxonomy={editorTaxonomy}
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

      {/* Lifecycle stat cards — click to filter by status (Total clears it).
          SCOPE: these are counts over the WHOLE question bank and deliberately
          ignore the filters below. That is the right behaviour for a control
          that IS the status filter — a card whose number shrank as you filtered
          could never tell you how much work is left in each state. What was
          wrong was leaving it unsaid: an unlabelled global number sitting
          directly above a filtered list reads as a contradiction. The caption
          resolves it, in all three languages. */}
      <p className="qstat-scope muted">{t("qstat.scopeBank")}</p>
      <div className="qstat-grid">
        {statCards.map((c) => (
          <Link
            key={c.key}
            className={`qstat-card${current.status === c.status ? " active" : ""}`}
            href={href({ status: c.status || null, page: null })}
            aria-current={current.status === c.status ? "true" : undefined}
          >
            <span className="qstat-value">{c.count === null ? "—" : c.count}</span>
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
            // "Needs term" and the Rüb filter are mutually exclusive — turning
            // that chip on drops a term selection instead of returning nothing.
            href={href({
              review: review === c.key ? null : c.key,
              page: null,
              ...(c.key === "needsTerm" ? { term: null } : {}),
            })}
            aria-current={review === c.key ? "true" : undefined}
          >
            {c.label}
            {c.count !== null && (
              <>
                {" "}
                <b>{c.count}</b>
              </>
            )}
          </Link>
        ))}
      </div>

      {/* Explanation-translation coverage: the size of the gap the student
          review screen labels per question. Exact counts, not a sample. */}
      {(explAzCount ?? 0) > 0 && (
        <p className="muted expl-coverage">
          {t("qexpl.coverage")
            .replace("{az}", String(explAzCount ?? 0))
            .replace("{en}", String(explEnCount ?? 0))
            .replace("{ru}", String(explRuCount ?? 0))}
        </p>
      )}

      <QuestionFilters
        taxonomy={taxonomy}
        grades={gradeOptions}
        statuses={statusOptions}
        terms={termOptions}
        current={current}
        dict={dict}
      />

      {/* fullDict (not the slim `dict`): the table hosts the edit modal, whose
          QuestionForm needs the complete question-flow dictionary — same one
          the create modal receives. */}
      {/* THE LIST IS ITS OWN SUSPENSE BOUNDARY.

          The route-level loading.tsx was DELETED in the same change. It wrapped
          the entire segment, so on every page step the header, stat cards, chips
          and filter bar were replaced by a skeleton for a query that only
          affects 25 table rows — the outer boundary always wins over an inner
          one. The shell no longer awaits the list, so it renders on its own
          (single) stats call and only the table area below suspends.
          Everything above this line — stat cards, chips, filter bar — is
          independent of ?page, so it must not disappear when the admin steps
          through pages. `key` is what makes the boundary re-suspend on a
          same-route navigation: without it React keeps the resolved child
          mounted and the previous page's rows sit there looking current. */}
      <Suspense key={resultsKey} fallback={<ResultsSkeleton />}>
        <QuestionResults
          sp={sp}
          ctx={{ isAdmin: ctx.isAdmin, permissions: ctx.permissions }}
          taxonomy={taxonomy}
          fullDict={fullDict}
          selectOptions={selectOptions}
          editorTaxonomy={editorTaxonomy}
          optionEIds={optionEIds}
          optionECapped={optionECapped}
          editQuestionId={editQuestionId}
        />
      </Suspense>
    </div>
  );
}

/** Only the params the LIST depends on. A change to any of these re-suspends. */
function resultsKeyOf(sp: SearchParams): string {
  return [
    "q", "subject", "topic", "subtopic", "grade", "status", "review", "term",
    "sort", "page", "size",
  ].map((k) => first(sp, k)).join("|");
}

/** Table-shaped placeholder. Deliberately NOT the whole-page skeleton. */
function ResultsSkeleton() {
  return (
    <section className="card" aria-busy="true">
      <div className="qrep-skel-rows">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
          <div key={row} className="loc-skel loc-skel-row" />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The list, its pager, and nothing else.
//
// Split out of QuestionsPage so that stepping through pages re-renders THIS and
// leaves the shell alone. It re-derives the validated params from `sp` rather
// than receiving fifteen props: the parsing is pure, cheap, and duplicating the
// PARSE is far safer than duplicating the VALIDATION rules in two places.
//
// The expensive shell-side loads (taxonomy, dictionary, editor options) arrive
// as props because they are page-independent — re-fetching them here would put
// back exactly the work this split removes.
// ---------------------------------------------------------------------------
async function QuestionResults({
  sp,
  ctx,
  taxonomy,
  fullDict,
  selectOptions,
  editorTaxonomy,
  optionEIds,
  optionECapped,
  editQuestionId,
}: {
  sp: SearchParams;
  ctx: { isAdmin: boolean; permissions: string[] };
  taxonomy: Taxonomy;
  fullDict: Record<string, string>;
  selectOptions: Record<string, { value: string; label: string }[]>;
  editorTaxonomy: QuestionTaxonomy;
  optionEIds: string[];
  optionECapped: boolean;
  editQuestionId: string;
}) {
  const locale = await getLocale();
  const t = withLocalStrings(await getT(), locale);
  const supabase = await createClient();

  const sizeRaw = Number(first(sp, "size"));
  const size = (PAGE_SIZES as readonly number[]).includes(sizeRaw) ? sizeRaw : 25;
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
  const status = (LIFECYCLE_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : "";
  const reviewRaw = first(sp, "review");
  const review = (REVIEW_FILTERS as readonly string[]).includes(reviewRaw) ? reviewRaw : "";
  const termRaw = first(sp, "term");
  const term = (TERM_FILTERS as readonly string[]).includes(termRaw) ? termRaw : "";
  const sortRaw = first(sp, "sort");
  const sort = (SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "";

  const current: Record<string, string> = {
    q, subject, topic, subtopic, grade, status, review, term, sort,
    size: String(size),
    page: String(page),
  };
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

  const emptyOptionE = review === "optionE" && optionEIds.length === 0;

  // ---- Text search: resolve matching question ids first ------------------
  // supabase-js cannot filter the parent by an embedded table reliably without
  // an inner join, so we query question_translations directly, then .in() on
  // the main query. Empty match list short-circuits to an empty result.
  //
  // Every id resolved here is sent back as a `.in()` list in the URL of the
  // main query. A uuid costs ~37 bytes there, so 1000 matches is a ~37 KB URL —
  // far past what the request line accepts. That is why a BROAD search used to
  // render "0–0 of 0": the list query was rejected outright, the error was
  // discarded, and an empty table looked like "this word appears nowhere".
  // Capping to a URL-safe size makes the request succeed, and the cap is
  // REPORTED rather than hidden — the old "of N" total was the count of the
  // truncated id set, which is a number that describes nothing.
  let searchIds: string[] | null = null;
  let searchCapped = false;
  const escaped = sanitizeSearchTerm(q); // M18: shared sanitizer
  if (escaped) {
    const { data: trs, error: trsErr } = await supabase
      .from("question_translations")
      .select("question_id")
      .ilike("body", `%${escaped}%`)
      .limit(MAX_IN_IDS + 1);
    if (trsErr) console.error("[admin] question search failed", trsErr.code ?? "unknown");
    const all = Array.from(
      new Set(((trs ?? []) as { question_id: string }[]).map((r) => r.question_id)),
    );
    searchCapped = all.length > MAX_IN_IDS;
    searchIds = all.slice(0, MAX_IN_IDS);
  }
  const emptySearch = searchIds !== null && searchIds.length === 0;

  const from = (page - 1) * size;
  const to = from + size - 1;

  const loadRows = async (): Promise<{
    rows: any[];
    count: number;
    failed: boolean;
  }> => {
    if (emptySearch || emptyOptionE) return { rows: [], count: 0, failed: false };
    let qb = supabase
      .from("questions")
      .select(
        "id, status, primary_locale, term, created_at, subjects(name), grades(name), topics(name), question_translations(locale, body), question_explanations(locale)",
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
    // Rüb filter (whitelisted above): "none" = the legacy NULL-term rows.
    if (term === "none") qb = qb.is("term", null);
    else if (term) qb = qb.eq("term", Number(term));
    // Sorting. NULL terms always sort LAST so a term-sorted list opens on real
    // content.
    if (sort === "term_asc") {
      qb = qb.order("term", { ascending: true, nullsFirst: false });
    } else if (sort === "term_desc") {
      qb = qb.order("term", { ascending: false, nullsFirst: false });
    }
    // `id` LAST, and it is not decoration. `created_at` was described here as
    // "the tiebreaker so paging is deterministic", but it is not UNIQUE: a bulk
    // import stamps one timestamp across the whole file, so thousands of rows
    // tie. PostgreSQL may then order tied rows differently between the queries
    // that serve page 3 and page 4 — the same question appears twice while
    // another never appears at all. Reviewing a status page by page silently
    // skipped questions forever, and no counter could reveal it. A unique final
    // key makes the total order deterministic, which is what `.range()` needs
    // to be a correct pager. Sorting by Rüb made it worse: a whole imported
    // file ties on BOTH term and created_at.
    const { data, count, error } = await qb
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    // A discarded error rendered as "there are no questions": an RLS denial, a
    // statement timeout or a rejected oversized request all produced a calm,
    // confident empty state, and the admin concluded the bank was empty.
    if (error) {
      console.error("[admin] questions list failed", error.code ?? "unknown");
      return { rows: [], count: 0, failed: true };
    }
    return { rows: (data ?? []) as any[], count: count ?? 0, failed: false };
  };

  // ONE retry, and only for the list.
  //
  // The failure this recovers from is a STATEMENT TIMEOUT: `authenticated` runs
  // with statement_timeout = 8s, and a bulk import writing 100-300 questions a
  // minute into this same table is enough to push a cold `count: exact` past it.
  // That is transient by construction — the previous behaviour turned it into a
  // dead end whose only escape was reloading the page by hand.
  //
  // Deliberately ONE retry and no backoff loop: if the second attempt also
  // fails, something is wrong that retrying will not fix, and the admin is
  // better served by the honest error than by a page that hangs twice as long.
  const loadRowsWithRetry = async () => {
    const first = await loadRows();
    if (!first.failed) return first;
    return await loadRows();
  };

  const main = await loadRowsWithRetry();
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

  // Which explanation translations a row is still missing. An empty result is
  // reported as "no explanation" rather than "missing EN/RU": a Content Manager
  // without content.review cannot SEE another author's in-review explanations
  // (qexpl_select), and claiming those are untranslated would be a guess. Same
  // rule the student-facing fallback label uses — never assert a gap we cannot
  // observe.
  const explMissing = (r: any): string[] => {
    const have = new Set(
      ((r.question_explanations ?? []) as { locale: string }[]).map((x) => x.locale),
    );
    if (!have.has("az")) return [];
    return (["en", "ru"] as const).filter((l) => !have.has(l)).map((l) => l.toUpperCase());
  };

  const display: QuestionRow[] = list.map((r) => ({
    id: r.id,
    subject: r.subjects?.name ?? "—",
    grade: r.grades?.name ?? "—",
    lang: langName(r.primary_locale),
    // Embedded topics.name via questions.topic_id (NULL topic → em dash).
    topic: r.topics?.name ?? "—",
    term: r.term != null ? t(`term.${r.term}`) : t("term.review"),
    // Raw 1..4 (or null) drives the colour-coded badge class.
    termValue: r.term == null ? null : Number(r.term),
    needsTerm: r.term == null,
    body: bodySnippet(r),
    // "" = nothing observable to report; otherwise the missing locale codes.
    explHas: ((r.question_explanations ?? []) as { locale: string }[]).some(
      (x) => x.locale === "az",
    ),
    explMissing: explMissing(r),
    status: r.status,
  }));

  // ---- Pager numbers -------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil(total / size));
  // `page` was clamped at the BOTTOM (>= 1) but never at the top, so a bulk
  // action that emptied the last page left the admin stranded: an empty table
  // reading "Showing 0–2875 of 2875" with no page number highlighted, which
  // reads as "the whole bank vanished". Send them to the last page that has
  // rows instead — every other search param is preserved by href().
  if (page > totalPages && total > 0) redirect(href({ page: String(totalPages) }));
  const items = pageItems(page, totalPages);
  const shownFrom = list.length === 0 ? 0 : from + 1;
  const shownTo = from + list.length;
  const showingLine = t("qpage.showing")
    .replace("{from}", String(shownFrom))
    .replace("{to}", String(shownTo))
    .replace("{total}", String(total));


  const anyFilter = Boolean(q || subject || topic || subtopic || grade || status || review || term);
  const nextSort = sort === "term_asc" ? "term_desc" : sort === "term_desc" ? null : "term_asc";
  const termSortHref = href({ sort: nextSort, page: null });
  const clearHref = href({
    q: null, subject: null, topic: null, subtopic: null, grade: null,
    status: null, review: null, term: null, page: null,
  });

  return (
    <>
      {/* A failed list query used to be indistinguishable from an empty bank.
          Say so instead: an RLS denial, a statement timeout or a rejected
          oversized request are all things the admin can act on or report, and
          none of them mean "there are no questions". */}
      {main.failed && (
        <p className="form-error" role="alert">
          {t("qpage.loadFailed")}
        </p>
      )}

      {/* An honest cap beats a silent one. The admin now knows the list is a
          first slice and that narrowing the search will reach the rest. */}
      {(searchCapped || optionECapped) && !main.failed && (
        <p className="form-hint" role="status">
          {t("qpage.resultsCapped").replace("{n}", String(MAX_IN_IDS))}
        </p>
      )}

      <QuestionsTable
        rows={display}
        taxonomy={taxonomy}
        dict={fullDict}
        isAdmin={ctx.isAdmin}
        perms={ctx.permissions}
        editorOptions={selectOptions}
        editorTaxonomy={editorTaxonomy}
        termSortHref={termSortHref}
        termSortDir={sort === "term_asc" ? "asc" : sort === "term_desc" ? "desc" : ""}
        filtered={anyFilter}
        clearHref={clearHref}
        initialEditId={editQuestionId || null}
      />

      {/* Footer pager — server-rendered links preserving all searchParams.
          PendingLink, not Link: this navigation only changes searchParams, so
          the route-level loading.tsx boundary never re-suspends and the admin
          would otherwise stare at an unchanged page for the whole round trip. */}
      <div className="qpager">
        <span className="qpager-info muted">{showingLine}</span>
        <nav className="qpager-nav" aria-label="pagination">
          {page > 1 ? (
            <PendingLink className="qpage-link" href={href({ page: String(page - 1) })}>
              {t("qpage.prev")}
            </PendingLink>
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
              <PendingLink key={it} className="qpage-link" href={href({ page: String(it) })}>
                {it}
              </PendingLink>
            ),
          )}
          {page < totalPages ? (
            <PendingLink className="qpage-link" href={href({ page: String(page + 1) })}>
              {t("qpage.next")}
            </PendingLink>
          ) : (
            <span className="qpage-link disabled">{t("qpage.next")}</span>
          )}
        </nav>
      </div>
    </>
  );
}
