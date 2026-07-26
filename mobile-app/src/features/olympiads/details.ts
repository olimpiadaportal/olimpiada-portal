// Round 43 — "Ətraflı" olympiad detail rows (web OlympiadPurchase
// DetailsDialogBody parity). Every AVAILABLE field with its poly.det.* az label;
// a row whose value is null/empty is dropped entirely (never renders
// "null"/"undefined"). Dates use the shared Baku formatLongDate; money uses the
// existing fmtMoney. Shared by the student + parent olympiad card lists so both
// details views stay identical. Pure (no supabase import) — jest-friendly.
import type { Locale } from "@/i18n";
import { formatLongDate } from "@/lib/formatDate";
import { formatGradeLabel, formatGradeRangeLabel } from "@/lib/gradeLabel";
import { subjectLabel } from "@/lib/subjectLabel";
import { fmtMoney } from "@/features/parent/commerce";
import type { OlympiadPackageRow } from "@/lib/data";

export type OlympiadDetailRow = { key: string; label: string; value: string };

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
  push(
    "perAttempt",
    t("poly.det.perAttempt"),
    pkg.questions_per_attempt > 0 && pkg.questions_per_attempt < count
      ? String(pkg.questions_per_attempt)
      : null,
  );
  push(
    "duration",
    t("poly.det.duration"),
    pkg.duration_minutes ? `${pkg.duration_minutes} ${t("poly.det.minutes")}` : null,
  );
  push("eventAt", t("poly.det.eventAt"), dateOf(pkg.event_starts_at));
  push("saleStart", t("poly.det.saleStart"), dateOf(pkg.sale_starts_at));
  push("saleEnd", t("poly.det.saleEnd"), dateOf(pkg.sale_ends_at));
  push(
    "price",
    t("poly.det.price"),
    pkg.price_amount > 0 ? fmtMoney(pkg.price_amount, pkg.currency) : t("poly.free"),
  );
  return rows;
}
