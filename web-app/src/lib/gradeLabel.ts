// ONE reusable, locale-aware grade label formatter.
//
// The `grades` catalog stores { level: 1..11, name: "5. sinif" }. Rendering
// "level — name" duplicated the number ("5 — 5. sinif"); every surface that
// shows a grade now formats the LEVEL through this helper instead.
//
// Azerbaijani uses the owner-specified ordinal suffixes (vowel harmony):
// 1-ci, 2-ci, 3-cü, 4-cü, 5-ci, 6-cı, 7-ci, 8-ci, 9-cu, 10-cu, 11-ci sinif.
//
// Pure/iso (no server deps) so both server components (with getLocale()) and
// client components (with useLocale()) can share it.
import type { Locale } from "@/i18n/config";

const AZ_ORDINAL_SUFFIX: Record<number, string> = {
  1: "ci",
  2: "ci",
  3: "cü",
  4: "cü",
  5: "ci",
  6: "cı",
  7: "ci",
  8: "ci",
  9: "cu",
  10: "cu",
  11: "ci",
};

/**
 * Locale-aware grade label: az "5-ci sinif", en "Grade 5", ru "5-й класс".
 * Unknown/missing level falls back to the raw DB grade name (when provided)
 * or "—" — never to a made-up ordinal.
 */
export function formatGradeLabel(
  level: number | null | undefined,
  locale: Locale,
  fallbackName?: string | null,
): string {
  const fallback = (fallbackName ?? "").trim() || "—";
  if (typeof level !== "number" || !Number.isInteger(level) || level <= 0) {
    return fallback;
  }
  if (locale === "az") {
    const suffix = AZ_ORDINAL_SUFFIX[level];
    return suffix ? `${level}-${suffix} sinif` : fallback;
  }
  if (locale === "ru") return `${level}-й класс`;
  return `Grade ${level}`;
}

/**
 * Round 34: label for a MULTI-grade set. Contiguous levels render as a range
 * ("4–6-cı siniflər"), sparse sets as a list ("4, 6, 9-cu siniflər"); a
 * single level falls back to formatGradeLabel. Natural phrasing per locale.
 */
export function formatGradeRangeLabel(levels: number[], locale: Locale): string {
  const sorted = Array.from(new Set(levels.filter((n) => Number.isInteger(n) && n > 0))).sort(
    (a, b) => a - b,
  );
  if (sorted.length === 0) return "—";
  if (sorted.length === 1) return formatGradeLabel(sorted[0], locale);
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  const span = contiguous
    ? `${sorted[0]}–${sorted[sorted.length - 1]}`
    : sorted.join(", ");
  const last = sorted[sorted.length - 1];
  if (locale === "az") {
    const suffix = AZ_ORDINAL_SUFFIX[last];
    return suffix ? `${span}-${suffix} siniflər` : `${span} siniflər`;
  }
  if (locale === "ru") return `${span}-е классы`;
  return `Grades ${span}`;
}
