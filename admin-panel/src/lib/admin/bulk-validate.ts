// Shared strict bulk-import validation (general question bank + olympiad private
// pool). Pure module (NOT "use server") so both server-action files can import
// these synchronous helpers. Produces SPECIFIC trilingual per-row messages that
// mirror the DB's assert_question_type_rules + body/option checks, so a failed
// row tells the admin exactly what to fix instead of a generic "row failed".
import { type T } from "@/i18n/server";

// Length caps for bulk-import free text (mirror the manual form + the DB).
export const BULK_BODY_MAX = 8000; // body / prompt / explanation
export const BULK_OPTION_MAX = 2000; // per answer-option text

export const LOCALES3 = ["az", "en", "ru"] as const;

// The per-type structure rules we validate against (from active question_types).
export type ActiveTypeRule = {
  name: string;
  options_required: number | null;
  correct_required: number | null;
};

// Case/space-insensitive normalization so "Multiple choice", "multiple_choice"
// and "Multiple  Choice" all match the same active type.
export function normTypeName(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, "_");
}

// Strict per-row schema validation. Returns a LOCALIZED message for the FIRST
// problem found, or null when the row is structurally valid. Rows that fail here
// are never sent to the RPC. Subject is NOT validated here (the general import
// injects it from the modal; the olympiad pool scopes it by package).
export function validateBulkItem(
  item: unknown,
  t: T,
  activeByNorm: Map<string, ActiveTypeRule>,
  defaultType: ActiveTypeRule | null,
): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return t("bulk.err.notObject");
  }
  const it = item as Record<string, unknown>;

  // Primary locale + its required body.
  const plRaw = typeof it.primary_locale === "string" ? it.primary_locale : "az";
  const pl = (LOCALES3 as readonly string[]).includes(plRaw) ? plRaw : "az";
  const translations =
    it.translations && typeof it.translations === "object" && !Array.isArray(it.translations)
      ? (it.translations as Record<string, unknown>)
      : {};
  const primaryTr =
    translations[pl] && typeof translations[pl] === "object" && !Array.isArray(translations[pl])
      ? (translations[pl] as Record<string, unknown>)
      : {};
  const body = typeof primaryTr.body === "string" ? primaryTr.body.trim() : "";
  if (!body) return t("bulk.err.noAzBody");
  if (body.length > BULK_BODY_MAX) return t("bulk.err.tooLong");
  const prompt = typeof primaryTr.prompt === "string" ? primaryTr.prompt : "";
  const explanation =
    typeof primaryTr.explanation === "string" ? primaryTr.explanation : "";
  if (prompt.length > BULK_BODY_MAX || explanation.length > BULK_BODY_MAX) {
    return t("bulk.err.tooLong");
  }

  // Resolve the question type rule. Missing/empty type defaults to the sole
  // active type (Multiple choice); a named type must match an active one.
  const meta =
    it.meta && typeof it.meta === "object" && !Array.isArray(it.meta)
      ? (it.meta as Record<string, unknown>)
      : {};
  const typeRaw = meta.type;
  let rule: ActiveTypeRule | null;
  if (typeRaw == null || (typeof typeRaw === "string" && typeRaw.trim() === "")) {
    rule = defaultType;
  } else if (typeof typeRaw === "string") {
    rule = activeByNorm.get(normTypeName(typeRaw)) ?? null;
    if (!rule) return t("bulk.err.unknownType");
  } else {
    return t("bulk.err.unknownType");
  }

  // Options must be an array; count + correct-count must match the type rule.
  if (!Array.isArray(it.options)) return t("bulk.err.optionsArray");
  const options = it.options as unknown[];

  if (rule?.options_required != null && options.length !== rule.options_required) {
    return t("bulk.err.optionCount")
      .replace("{n}", String(rule.options_required))
      .replace("{got}", String(options.length));
  }
  if (rule?.correct_required != null) {
    const correct = options.filter(
      (o) =>
        o != null &&
        typeof o === "object" &&
        (o as { is_correct?: unknown }).is_correct === true,
    ).length;
    if (correct !== rule.correct_required) {
      return t("bulk.err.correctCount")
        .replace("{n}", String(rule.correct_required))
        .replace("{got}", String(correct));
    }
  }

  // Every option needs a non-empty az text and must stay within the length cap.
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const textObj =
      o != null &&
      typeof o === "object" &&
      (o as { text?: unknown }).text != null &&
      typeof (o as { text?: unknown }).text === "object"
        ? ((o as { text: Record<string, unknown> }).text)
        : {};
    const az = typeof textObj.az === "string" ? textObj.az.trim() : "";
    if (!az) return t("bulk.err.optionText").replace("{i}", String(i + 1));
    for (const loc of LOCALES3) {
      const val = textObj[loc];
      if (typeof val === "string" && val.length > BULK_OPTION_MAX) {
        return t("bulk.err.tooLong");
      }
    }
  }

  return null;
}

// Maps a raw RPC row error (SQLERRM) to a specific trilingual message by known
// substrings — never leaks raw SQL text. These are rare: subject/grade are
// injected and type/options are pre-validated before the RPC is called.
export function mapRpcRowError(raw: unknown, t: T): string {
  const low = typeof raw === "string" ? raw.toLowerCase() : "";
  if (low.includes("unknown subject")) return t("bulk.err.unknownSubject");
  if (low.includes("unknown grade")) return t("bulk.err.unknownGrade");
  if (low.includes("requires exactly")) return t("bulk.err.structure");
  return t("bulk.err.generic");
}

// Merges batch-level meta values (subject name / grade level) into one import
// item, preserving everything else. Non-object items pass through as a bare meta
// wrapper — the RPC then reports them as per-row failures.
export function overrideItemMeta(
  item: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const obj =
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
  const meta =
    obj.meta && typeof obj.meta === "object" && !Array.isArray(obj.meta)
      ? (obj.meta as Record<string, unknown>)
      : {};
  return { ...obj, meta: { ...meta, ...patch } };
}
