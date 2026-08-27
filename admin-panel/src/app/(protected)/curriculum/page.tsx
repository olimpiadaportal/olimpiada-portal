import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { withLocalStrings } from "@/lib/admin/question-flow-labels";
import { sanitizeSearchTerm } from "@/lib/admin/search";
import { FilterBar, type FilterBarSelect } from "@/components/FilterBar";
import {
  SUBTOPIC_MATCH_MAX,
  TOPIC_PAGE_SIZE,
  TOPIC_SCAN_MAX,
  filterTopicsByQuery,
  groupTopicsBySubject,
  isUuid,
  pageSlice,
  parsePageParam,
  sortSubtopicRows,
  sortTopicRows,
  type GradeItem,
  type SubjectItem,
  type SubtopicRow,
  type Term,
  type TopicOption,
  type TopicRow,
} from "@/lib/admin/curriculum-shared";
import { allStrings, localStrings } from "./labels";
import { CurriculumTree, type CurriculumPagination } from "./CurriculumTree";

// =============================================================================
// Kurikulum strukturu / Curriculum structure — the ONE screen that manages the
// Subject › Topic › Subtopic tree. It REPLACED the two generic registry pages
// /manage/topics and /manage/subtopics (both resources were removed from
// lib/admin/resources.ts and from the sidebar in the same change).
//
// SCALE (why this page is shaped the way it is)
// The 2026 curriculum is 260 topics / 1077 subtopics. Two hard rules follow:
//
//  1. NEVER a bare `select()` on a table that can exceed the PostgREST
//     `max-rows` cap (1000 by default) — that truncates SILENTLY. Everything
//     that can grow past it is chunk-fetched through fetchChunked() with an
//     explicit ceiling, and hitting the ceiling is REPORTED in the UI instead
//     of pretending the data is complete.
//  2. NEVER hand 1077 subtopic nodes to the browser. Topics are paginated
//     server-side (TOPIC_PAGE_SIZE) and subtopics are fetched ONLY for the
//     topics on the current page; the client then lazy-expands them, so a
//     collapsed topic renders zero children. Peak DOM is bounded by the page
//     size, not by the curriculum size — no virtualization library, no new
//     dependency.
//
// The one deliberate exception: the exam-topic catalog itself is scanned in
// full (≤ TOPIC_SCAN_MAX, chunked) because it is small, it lets every filter,
// the search merge, the ordering and the pagination run through the pure,
// unit-tested helpers in lib/admin/curriculum-shared.ts, and it gives the
// subtopic form a COMPLETE parent-topic picker in the same round trip.
//
// The URL is the single source of truth for search + filters + page (refresh,
// back and deep links all work); expansion/modals/toasts are client state.
// Mutations go through the guarded stay-mode actions in lib/admin/curriculum.ts.
// =============================================================================

const CHUNK = 1000;
const TERM_FILTER_VALUES = ["1", "2", "3", "4", "none"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

/**
 * Read every row a query matches, in `max`-bounded chunks.
 *
 * PostgREST answers at most `max-rows` per request, so a single `select()` on a
 * 1077-row table returns 1000 rows and NO error. `makeQuery` must build a FRESH
 * builder on each call (Supabase builders are thenables and single-use) and
 * must carry a STABLE total order, or a chunk boundary could skip/duplicate.
 *
 * The cursor advances by the number of rows actually RETURNED, never by the
 * requested window, and the loop only stops on an empty batch. That is what
 * makes it correct for any project `max-rows` setting: a server that caps
 * responses below CHUNK would otherwise look exactly like "end of data" and we
 * would silently drop the rest — the bug this helper exists to prevent.
 * `truncated` means the local ceiling was hit, i.e. the UI is showing a
 * deliberately partial view and says so.
 */
async function fetchChunked<T>(
  makeQuery: () => any,
  max: number,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let from = 0;
  while (from < max) {
    const to = Math.min(from + CHUNK, max) - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) {
      console.error("[admin] curriculum fetch failed", error.message);
      return { rows, truncated: false };
    }
    const batch = (data ?? []) as T[];
    if (batch.length === 0) return { rows, truncated: false };
    rows.push(...batch);
    from += batch.length;
  }
  return { rows, truncated: rows.length >= max };
}

function embeddedCount(value: unknown): number {
  const arr = value as { count?: number }[] | null | undefined;
  return arr?.[0]?.count ?? 0;
}

function asTerm(value: unknown): Term | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? (n as Term) : null;
}

/**
 * One EN/RU name out of a topic_translations / subtopic_translations embed.
 *
 * Deliberately returns null rather than falling back to the AZ name: this
 * screen is where an admin must SEE that a translation is missing, so the tree
 * can badge it. Reader-facing surfaces use the coalescing resolver instead.
 */
function trName(value: unknown, locale: "en" | "ru"): string | null {
  const rows = value as { locale?: string | null; name?: string | null }[] | null | undefined;
  const hit = (rows ?? []).find((r) => r?.locale === locale);
  const name = typeof hit?.name === "string" ? hit.name.trim() : "";
  return name || null;
}

export default async function CurriculumPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const locale = await getLocale();
  // Local trilingual strings (Rüb labels) fill the keys messages.ts does not
  // know yet; messages.ts wins once the keys land there.
  const t = withLocalStrings(await getT(), locale);
  const lt = localStrings(locale);
  const db = await createClient();
  const sp = await searchParams;

  // ---- Validated search params --------------------------------------------
  const qRaw = first(sp, "q").trim().slice(0, 200);
  const subjectParam = isUuid(first(sp, "subject").trim())
    ? first(sp, "subject").trim()
    : "";
  const gradeParam = isUuid(first(sp, "grade").trim())
    ? first(sp, "grade").trim()
    : "";
  const termRaw = first(sp, "term").trim();
  const termParam = (TERM_FILTER_VALUES as readonly string[]).includes(termRaw)
    ? termRaw
    : "";

  // ---- Catalogs ------------------------------------------------------------
  const [{ data: gaps }, { data: subjectRows }, { data: gradeRows }] = await Promise.all([
    // How many rows still have no en/ru name (migration 152). A subtopic is
    // created in Azerbaijani and translated in a LATER step, which is how the
    // team actually works — but nothing showed the backlog, so it reached 604
    // rows in ten days unnoticed. One number, at the top, is the whole fix.
    db.rpc("curriculum_translation_gaps"),
    db.from("subjects").select("id, name, status").order("name").range(0, 499),
    db.from("grades").select("id, name, level").order("level").range(0, 99),
  ]);
  const subjects: SubjectItem[] = ((subjectRows ?? []) as any[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    status: String(r.status),
  }));
  const grades: GradeItem[] = ((gradeRows ?? []) as any[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    level: Number(r.level),
  }));

  // ---- Full exam-topic scan (with subtopic + question aggregates) ----------
  // `.order("id")` is a stable tiebreaker so chunk boundaries can neither skip
  // nor duplicate a row.
  const { rows: rawTopics, truncated } = await fetchChunked<any>(
    () =>
      db
        .from("topics")
        .select(
          "id, subject_id, grade_id, name, term, status, order_index, subtopics(count), questions(count), topic_translations(locale, name)",
        )
        .eq("scope", "exam")
        .order("name")
        .order("id"),
    TOPIC_SCAN_MAX,
  );

  const allTopics: TopicRow[] = rawTopics.map((r) => ({
    id: String(r.id),
    subjectId: String(r.subject_id),
    gradeId: r.grade_id ? String(r.grade_id) : null,
    name: String(r.name),
    nameEn: trName(r.topic_translations, "en"),
    nameRu: trName(r.topic_translations, "ru"),
    term: asTerm(r.term),
    status: String(r.status),
    orderIndex: Number(r.order_index ?? 0),
    subtopicCount: embeddedCount(r.subtopics),
    questionCount: embeddedCount(r.questions),
  }));

  // Complete parent-topic picker for the subtopic form (never filtered — an
  // admin must be able to file a subtopic under any topic).
  const topicOptions: TopicOption[] = allTopics.map((tp) => ({
    id: tp.id,
    name: tp.name,
    subjectId: tp.subjectId,
    gradeId: tp.gradeId,
    term: tp.term,
  }));

  // ---- Filters (subject / grade / term) ------------------------------------
  const filtered = allTopics.filter((tp) => {
    if (subjectParam && tp.subjectId !== subjectParam) return false;
    if (gradeParam && tp.gradeId !== gradeParam) return false;
    if (termParam === "none" && tp.term !== null) return false;
    if (termParam && termParam !== "none" && String(tp.term) !== termParam)
      return false;
    return true;
  });

  // ---- Search: topic names OR subtopic names (ancestors stay visible) ------
  const escaped = sanitizeSearchTerm(qRaw);
  let matchedSubtopicIds: string[] = [];
  let topicIdsWithMatchingSubtopic = new Set<string>();
  if (escaped) {
    const { rows: matches } = await fetchChunked<any>(
      () =>
        db
          .from("subtopics")
          .select("id, topic_id, topics!inner(scope)")
          .eq("topics.scope", "exam")
          .ilike("name", `%${escaped}%`)
          .order("id"),
      SUBTOPIC_MATCH_MAX,
    );
    matchedSubtopicIds = matches.map((r) => String(r.id));
    topicIdsWithMatchingSubtopic = new Set(
      matches.map((r) => String(r.topic_id)),
    );
  }

  const visibleTopics = sortTopicRows(
    filterTopicsByQuery(filtered, qRaw, topicIdsWithMatchingSubtopic),
    {
      subjectOrder: new Map(subjects.map((s, i) => [s.id, i])),
      gradeOrder: new Map(grades.map((g) => [g.id, g.level])),
    },
  );

  // ---- Pagination ----------------------------------------------------------
  const total = visibleTopics.length;
  const { from, to, totalPages } = pageSlice(
    total,
    parsePageParam(first(sp, "page"), Math.max(1, Math.ceil(total / TOPIC_PAGE_SIZE))),
    TOPIC_PAGE_SIZE,
  );
  const page = Math.floor(from / TOPIC_PAGE_SIZE) + 1;
  const pageTopics = visibleTopics.slice(from, to);

  // ---- Subtopics of the CURRENT PAGE only ----------------------------------
  const pageTopicIds = pageTopics.map((tp) => tp.id);
  const subtopicsByTopic: Record<string, SubtopicRow[]> = {};
  if (pageTopicIds.length > 0) {
    const { rows: subRows } = await fetchChunked<any>(
      () =>
        db
          .from("subtopics")
          .select(
            "id, topic_id, name, term, status, order_index, subtopic_translations(locale, name)",
          )
          .in("topic_id", pageTopicIds)
          .order("order_index")
          .order("id"),
      // A generous ceiling: TOPIC_PAGE_SIZE topics can never realistically
      // carry this many children, but the cap keeps the query bounded.
      TOPIC_PAGE_SIZE * 100,
    );
    for (const r of subRows) {
      const row: SubtopicRow = {
        id: String(r.id),
        topicId: String(r.topic_id),
        name: String(r.name),
        nameEn: trName(r.subtopic_translations, "en"),
        nameRu: trName(r.subtopic_translations, "ru"),
        term: asTerm(r.term),
        status: String(r.status),
        orderIndex: Number(r.order_index ?? 0),
      };
      (subtopicsByTopic[row.topicId] ??= []).push(row);
    }
    for (const key of Object.keys(subtopicsByTopic)) {
      subtopicsByTopic[key] = sortSubtopicRows(subtopicsByTopic[key]);
    }
  }

  const groups = groupTopicsBySubject(pageTopics);

  // ---- Pagination hrefs (filters preserved) --------------------------------
  const hrefForPage = (target: number): string => {
    const p = new URLSearchParams();
    if (qRaw) p.set("q", qRaw);
    if (subjectParam) p.set("subject", subjectParam);
    if (gradeParam) p.set("grade", gradeParam);
    if (termParam) p.set("term", termParam);
    if (target > 1) p.set("page", String(target));
    const qs = p.toString();
    return qs ? `/curriculum?${qs}` : "/curriculum";
  };

  const pagination: CurriculumPagination = {
    page,
    totalPages,
    from: total === 0 ? 0 : from + 1,
    to,
    total,
    prevHref: page > 1 ? hrefForPage(page - 1) : null,
    nextHref: page < totalPages ? hrefForPage(page + 1) : null,
  };

  // ---- Filter bar ----------------------------------------------------------
  const selects: FilterBarSelect[] = [
    {
      key: "subject",
      value: subjectParam,
      allLabel: lt("cur.allSubjects"),
      ariaLabel: lt("cur.fSubject"),
      options: subjects.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      key: "grade",
      value: gradeParam,
      allLabel: lt("cur.allGrades"),
      ariaLabel: lt("cur.fGrade"),
      options: grades.map((g) => ({ value: g.id, label: g.name })),
    },
    {
      key: "term",
      value: termParam,
      allLabel: lt("cur.allTerms"),
      ariaLabel: lt("cur.fTerm"),
      options: [
        ...["1", "2", "3", "4"].map((n) => ({ value: n, label: t(`term.${n}`) })),
        { value: "none", label: lt("cur.noTermFilter") },
      ],
    },
  ];

  // ---- Labels for the client tree (local trilingual + shared dictionary) ---
  const labels: Record<string, string> = { ...allStrings(locale) };
  for (const key of [
    "action.create",
    "action.save",
    "action.edit",
    "action.delete",
    "action.cancel",
    "manage.saving",
    "manage.select",
    "pend.deleting",
    "flt.noMatches",
    "modal.close",
    "term.1",
    "term.2",
    "term.3",
    "term.4",
    "status.active",
    "status.inactive",
    "status.archived",
  ]) {
    labels[key] = t(key);
  }

  const hasFilters = Boolean(qRaw || subjectParam || gradeParam || termParam);

  return (
    <div className="page curriculum-page">
      <div className="page-head">
        <h1>{lt("cur.title")}</h1>
        <p className="muted">{lt("cur.subtitle")}</p>
      </div>

      {/* Shown only when there IS a backlog: a permanent "0 missing" badge is
          noise, and noise is what a warning has to avoid to stay readable. */}
      {(() => {
        const g = (gaps ?? {}) as Record<string, number>;
        const subs = Number(g.subtopics_missing ?? 0);
        const tops = Number(g.topics_missing ?? 0);
        if (subs + tops === 0) return null;
        return (
          <p className="form-hint" role="status">
            {lt("cur.gaps")
              .replace("{topics}", String(tops))
              .replace("{subtopics}", String(subs))
              .replace("{questions}", String(Number(g.questions_affected ?? 0)))}
          </p>
        );
      })()}

      <FilterBar
        basePath="/curriculum"
        search={{ value: qRaw, placeholder: lt("cur.search") }}
        selects={selects}
        clearLabel={t("qfilter.clear")}
      />

      <CurriculumTree
        labels={labels}
        subjects={subjects}
        grades={grades}
        groups={groups}
        subtopicsByTopic={subtopicsByTopic}
        topicOptions={topicOptions}
        matchedSubtopicIds={matchedSubtopicIds}
        query={qRaw}
        hasFilters={hasFilters}
        pagination={pagination}
        truncatedAt={truncated ? TOPIC_SCAN_MAX : null}
        signature={`${qRaw}|${subjectParam}|${gradeParam}|${termParam}|${page}`}
      />
    </div>
  );
}
