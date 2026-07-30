import { describe, expect, it } from "vitest";
import {
  TOPIC_PAGE_SIZE,
  compareTopicRows,
  filterTopicsByQuery,
  foldName,
  groupTopicsBySubject,
  isCurriculumStatus,
  isTerm,
  isUuid,
  normalizeName,
  pageSlice,
  parsePageParam,
  parseTerm,
  sameName,
  sortSubtopicRows,
  sortTopicRows,
  type SubtopicRow,
  type TopicOrderContext,
  type TopicRow,
} from "../curriculum-shared";

// The Curriculum Structure page pushes every decision that is not a database
// query into these pure helpers, so this file is where the tree's behaviour is
// actually pinned down: validation of client-supplied ids/enums, Azerbaijani
// case folding (the duplicate check depends on it), the search-keeps-ancestors
// rule and the ordering/pagination the server uses before it decides which
// subtopics to fetch.

const SUBJECT_MATH = "11111111-1111-4111-8111-111111111111";
const SUBJECT_ENG = "22222222-2222-4222-8222-222222222222";
const GRADE_1 = "33333333-3333-4333-8333-333333333333";
const GRADE_5 = "44444444-4444-4444-8444-444444444444";

const ctx: TopicOrderContext = {
  // Subject display order (as the page builds it: index in the ordered list).
  subjectOrder: new Map([
    [SUBJECT_ENG, 0],
    [SUBJECT_MATH, 1],
  ]),
  // Grade order is the school level, not an index.
  gradeOrder: new Map([
    [GRADE_1, 1],
    [GRADE_5, 5],
  ]),
};

function topic(partial: Partial<TopicRow> & { id: string }): TopicRow {
  return {
    subjectId: SUBJECT_MATH,
    gradeId: GRADE_1,
    name: "T",
    term: 1,
    status: "active",
    orderIndex: 0,
    subtopicCount: 0,
    questionCount: 0,
    ...partial,
  };
}

function subtopic(
  partial: Partial<SubtopicRow> & { id: string },
): SubtopicRow {
  return {
    topicId: "t",
    name: "S",
    term: 1,
    status: "active",
    orderIndex: 0,
    ...partial,
  };
}

describe("input validation", () => {
  it("accepts a well-formed uuid and rejects everything else", () => {
    expect(isUuid(SUBJECT_MATH)).toBe(true);
    expect(isUuid(SUBJECT_MATH.toUpperCase())).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(`${SUBJECT_MATH} or 1=1`)).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });

  it("only treats integers 1..4 as a term", () => {
    expect(isTerm(1)).toBe(true);
    expect(isTerm(4)).toBe(true);
    expect(isTerm(0)).toBe(false);
    expect(isTerm(5)).toBe(false);
    expect(isTerm(2.5)).toBe(false);
    expect(isTerm("2")).toBe(false);
    expect(isTerm(null)).toBe(false);
  });

  it("parses a term from form/search-param strings", () => {
    expect(parseTerm("3")).toBe(3);
    expect(parseTerm(" 3 ")).toBe(3);
    expect(parseTerm(3)).toBe(3);
    expect(parseTerm("0")).toBeNull();
    expect(parseTerm("5")).toBeNull();
    expect(parseTerm("03")).toBeNull();
    expect(parseTerm("")).toBeNull();
    expect(parseTerm("none")).toBeNull();
    expect(parseTerm(undefined)).toBeNull();
  });

  it("whitelists catalog statuses", () => {
    expect(isCurriculumStatus("active")).toBe(true);
    expect(isCurriculumStatus("inactive")).toBe(true);
    expect(isCurriculumStatus("archived")).toBe(true);
    expect(isCurriculumStatus("published")).toBe(false);
    expect(isCurriculumStatus("")).toBe(false);
    expect(isCurriculumStatus(undefined)).toBe(false);
  });
});

describe("name normalization and folding", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeName("  Ədədlər   və  say  ")).toBe("Ədədlər və say");
    expect(normalizeName("\tSay\nsistemi ")).toBe("Say sistemi");
    expect(normalizeName(undefined)).toBe("");
  });

  it("folds case with Azerbaijani rules (İ→i, I→ı)", () => {
    // The invariant lowercase of "I" is "i", which would NOT match "ışıq".
    expect(foldName("IŞIQ")).toBe(foldName("ışıq"));
    expect(foldName("İnformatika")).toBe(foldName("informatika"));
    expect(foldName("  Ədəd   Lər ")).toBe("ədəd lər");
  });

  it("treats differently-spaced/cased names as the same name", () => {
    expect(sameName("Say Sistemi", "  say   sistemi  ")).toBe(true);
    expect(sameName("İnformatika", "informatika")).toBe(true);
    expect(sameName("Kəsrlər", "Kəsr")).toBe(false);
    // An empty name is never "the same" as anything — the required-field check
    // owns that case, not the duplicate check.
    expect(sameName("", "")).toBe(false);
    expect(sameName("   ", "")).toBe(false);
  });
});

describe("pagination", () => {
  it("clamps the page parameter into range", () => {
    expect(parsePageParam("1", 5)).toBe(1);
    expect(parsePageParam("3", 5)).toBe(3);
    expect(parsePageParam("99", 5)).toBe(5);
    expect(parsePageParam("0", 5)).toBe(1);
    expect(parsePageParam("-2", 5)).toBe(1);
    expect(parsePageParam("2.5", 5)).toBe(1);
    expect(parsePageParam("abc", 5)).toBe(1);
    expect(parsePageParam(undefined, 5)).toBe(1);
    // Empty result set: there is still exactly one (empty) page.
    expect(parsePageParam("4", 0)).toBe(1);
  });

  it("computes slice bounds and never returns page 0", () => {
    expect(pageSlice(100, 1, 40)).toEqual({ from: 0, to: 40, totalPages: 3 });
    expect(pageSlice(100, 3, 40)).toEqual({ from: 80, to: 100, totalPages: 3 });
    // Out-of-range page falls back to the last page rather than an empty slice.
    expect(pageSlice(100, 9, 40)).toEqual({ from: 80, to: 100, totalPages: 3 });
    expect(pageSlice(0, 1, 40)).toEqual({ from: 0, to: 0, totalPages: 1 });
  });

  it("defaults to the page size the tree is budgeted for", () => {
    expect(pageSlice(1000, 2).from).toBe(TOPIC_PAGE_SIZE);
  });
});

describe("topic ordering", () => {
  it("orders by subject, then grade, then term, then order_index, then name", () => {
    const rows: TopicRow[] = [
      topic({ id: "math-g5-t1", subjectId: SUBJECT_MATH, gradeId: GRADE_5, term: 1 }),
      topic({ id: "math-g1-t2", subjectId: SUBJECT_MATH, gradeId: GRADE_1, term: 2 }),
      topic({ id: "math-g1-t1", subjectId: SUBJECT_MATH, gradeId: GRADE_1, term: 1 }),
      topic({ id: "eng-g1-t1", subjectId: SUBJECT_ENG, gradeId: GRADE_1, term: 1 }),
    ];
    expect(sortTopicRows(rows, ctx).map((r) => r.id)).toEqual([
      "eng-g1-t1",
      "math-g1-t1",
      "math-g1-t2",
      "math-g5-t1",
    ]);
  });

  it("breaks ties on order_index before name", () => {
    const rows: TopicRow[] = [
      topic({ id: "b", name: "Alfa", orderIndex: 2 }),
      topic({ id: "a", name: "Zeta", orderIndex: 1 }),
    ];
    expect(sortTopicRows(rows, ctx).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("sorts unreviewed (NULL term) and grade-less topics last within their group", () => {
    const rows: TopicRow[] = [
      topic({ id: "no-term", term: null }),
      topic({ id: "term-4", term: 4 }),
      topic({ id: "term-1", term: 1 }),
    ];
    expect(sortTopicRows(rows, ctx).map((r) => r.id)).toEqual([
      "term-1",
      "term-4",
      "no-term",
    ]);

    const shared = topic({ id: "shared", gradeId: null, term: 1 });
    const graded = topic({ id: "graded", gradeId: GRADE_5, term: 1 });
    expect(compareTopicRows(graded, shared, ctx)).toBeLessThan(0);
  });

  it("does not mutate the input array", () => {
    const rows: TopicRow[] = [topic({ id: "b", name: "B" }), topic({ id: "a", name: "A" })];
    sortTopicRows(rows, ctx);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("subtopic ordering", () => {
  it("keeps the authored order_index, falling back to the name", () => {
    const rows = [
      subtopic({ id: "c", name: "Alfa", orderIndex: 3 }),
      subtopic({ id: "a", name: "Zeta", orderIndex: 1 }),
      subtopic({ id: "b", name: "Beta", orderIndex: 1 }),
    ];
    expect(sortSubtopicRows(rows).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("search: ancestors of a match stay visible", () => {
  const rows: TopicRow[] = [
    topic({ id: "t1", name: "Ədədlər" }),
    topic({ id: "t2", name: "Həndəsə" }),
    topic({ id: "t3", name: "Kəsrlər" }),
  ];

  it("keeps everything when the query is empty", () => {
    expect(filterTopicsByQuery(rows, "", new Set()).map((r) => r.id)).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
    expect(filterTopicsByQuery(rows, "   ", new Set())).toHaveLength(3);
  });

  it("matches topic names case- and whitespace-insensitively", () => {
    expect(filterTopicsByQuery(rows, "ƏDƏD", new Set()).map((r) => r.id)).toEqual([
      "t1",
    ]);
    expect(filterTopicsByQuery(rows, " kəsr ", new Set()).map((r) => r.id)).toEqual([
      "t3",
    ]);
  });

  it("keeps a topic whose SUBTOPIC matched even when its own name does not", () => {
    // "Həndəsə" does not contain the query, but one of its subtopics did.
    const withHits = filterTopicsByQuery(rows, "üçbucaq", new Set(["t2"]));
    expect(withHits.map((r) => r.id)).toEqual(["t2"]);
  });

  it("unions name hits and subtopic hits without duplicating a topic", () => {
    const result = filterTopicsByQuery(rows, "ədəd", new Set(["t1", "t3"]));
    expect(result.map((r) => r.id)).toEqual(["t1", "t3"]);
  });
});

describe("grouping by subject", () => {
  it("collapses consecutive same-subject topics into one group", () => {
    const rows: TopicRow[] = [
      topic({ id: "e1", subjectId: SUBJECT_ENG }),
      topic({ id: "m1", subjectId: SUBJECT_MATH }),
      topic({ id: "m2", subjectId: SUBJECT_MATH }),
    ];
    const groups = groupTopicsBySubject(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].subjectId).toBe(SUBJECT_ENG);
    expect(groups[1].topics.map((r) => r.id)).toEqual(["m1", "m2"]);
  });

  it("returns no groups for an empty page", () => {
    expect(groupTopicsBySubject([])).toEqual([]);
  });
});
