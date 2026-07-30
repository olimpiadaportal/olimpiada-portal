// Round 52 (§6) — the BROWSER mirror of the curriculum checks. It must agree
// with src/lib/admin/bulk-validate.ts, otherwise the modal enables the Import
// button for a file the server then rejects row by row (the exact confusion
// this pre-check exists to prevent). The two files cannot share code — the
// server copy imports the server-only i18n module — so the agreement is tested.
import { describe, expect, it } from "vitest";
import {
  buildClientCurriculumIndex,
  validateBulkRowsClient,
  type ClientTypeRule,
} from "../bulk-client";

const tt = (k: string) => k;

const rules: ClientTypeRule[] = [
  {
    code: "single_choice",
    name: "Single choice",
    options_required: 5,
    correct_required: 1,
  },
];

const curriculum = buildClientCurriculumIndex([
  { name: "Toplama", term: 1, subtopics: ["Birrəqəmli ədədlər"] },
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

const messages = (meta: Record<string, unknown>, cur = curriculum) =>
  validateBulkRowsClient([row(meta)], tt, rules, "general", cur).map(
    (i) => i.message,
  );

describe("validateBulkRowsClient — curriculum matching", () => {
  it("passes a fully valid row", () => {
    expect(
      messages({ topic: "Toplama", subtopic: "Birrəqəmli ədədlər", term: 1 }),
    ).toEqual([]);
  });

  it("flags an unknown topic", () => {
    expect(
      messages({ topic: "Nonexistent", subtopic: "Birrəqəmli ədədlər", term: 1 }),
    ).toContain("bulk.err.topicNotFound");
  });

  it("flags a subtopic from another topic", () => {
    expect(messages({ topic: "Toplama", subtopic: "Üçbucaq", term: 1 })).toContain(
      "bulk.err.subtopicNotFound",
    );
  });

  it("flags a term that disagrees with its topic", () => {
    expect(
      messages({ topic: "Toplama", subtopic: "Birrəqəmli ədədlər", term: 3 }),
    ).toContain("bulk.err.termConflict");
  });

  it("separates a missing term from an invalid one", () => {
    const base = { topic: "Toplama", subtopic: "Birrəqəmli ədədlər" };
    expect(messages(base)).toContain("bulk.err.termRequired");
    expect(messages({ ...base, term: 7 })).toContain("bulk.err.invalidTerm");
    expect(messages({ ...base, term: "one" })).toContain("bulk.err.invalidTerm");
  });

  it("reports the row number so the admin can find it", () => {
    const issues = validateBulkRowsClient(
      [
        row({ topic: "Toplama", subtopic: "Birrəqəmli ədədlər", term: 1 }),
        row({ topic: "Bad", subtopic: "Birrəqəmli ədədlər", term: 1 }),
      ],
      tt,
      rules,
      "general",
      curriculum,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].row).toBe(2);
  });

  it("skips curriculum checks without an index (unchanged legacy behaviour)", () => {
    expect(
      validateBulkRowsClient(
        [row({ topic: "Anything", subtopic: "At all", term: 2 })],
        tt,
        rules,
        "general",
      ),
    ).toEqual([]);
  });

  it("leaves olympiad pools untouched", () => {
    expect(
      validateBulkRowsClient([row({})], tt, rules, "olympiad", curriculum),
    ).toEqual([]);
  });
});
