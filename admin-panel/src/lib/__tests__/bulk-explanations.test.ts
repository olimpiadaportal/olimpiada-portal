// MULTILINGUAL EXPLANATIONS in the bulk-import templates and validators.
//
// What broke before: `question_explanations` has been trilingual by SHAPE since
// 004 (`unique (question_id, locale)`), but ALL FOUR downloadable templates
// (general|olympiad × text|mixed) share one constant that carried `explanation`
// on `az` only. Admins generate their files FROM that template, so the bank
// filled up with az-only explanations and every EN/RU reader got the Azerbaijani
// text with a "not translated yet" badge. These specs pin the template shape
// itself, because it is the only thing that teaches the format.
//
// The second half pins BACKWARD COMPATIBILITY: an older file — one explanation
// string, or none at all — must keep importing exactly as it did, landing at
// the primary locale. Admins keep saved templates and re-upload old batches.
import { describe, expect, it } from "vitest";
import {
  BULK_TEMPLATE_GENERAL,
  BULK_TEMPLATE_GENERAL_MIXED,
  BULK_TEMPLATE_OLYMPIAD,
  BULK_TEMPLATE_OLYMPIAD_MIXED,
  BULK_TEXT_MAX,
  bulkTemplateFor,
  validateBulkRowsClient,
  type ClientTypeRule,
} from "../bulk-client";
import { validateBulkItem, type ActiveTypeRule } from "../admin/bulk-validate";

const tt = (k: string) => k;

const rules: ClientTypeRule[] = [
  { code: "single_choice", name: "Single choice", options_required: 5, correct_required: 1 },
];
const serverRule: ActiveTypeRule = rules[0];
const activeByNorm = new Map<string, ActiveTypeRule>([["single_choice", serverRule]]);

const TEMPLATES = {
  "general / text": BULK_TEMPLATE_GENERAL,
  "general / mixed": BULK_TEMPLATE_GENERAL_MIXED,
  "olympiad / text": BULK_TEMPLATE_OLYMPIAD,
  "olympiad / mixed": BULK_TEMPLATE_OLYMPIAD_MIXED,
} as const;

type TemplateRow = {
  translations: Record<string, { body?: string; explanation?: string } | undefined>;
};

/** A structurally valid general-bank row; `translations` is supplied per test. */
function row(translations: Record<string, unknown>) {
  return {
    primary_locale: "az",
    meta: { topic: "Toplama", subtopic: "Birrəqəmli ədədlər", term: 1 },
    translations,
    options: [
      { is_correct: true, order_index: 0, text: { az: "4" } },
      { is_correct: false, order_index: 1, text: { az: "3" } },
      { is_correct: false, order_index: 2, text: { az: "5" } },
      { is_correct: false, order_index: 3, text: { az: "6" } },
      { is_correct: false, order_index: 4, text: { az: "7" } },
    ],
  };
}

const clientIssues = (item: unknown) =>
  validateBulkRowsClient([item], tt, rules, "general");
const serverIssue = (item: unknown) =>
  validateBulkItem(item, tt, activeByNorm, serverRule, "general");

describe("every template type carries an explanation per locale", () => {
  it.each(Object.entries(TEMPLATES))("%s", (_name, template) => {
    const rows = template as unknown as TemplateRow[];
    expect(rows).toHaveLength(1);
    for (const loc of ["az", "en", "ru"] as const) {
      const tr = rows[0].translations[loc];
      expect(tr?.explanation?.trim(), `${loc} explanation`).toBeTruthy();
    }
  });

  // Not the same sentence three times: a template that repeated the az text
  // would teach "translating an explanation means copying it across".
  it("uses a real sentence per language, not one string repeated", () => {
    const rows = BULK_TEMPLATE_GENERAL as unknown as TemplateRow[];
    const texts = (["az", "en", "ru"] as const).map(
      (l) => rows[0].translations[l]?.explanation,
    );
    expect(new Set(texts).size).toBe(3);
  });

  // bulkTemplateFor is what the download button and the on-screen olympiad
  // format block both call, so covering it covers both surfaces.
  it.each([
    ["general", "text"],
    ["general", "mixed"],
    ["olympiad", "text"],
    ["olympiad", "mixed"],
  ] as const)("bulkTemplateFor(%s, %s) resolves to a trilingual row", (mode, qMode) => {
    const rows = bulkTemplateFor(mode, qMode) as unknown as TemplateRow[];
    for (const loc of ["az", "en", "ru"] as const) {
      expect(rows[0].translations[loc]?.explanation?.trim()).toBeTruthy();
    }
  });

  it("the general text-only template still validates as-is", () => {
    expect(validateBulkRowsClient(BULK_TEMPLATE_GENERAL, tt, rules, "general")).toEqual([]);
    expect(serverIssue(BULK_TEMPLATE_GENERAL[0])).toBeNull();
  });
});

describe("backward compatibility — older files keep importing", () => {
  it("accepts a row with a single az explanation (the pre-change shape)", () => {
    const item = row({ az: { body: "2 + 2 = ?", explanation: "2 + 2 = 4" } });
    expect(clientIssues(item)).toEqual([]);
    expect(serverIssue(item)).toBeNull();
  });

  it("accepts a row with no explanation at all", () => {
    const item = row({ az: { body: "2 + 2 = ?" } });
    expect(clientIssues(item)).toEqual([]);
    expect(serverIssue(item)).toBeNull();
  });

  it("accepts en/ru blocks that carry only a body (no explanation)", () => {
    const item = row({
      az: { body: "2 + 2 = ?", explanation: "2 + 2 = 4" },
      en: { body: "What is 2 + 2?" },
      ru: { body: "Сколько будет 2 + 2?" },
    });
    expect(clientIssues(item)).toEqual([]);
    expect(serverIssue(item)).toBeNull();
  });
});

describe("per-locale length caps (both validators agree)", () => {
  const long = "x".repeat(BULK_TEXT_MAX + 1);
  const ok = "x".repeat(BULK_TEXT_MAX);

  // The gap this closes: only the PRIMARY locale's explanation was ever
  // measured, and question_explanations.explanation_body has no length
  // constraint — so an en/ru explanation was bounded by nothing but the 2 MB
  // whole-file limit. The templates now push real volume down that path.
  it.each(["az", "en", "ru"] as const)("rejects an over-long %s explanation", (loc) => {
    const item = row({
      az: { body: "2 + 2 = ?" },
      [loc]: { body: "2 + 2 = ?", explanation: long },
    });
    expect(clientIssues(item)).toEqual([{ row: 1, message: "bulk.err.tooLong" }]);
    expect(serverIssue(item)).toBe("bulk.err.tooLong");
  });

  it("accepts an explanation exactly at the cap", () => {
    const item = row({
      az: { body: "2 + 2 = ?", explanation: ok },
      ru: { body: "Сколько будет 2 + 2?", explanation: ok },
    });
    expect(clientIssues(item)).toEqual([]);
    expect(serverIssue(item)).toBeNull();
  });

  it("reports an over-long row ONCE even when several locales exceed the cap", () => {
    const item = row({
      az: { body: "2 + 2 = ?", explanation: long },
      en: { body: "What is 2 + 2?", explanation: long },
      ru: { body: "Сколько будет 2 + 2?", explanation: long },
    });
    expect(clientIssues(item)).toEqual([{ row: 1, message: "bulk.err.tooLong" }]);
  });
});
