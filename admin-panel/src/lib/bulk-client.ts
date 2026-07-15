// Client-side bulk-import helpers shared by the BulkUploadModal (general
// question bank + olympiad create flow) and the New-Package create flow.
// Plain client-safe module (no "use server"): everything here is a UX
// pre-check only — the SECURITY DEFINER bulk RPCs and the server actions in
// src/lib/admin remain the authority (assert_question_type_rules etc.).
//
// v3 (Round 21):
//   * GENERAL rows REQUIRE meta.topic + meta.subtopic + meta.term (1..4);
//     meta.type is optional (defaults to single_choice — exactly 5 options,
//     exactly 1 correct). Optional meta.media_asset_id (uuid of a pre-uploaded
//     question-media asset) attaches the primary locale's image.
//   * OLYMPIAD rows keep topic/subtopic/term OPTIONAL; 5 options still apply.

export type BulkClientMode = "general" | "olympiad";

export type ClientTypeRule = {
  code: string;
  name: string;
  options_required: number | null;
  correct_required: number | null;
};

export type RowIssue = { row: number; message: string };

export const BULK_MAX_FILE_BYTES = 2 * 1024 * 1024;

// Five A–E options (exactly one correct) — the single_choice shape enforced by
// the DB since migration 055; both templates model exactly that.
const TEMPLATE_OPTIONS = [
  { is_correct: true, order_index: 0, text: { az: "4", en: "4", ru: "4" } },
  { is_correct: false, order_index: 1, text: { az: "3", en: "3", ru: "3" } },
  { is_correct: false, order_index: 2, text: { az: "5", en: "5", ru: "5" } },
  { is_correct: false, order_index: 3, text: { az: "6", en: "6", ru: "6" } },
  { is_correct: false, order_index: 4, text: { az: "7", en: "7", ru: "7" } },
];

const TEMPLATE_TRANSLATIONS = {
  az: { body: "2 + 2 = ?", prompt: "Düzgün cavabı seçin", explanation: "2 + 2 = 4" },
  en: { body: "2 + 2 = ?", prompt: "Choose the correct answer" },
  ru: { body: "2 + 2 = ?", prompt: "Выберите правильный ответ" },
};

// GENERAL template: per-item meta has NO subject and NO grade_level — the
// batch supplies both from the modal selects. topic + subtopic + term (1..4)
// are REQUIRED; meta.type is optional (single_choice by default) and
// meta.media_asset_id (uuid of a pre-uploaded question-media asset, primary
// locale's image) is optional — both omitted here on purpose.
export const BULK_TEMPLATE_GENERAL = [
  {
    primary_locale: "az",
    meta: {
      topic: "Toplama",
      subtopic: "Birrəqəmli ədədlər",
      term: 1,
    },
    translations: TEMPLATE_TRANSLATIONS,
    options: TEMPLATE_OPTIONS,
  },
];

// OLYMPIAD template: subject + grade come from the PACKAGE; topic/subtopic/
// term are optional (term is ignored for package pools), so the minimal item
// carries only translations + the 5 options.
export const BULK_TEMPLATE_OLYMPIAD = [
  {
    primary_locale: "az",
    meta: {
      olympiad_type: "School",
    },
    translations: TEMPLATE_TRANSLATIONS,
    options: TEMPLATE_OPTIONS,
  },
];

// Case/space-insensitive normalization so "Multiple choice", "multiple_choice"
// and "Multiple  Choice" all resolve to the same active type.
export function normClientTypeName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "_");
}

// Serializes the mode's template for download in the browser.
export function downloadBulkTemplate(
  filename: string,
  mode: BulkClientMode = "general",
): void {
  const template =
    mode === "olympiad" ? BULK_TEMPLATE_OLYMPIAD : BULK_TEMPLATE_GENERAL;
  const blob = new Blob([JSON.stringify(template, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Parses + size-checks the chosen file. Returns either a fatal file-level
// error message key result or the parsed items array.
export async function parseBulkFile(
  f: File,
  tt: (k: string) => string,
): Promise<{ error: string } | { items: unknown[] }> {
  if (f.size > BULK_MAX_FILE_BYTES) return { error: tt("bulk.tooLarge") };
  let data: unknown;
  try {
    data = JSON.parse(await f.text());
  } catch {
    return { error: tt("bulk.invalidJson") };
  }
  if (!Array.isArray(data)) return { error: tt("bulk.notArray") };
  if (data.length === 0) return { error: tt("bulk.emptyArray") };
  return { items: data };
}

// Mirrors the server's 1..4 term parsing (number or numeric string).
function parseClientTerm(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) {
    return v >= 1 && v <= 4 ? v : null;
  }
  if (typeof v === "string" && /^[1-4]$/.test(v.trim())) return Number(v.trim());
  return null;
}

// Per-row structural pre-validation (mirror of the server's bulk-validate
// rules): primary-locale body, GENERAL-mode topic/subtopic/term requirements,
// options array, per-type option/correct counts (single_choice = exactly 5
// options / exactly 1 correct via the active-type rules), non-empty az option
// texts. Returns one issue list for display.
export function validateBulkRowsClient(
  data: unknown[],
  tt: (k: string) => string,
  rules: ClientTypeRule[],
  mode: BulkClientMode = "general",
): RowIssue[] {
  const activeByNorm = new Map<string, ClientTypeRule>();
  for (const r of rules) activeByNorm.set(normClientTypeName(r.name), r);
  // Default for rows that omit meta.type = single_choice (matches the RPCs).
  const defaultType: ClientTypeRule | null =
    rules.find((r) => r.code === "single_choice") ?? rules[0] ?? null;

  const issues: RowIssue[] = [];
  data.forEach((item, i) => {
    const row = i + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ row, message: tt("bulk.err.notObject") });
      return;
    }
    const it = item as {
      primary_locale?: unknown;
      meta?: { type?: unknown; topic?: unknown; subtopic?: unknown; term?: unknown };
      translations?: Record<string, { body?: unknown } | undefined>;
      options?: unknown;
    };

    // Required primary-locale body (defaults to az).
    const plRaw = typeof it.primary_locale === "string" ? it.primary_locale : "az";
    const pl = ["az", "en", "ru"].includes(plRaw) ? plRaw : "az";
    const body = it.translations?.[pl]?.body;
    if (typeof body !== "string" || body.trim() === "") {
      issues.push({ row, message: tt("bulk.err.noAzBody") });
    }

    // GENERAL mode: topic + subtopic + term (1..4) are required per row.
    if (mode === "general") {
      const topic = it.meta?.topic;
      if (typeof topic !== "string" || topic.trim() === "") {
        issues.push({ row, message: tt("bulk.err.topicRequired") });
      }
      const subtopic = it.meta?.subtopic;
      if (typeof subtopic !== "string" || subtopic.trim() === "") {
        issues.push({ row, message: tt("bulk.err.subtopicRequired") });
      }
      if (parseClientTerm(it.meta?.term) == null) {
        issues.push({ row, message: tt("bulk.err.termRequired") });
      }
    }

    if (!Array.isArray(it.options)) {
      issues.push({ row, message: tt("bulk.err.optionsArray") });
      return;
    }
    const opts = it.options as { is_correct?: unknown; text?: { az?: unknown } }[];

    // Resolve the type rule (mirror of the server). Missing/empty type →
    // single_choice; a named type must match an active one.
    const typeRaw = it.meta?.type;
    let rule: ClientTypeRule | null;
    if (typeRaw == null || (typeof typeRaw === "string" && typeRaw.trim() === "")) {
      rule = defaultType;
    } else if (typeof typeRaw === "string") {
      rule = activeByNorm.get(normClientTypeName(typeRaw)) ?? null;
      if (!rule) {
        issues.push({ row, message: tt("bulk.err.unknownType") });
        return;
      }
    } else {
      issues.push({ row, message: tt("bulk.err.unknownType") });
      return;
    }

    if (rule?.options_required != null && opts.length !== rule.options_required) {
      issues.push({
        row,
        message: tt("bulk.err.optionCount")
          .replace("{n}", String(rule.options_required))
          .replace("{got}", String(opts.length)),
      });
    }
    if (rule?.correct_required != null) {
      const correct = opts.filter((o) => o && o.is_correct === true).length;
      if (correct !== rule.correct_required) {
        issues.push({
          row,
          message: tt("bulk.err.correctCount")
            .replace("{n}", String(rule.correct_required))
            .replace("{got}", String(correct)),
        });
      }
    }
    // Each option needs a non-empty az text.
    for (let k = 0; k < opts.length; k++) {
      const az = opts[k]?.text?.az;
      if (typeof az !== "string" || az.trim() === "") {
        issues.push({
          row,
          message: tt("bulk.err.optionText").replace("{i}", String(k + 1)),
        });
        break;
      }
    }
  });
  return issues;
}
