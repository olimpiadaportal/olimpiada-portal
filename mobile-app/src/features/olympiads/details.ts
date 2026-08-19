// Round 43 — "Ətraflı" olympiad detail rows (web OlympiadPurchase
// DetailsDialogBody parity). Every AVAILABLE field with its poly.det.* az label;
// a row whose value is null/empty is dropped entirely (never renders
// "null"/"undefined"). Dates use the shared Baku formatLongDate. Shared by the
// student + parent olympiad card lists so both details views stay identical.
// Pure (no supabase import) — jest-friendly.
//
// There is NO price row and no way to ask for one (owner, 2026-08-18): the app
// is purchase-silent for both roles, so the optional includePrice flag that
// the parent sheet used to pass was deleted along with the buy flow.
import type { Locale } from "@/i18n";
import { formatLongDate } from "@/lib/formatDate";
import { formatGradeLabel, formatGradeRangeLabel } from "@/lib/gradeLabel";
import { subjectLabel } from "@/lib/subjectLabel";
import type { OlympiadPackageRow } from "@/lib/data";

export type OlympiadDetailRow = { key: string; label: string; value: string };

/**
 * Migration 106 — the value that applies across a package's target grades, or
 * null when they DISAGREE.
 *
 * The app has no grade context here (a parent's catalog spans every child's
 * grade, and the student RPC does not return which grade matched), so when a
 * package serves 20 questions to grade 5 and 40 to grade 11 there is no honest
 * single number. Returning null drops the row entirely — better than showing
 * one grade's figure to everyone. Packages whose grades all inherit — every
 * package before 106, and every single-grade one — resolve to one value and
 * render exactly as before.
 */
export function sharedGradeValue(
  grades: { questions_per_attempt: number | null; duration_minutes: number | null }[],
  packageValue: number,
  field: "questions_per_attempt" | "duration_minutes",
): number | null {
  if (grades.length === 0) return packageValue;
  const values = new Set(grades.map((g) => g[field] ?? packageValue));
  return values.size === 1 ? (values.values().next().value ?? null) : null;
}

export function buildOlympiadDetailRows(
  pkg: OlympiadPackageRow,
  count: number,
  locale: Locale,
  t: (key: string) => string,
): OlympiadDetailRow[] {
  const rows: OlympiadDetailRow[] = [];
  const push = (key: string, label: string, value: string | null | undefined) => {
    const v = (value ?? "").toString().trim();
    if (v) rows.push({ key, label, value: v });
  };
  const dateOf = (iso: string | null): string | null => {
    const out = formatLongDate(iso, locale, true);
    return out === "—" ? null : out;
  };
  const multiGrade = pkg.grades.length > 1;
  const gradeValue =
    pkg.grades.length > 0
      ? formatGradeRangeLabel(
          pkg.grades.map((g) => g.level),
          locale,
        )
      : pkg.grade
        ? formatGradeLabel(pkg.grade.level, locale, pkg.grade.name)
        : null;

  push("type", t("poly.det.type"), pkg.typeName);
  push(
    "subject",
    t("poly.det.subject"),
    pkg.subject ? subjectLabel(t, pkg.subject.code, pkg.subject.name) : null,
  );
  push(
    multiGrade ? "grades" : "grade",
    multiGrade ? t("poly.det.grades") : t("poly.det.grade"),
    gradeValue,
  );
  push("questions", t("poly.det.questions"), count > 0 ? String(count) : null);
  // Round 51 rotation: what one attempt actually serves. Shown only when it is
  // a real SUBSET of this caller's pool — equal/greater means an attempt serves
  // the whole pool and the questions row above already says it.
  // Migration 106: resolved across the target grades (null when they differ).
  const perAttempt = sharedGradeValue(
    pkg.grades,
    pkg.questions_per_attempt,
    "questions_per_attempt",
  );
  const duration = sharedGradeValue(pkg.grades, pkg.duration_minutes, "duration_minutes");
  push(
    "perAttempt",
    t("poly.det.perAttempt"),
    perAttempt !== null && perAttempt > 0 && perAttempt < count ? String(perAttempt) : null,
  );
  push(
    "duration",
    t("poly.det.duration"),
    duration ? `${duration} ${t("poly.det.minutes")}` : null,
  );
  push("eventAt", t("poly.det.eventAt"), dateOf(pkg.event_starts_at));
  push("saleStart", t("poly.det.saleStart"), dateOf(pkg.sale_starts_at));
  push("saleEnd", t("poly.det.saleEnd"), dateOf(pkg.sale_ends_at));
  return rows;
}
