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
import type { Locale } from "@/i18n";

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
