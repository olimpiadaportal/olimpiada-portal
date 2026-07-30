// Round 52 (§6) — curriculum matching + the three owner-specified import
// errors. These decide whether a generated batch lands in the question bank or
// silently creates a misspelled topic, so the hostile shapes an AI model
// actually produces (invented names, term 5, term "one", a subtopic borrowed
// from another topic) are tested explicitly.
import { describe, expect, it } from "vitest";
import {
  buildCurriculumIndex,
  canonicalCurriculumNames,
  normCurriculumName,
  validateBulkItem,
  type ActiveTypeRule,
} from "../bulk-validate";

// The validator only ever calls t(key); returning the key makes assertions read
// as the message identity rather than one language's wording.
const t = ((k: string) => k) as unknown as Parameters<typeof validateBulkItem>[1];

const singleChoice: ActiveTypeRule = {
  code: "single_choice",
  name: "Single choice",
  options_required: 5,
  correct_required: 1,
};
const activeByNorm = new Map<string, ActiveTypeRule>([
  ["single_choice", singleChoice],
]);

const curriculum = buildCurriculumIndex([
  {
    name: "Toplama",
    term: 1,
    subtopics: ["Birrəqəmli ədədlər", "İkirəqəmli ədədlər"],
  },
  { name: "Həndəsi fiqurlar", term: 3, subtopics: ["Üçbucaq"] },
]);

function row(meta: Record<string, unknown>) {
  return {
    primary_locale: "az",
    meta,
    translations: { az: { body: "2 + 2 = ?" } },
    options: [0, 1, 2, 3, 4].map((i) => ({
      is_correct: i === 0,
      order_index: i,
      text: { az: `opt ${i}` },
    })),
  };
}

const check = (meta: Record<string, unknown>, cur = curriculum) =>
  validateBulkItem(row(meta), t, activeByNorm, singleChoice, "general", cur);

describe("validateBulkItem — curriculum matching", () => {
  it("accepts a row that names a real topic, subtopic and its term", () => {
    expect(
      check({ topic: "Toplama", subtopic: "Birrəqəmli ədədlər", term: 1 }),
    ).toBeNull();
  });

  it("ignores surrounding whitespace and case", () => {
    expect(normCurriculumName("  Toplama   və   çıxma ")).toBe(
      "toplama və çıxma",
    );
    expect(
      check({ topic: "  toplama ", subtopic: "birrəqəmli   ədədlər", term: 1 }),
    ).toBeNull();
  });

  // Azerbaijani casing, not the invariant one: the fold is curriculum-shared's
  // foldName. With the default locale "İ" lowercases to "i" + U+0307 and an
  // uppercased name would never match itself.
  it("matches an UPPERCASED Azerbaijani name (the İ trap)", () => {
    expect(normCurriculumName("BİRRƏQƏMLİ ƏDƏDLƏR")).toBe(
      "birrəqəmli ədədlər",
    );
    expect(
      check({ topic: "TOPLAMA", subtopic: "BİRRƏQƏMLİ ƏDƏDLƏR", term: 1 }),
    ).toBeNull();
  });

  // I folds to ı and İ folds to i, so the two spellings below are genuinely
  // different names and must NOT match each other.
  it("keeps dotless ı and dotted i apart", () => {
    expect(normCurriculumName("IŞIQ")).toBe("ışıq");
    expect(normCurriculumName("İŞIQ")).toBe("işıq");
    const index = buildCurriculumIndex([
      { name: "IŞIQ", term: 2, subtopics: ["Kölgə"] },
    ]);
    expect(check({ topic: "İŞIQ", subtopic: "Kölgə", term: 2 }, index)).toBe(
      "bulk.err.topicNotFound",
    );
    expect(check({ topic: "ışıq", subtopic: "Kölgə", term: 2 }, index)).toBeNull();
  });

  it("rejects an invented topic with Topic not found", () => {
    expect(
      check({ topic: "Kvant fizikası", subtopic: "Birrəqəmli ədədlər", term: 1 }),
    ).toBe("bulk.err.topicNotFound");
  });

  it("rejects a subtopic that belongs to a different topic", () => {
    expect(check({ topic: "Toplama", subtopic: "Üçbucaq", term: 1 })).toBe(
      "bulk.err.subtopicNotFound",
    );
  });

  it("rejects a term that disagrees with the topic", () => {
    expect(
      check({ topic: "Toplama", subtopic: "Birrəqəmli ədədlər", term: 4 }),
    ).toBe("bulk.err.termConflict");
  });

  it("falls back to schema-only checks when no curriculum is supplied", () => {
    expect(
      validateBulkItem(
        row({ topic: "Invented", subtopic: "Also invented", term: 2 }),
        t,
        activeByNorm,
        singleChoice,
        "general",
        null,
      ),
    ).toBeNull();
  });

  it("never applies curriculum rules to olympiad pools", () => {
    expect(
      validateBulkItem(
        row({}),
        t,
        activeByNorm,
        singleChoice,
        "olympiad",
        curriculum,
      ),
    ).toBeNull();
  });
});

describe("validateBulkItem — term messages", () => {
  const base = { topic: "Toplama", subtopic: "Birrəqəmli ədədlər" };

  it("reports a MISSING term as required", () => {
    expect(check(base)).toBe("bulk.err.termRequired");
    expect(check({ ...base, term: "" })).toBe("bulk.err.termRequired");
    expect(check({ ...base, term: null })).toBe("bulk.err.termRequired");
  });

  it("reports a PRESENT but out-of-range term as invalid", () => {
    for (const bad of [0, 5, -1, 1.5, "one", true, {}]) {
      expect(check({ ...base, term: bad })).toBe("bulk.err.invalidTerm");
    }
  });

  it("accepts a numeric string term", () => {
    expect(check({ ...base, term: "1" })).toBeNull();
  });

  it("still requires topic and subtopic before looking at the term", () => {
    expect(check({ subtopic: "Birrəqəmli ədədlər", term: 1 })).toBe(
      "bulk.err.topicRequired",
    );
    expect(check({ topic: "Toplama", term: 1 })).toBe(
      "bulk.err.subtopicRequired",
    );
  });
});

describe("buildCurriculumIndex", () => {
  it("normalizes names for lookup", () => {
    expect(normCurriculumName("  Toplama   və   çıxma ")).toBe(
      "toplama və çıxma",
    );
  });

  it("merges duplicate topic names instead of dropping subtopics", () => {
    const index = buildCurriculumIndex([
      { name: "Toplama", term: 1, subtopics: ["A"] },
      { name: "toplama", term: 1, subtopics: ["B"] },
    ]);
    expect(index.size).toBe(1);
    expect(index.get("toplama")?.subtopics.has("a")).toBe(true);
    expect(index.get("toplama")?.subtopics.has("b")).toBe(true);
  });

  it("skips blank names", () => {
    expect(buildCurriculumIndex([{ name: "  ", term: 1, subtopics: [] }]).size).toBe(0);
  });
});

// The RPC matches topics.name literally, so a leniently-accepted row must be
// rewritten to the DB spelling or the import forks the tree with a duplicate.
describe("canonicalCurriculumNames", () => {
  it("returns the DB spelling for a loosely-typed pair", () => {
    expect(
      canonicalCurriculumNames(curriculum, " TOPLAMA ", "birrəqəmli ədədlər"),
    ).toEqual({ topic: "Toplama", subtopic: "Birrəqəmli ədədlər" });
  });

  it("returns null for names the validator would have rejected", () => {
    expect(canonicalCurriculumNames(curriculum, "Nope", "Üçbucaq")).toBeNull();
    expect(canonicalCurriculumNames(curriculum, "Toplama", "Üçbucaq")).toBeNull();
  });
});
