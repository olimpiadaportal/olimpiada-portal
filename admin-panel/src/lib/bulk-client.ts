// Client-side bulk-import helpers shared by the BulkUploadModal (general
// question bank + olympiad edit-page pool) and the New-Package create flow.
// Plain client-safe module (no "use server"): everything here is a UX
// pre-check only — the SECURITY DEFINER bulk RPCs and the server actions in
// src/lib/admin remain the authority (assert_question_type_rules etc.).

export type ClientTypeRule = {
  name: string;
  options_required: number | null;
  correct_required: number | null;
};

export type RowIssue = { row: number; message: string };

export const BULK_MAX_FILE_BYTES = 2 * 1024 * 1024;

// The downloadable template: per-item meta intentionally has NO subject and NO
// grade_level — the batch supplies both (general bank: the modal selects;
// olympiad pool: the PACKAGE's subject and grade). Legacy files that still
// carry meta.subject / meta.grade_level are accepted, but those values are
// ignored server-side in favor of the batch/package selection. Multiple choice
// (the only ACTIVE type at launch) requires exactly 4 options with exactly 1
// correct; the template models exactly that shape.
export const BULK_TEMPLATE = [
  {
    primary_locale: "az",
    meta: {
      type: "Multiple choice",
      olympiad_type: "School",
      topic: "Toplama",
      subtopic: "Birrəqəmli ədədlər",
    },
    translations: {
      az: { body: "2 + 2 = ?", prompt: "Düzgün cavabı seçin", explanation: "2 + 2 = 4" },
      en: { body: "2 + 2 = ?", prompt: "Choose the correct answer" },
      ru: { body: "2 + 2 = ?", prompt: "Выберите правильный ответ" },
    },
    options: [
      { is_correct: true, order_index: 0, text: { az: "4", en: "4", ru: "4" } },
      { is_correct: false, order_index: 1, text: { az: "3", en: "3", ru: "3" } },
      { is_correct: false, order_index: 2, text: { az: "5", en: "5", ru: "5" } },
      { is_correct: false, order_index: 3, text: { az: "6", en: "6", ru: "6" } },
    ],
  },
];

// Case/space-insensitive normalization so "Multiple choice", "multiple_choice"
// and "Multiple  Choice" all resolve to the same active type.
export function normClientTypeName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "_");
}

// Serializes the template for download in the browser.
export function downloadBulkTemplate(filename: string): void {
  const blob = new Blob([JSON.stringify(BULK_TEMPLATE, null, 2)], {
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

// Per-row structural pre-validation (mirror of the server's bulk-validate
// rules): primary-locale body, options array, per-type option/correct counts
// (MCQ = exactly 4 options / exactly 1 correct via the active-type rules),
// non-empty az option texts. Returns one issue list for display.
export function validateBulkRowsClient(
  data: unknown[],
  tt: (k: string) => string,
  rules: ClientTypeRule[],
): RowIssue[] {
  const activeByNorm = new Map<string, ClientTypeRule>();
  for (const r of rules) activeByNorm.set(normClientTypeName(r.name), r);
  const defaultType: ClientTypeRule | null = rules[0] ?? null;

  const issues: RowIssue[] = [];
  data.forEach((item, i) => {
    const row = i + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ row, message: tt("bulk.err.notObject") });
      return;
    }
    const it = item as {
      primary_locale?: unknown;
      meta?: { type?: unknown };
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

    if (!Array.isArray(it.options)) {
      issues.push({ row, message: tt("bulk.err.optionsArray") });
      return;
    }
    const opts = it.options as { is_correct?: unknown; text?: { az?: unknown } }[];

    // Resolve the type rule (mirror of the server). Missing/empty type →
    // sole active type; a named type must match an active one.
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
