// Curriculum Structure — shared model + PURE helpers.
//
// Deliberately a PLAIN module (no "use server", no "server-only"): the server
// page, the guarded server actions AND the client tree all import from here, so
// it may only ever contain types and side-effect-free functions. Every helper
// in this file is unit-tested (lib/admin/__tests__/curriculum-shared.test.ts).
//
// Why the sizes below matter (see also the header of the /curriculum page):
// the 2026 curriculum is 260 topics / 1077 subtopics. Supabase/PostgREST caps a
// single response at the project's `max-rows` (1000 by default), so anything
// that could exceed that is either paginated or chunk-fetched — never a bare
// `select()` that would silently truncate.

export const CURRICULUM_KINDS = ["topic", "subtopic"] as const;
export type CurriculumKind = (typeof CURRICULUM_KINDS)[number];

/** Topics rendered per page. The tree never renders more than this many topic
 *  nodes, and subtopics are fetched ONLY for the topics on the current page. */
export const TOPIC_PAGE_SIZE = 40;

/** Hard ceiling on the filtered-topic scan (chunk-fetched, so it is a real cap
 *  and not a silent truncation). 260 today — the headroom is for growth. */
export const TOPIC_SCAN_MAX = 3000;

/** Hard ceiling on the subtopic-name search scan. */
export const SUBTOPIC_MATCH_MAX = 1000;

/** Server-side cap on taxonomy names (mirrors the generic registry's TEXT_MAX). */
export const NAME_MAX = 120;

/**
 * Locales stored in topic_translations / subtopic_translations (migration 114).
 *
 * `az` is deliberately absent: topics.name / subtopics.name ARE the Azerbaijani
 * name — both bulk importers create topics by it, migration 095 matches on it,
 * and the duplicate guards below fold on it — so a mirrored `az` translation row
 * would be a second copy that drifts. A DB CHECK rejects one.
 */
export const LOCALIZED_NAME_LOCALES = ["en", "ru"] as const;
export type LocalizedNameLocale = (typeof LOCALIZED_NAME_LOCALES)[number];

/**
 * Normalize an optional EN/RU name the same way on the client and the server.
 *
 * `value: null` means the field was left blank, which DELETES that locale's row
 * rather than storing '' — a blank translation would defeat
 * coalesce(tr.name, base.name) and render an empty topic label.
 */
export function parseLocalizedName(raw: unknown): {
  value: string | null;
  tooLong: boolean;
} {
  const name = normalizeName(raw);
  if (!name) return { value: null, tooLong: false };
  return { value: name, tooLong: name.length > NAME_MAX };
}

export const TERM_VALUES = [1, 2, 3, 4] as const;
export type Term = (typeof TERM_VALUES)[number];

export const CURRICULUM_STATUSES = ["active", "inactive", "archived"] as const;
export type CurriculumStatus = (typeof CURRICULUM_STATUSES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isTerm(value: unknown): value is Term {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 4
  );
}

/** "3" → 3; anything else → null. Used for both form input and searchParams. */
export function parseTerm(raw: unknown): Term | null {
  if (typeof raw === "number") return isTerm(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^[1-4]$/.test(trimmed)) return null;
  return Number(trimmed) as Term;
}

export function isCurriculumStatus(value: unknown): value is CurriculumStatus {
  return (
    typeof value === "string" &&
    (CURRICULUM_STATUSES as readonly string[]).includes(value)
  );
}

/** Trim + collapse internal whitespace. Applied before storing AND before the
 *  duplicate check, so "Ədəd  lər " and "Ədəd lər" can never both exist. */
export function normalizeName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case-folded comparison key. Azerbaijani casing is NOT the invariant one
 *  (İ→i, I→ı), so the locale is explicit — folding "IŞIQ" with the default
 *  locale would not match "ışıq". */
export function foldName(raw: unknown): string {
  return normalizeName(raw).toLocaleLowerCase("az");
}

export function sameName(a: unknown, b: unknown): boolean {
  return foldName(a) === foldName(b) && foldName(a) !== "";
}

/** 1-based page, clamped into [1, max(totalPages, 1)]. */
export function parsePageParam(raw: unknown, totalPages: number): number {
  const limit = Math.max(1, totalPages);
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, limit);
}

// ---------------------------------------------------------------------------
// Row shapes (what the server page hands to the client tree)
// ---------------------------------------------------------------------------

export type SubjectItem = {
  id: string;
  name: string;
  status: string;
};

export type GradeItem = {
  id: string;
  name: string;
  level: number;
};

export type TopicRow = {
  id: string;
  subjectId: string;
  gradeId: string | null;
  /** The AZ name — the authoring identity every importer and guard keys on. */
  name: string;
  /** topic_translations rows (114). null = not translated yet. */
  nameEn: string | null;
  nameRu: string | null;
  term: Term | null;
  status: string;
  orderIndex: number;
  /** Subtopics under this topic (whole tree, not just the loaded page). */
  subtopicCount: number;
  /** Questions whose topic_id points here — drives the delete block. */
  questionCount: number;
};

export type SubtopicRow = {
  id: string;
  topicId: string;
  name: string;
  nameEn: string | null;
  nameRu: string | null;
  term: Term | null;
  status: string;
  orderIndex: number;
};

/** Compact option for the subtopic form's parent-topic picker. Deliberately
 *  AZ-only: an admin picking a parent by an English label the importer cannot
 *  resolve would be a real footgun. */
export type TopicOption = {
  id: string;
  name: string;
  subjectId: string;
  gradeId: string | null;
  term: Term | null;
};

export type DeleteImpact = {
  /** Subtopics that CASCADE-delete with the topic (0 for a subtopic). */
  subtopics: number;
  /** Questions still pointing at this node — a non-zero count BLOCKS. */
  questions: number;
};

// ---------------------------------------------------------------------------
// Ordering + filtering (pure)
// ---------------------------------------------------------------------------

/** Sort key context: subject name order and grade level order, resolved by the
 *  caller from the already-loaded subject/grade catalogs. */
export type TopicOrderContext = {
  subjectOrder: ReadonlyMap<string, number>;
  gradeOrder: ReadonlyMap<string, number>;
};

const LAST = Number.MAX_SAFE_INTEGER;

/** Subject → grade → term → order_index → name. Unknown subject/grade and a
 *  NULL term sort LAST so unreviewed rows surface at the end of their group
 *  instead of masquerading as term 1. */
export function compareTopicRows(
  a: TopicRow,
  b: TopicRow,
  ctx: TopicOrderContext,
): number {
  const sa = ctx.subjectOrder.get(a.subjectId) ?? LAST;
  const sb = ctx.subjectOrder.get(b.subjectId) ?? LAST;
  if (sa !== sb) return sa - sb;

  const ga = a.gradeId ? ctx.gradeOrder.get(a.gradeId) ?? LAST : LAST;
  const gb = b.gradeId ? ctx.gradeOrder.get(b.gradeId) ?? LAST : LAST;
  if (ga !== gb) return ga - gb;

  const ta = a.term ?? LAST;
  const tb = b.term ?? LAST;
  if (ta !== tb) return ta - tb;

  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  return a.name.localeCompare(b.name, "az");
}

export function sortTopicRows(
  rows: readonly TopicRow[],
  ctx: TopicOrderContext,
): TopicRow[] {
  return [...rows].sort((a, b) => compareTopicRows(a, b, ctx));
}

/** Subtopics keep their authored order (order_index), then name. */
export function sortSubtopicRows(rows: readonly SubtopicRow[]): SubtopicRow[] {
  return [...rows].sort((a, b) =>
    a.orderIndex !== b.orderIndex
      ? a.orderIndex - b.orderIndex
      : a.name.localeCompare(b.name, "az"),
  );
}

/**
 * A topic stays visible when its OWN name matches the query or when at least
 * one of its subtopics matched (ancestors of a hit are never hidden — that is
 * the whole point of searching a tree). An empty query keeps everything.
 */
export function filterTopicsByQuery(
  topics: readonly TopicRow[],
  query: string,
  topicIdsWithMatchingSubtopic: ReadonlySet<string>,
): TopicRow[] {
  const q = foldName(query);
  if (!q) return [...topics];
  return topics.filter(
    (t) => foldName(t.name).includes(q) || topicIdsWithMatchingSubtopic.has(t.id),
  );
}

/** Consecutive same-subject topics collapse into one rendered group header. */
export type TopicGroup = {
  subjectId: string;
  topics: TopicRow[];
};

export function groupTopicsBySubject(rows: readonly TopicRow[]): TopicGroup[] {
  const groups: TopicGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.subjectId === row.subjectId) last.topics.push(row);
    else groups.push({ subjectId: row.subjectId, topics: [row] });
  }
  return groups;
}

/** Inclusive 0-based slice bounds for a 1-based page. */
export function pageSlice(
  total: number,
  page: number,
  size: number = TOPIC_PAGE_SIZE,
): { from: number; to: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = parsePageParam(page, totalPages);
  const from = (safePage - 1) * size;
  return { from, to: Math.min(from + size, total), totalPages };
}
