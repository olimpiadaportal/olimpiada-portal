import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { listQuestionTypes } from "@/lib/admin/question-types";
import { typeRuleSummary } from "@/lib/admin/type-rules";
import { QuestionTypeForm } from "@/components/QuestionTypeForm";
import { QuestionTypeDeleteButton } from "@/components/QuestionTypeDeleteButton";
import { getT, type T } from "@/i18n/server";

// Advanced question-types management (Admin-only). Replaces the generic
// /manage/question-types registry page: types carry per-type structure rules
// (status / options_required / correct_required) that need range validation,
// an immutable code, a rules summary and a delete guard the generic
// ResourceForm cannot express.

function formLabels(t: T) {
  return {
    code: t("qt.code"),
    codeHint: t("qt.codeHint"),
    name: t("field.name"),
    status: t("field.status"),
    statusHint: t("qt.statusHint"),
    statusActive: t("qt.pillActive"),
    statusInactive: t("qt.pillInactive"),
    optionsRequired: t("qt.optionsRequired"),
    optionsHint: t("qt.optionsHint"),
    correctRequired: t("qt.correctRequired"),
    correctHint: t("qt.correctHint"),
    autoGrading: t("field.supports_auto_grading"),
    submit: t("action.create"),
    saving: t("manage.saving"),
    errMissingName: t("qt.errName"),
    errTooLong: t("err.tooLong"),
    errRangeOptions: t("qt.errRangeOptions"),
    errRangeCorrect: t("qt.errRangeCorrect"),
    errDuplicate: t("qt.errDuplicate"),
    errGeneric: t("err.server"),
  };
}

export default async function QuestionTypesPage() {
  await requireAdmin();
  const t = await getT();
  const types = await listQuestionTypes();

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.questionTypes")}</h1>
        <p className="muted">{t("qt.subtitle")}</p>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>{t("qt.addHeading")}</h3>
        <QuestionTypeForm labels={formLabels(t)} />
      </section>

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t("qt.code")}</th>
                <th>{t("field.name")}</th>
                <th>{t("field.status")}</th>
                <th>{t("qt.rules")}</th>
                <th>{t("field.supports_auto_grading")}</th>
                <th>{t("qt.questionsCol")}</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {types.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    {t("qt.noRecords")}
                  </td>
                </tr>
              )}
              {types.map((qt) => (
                <tr key={qt.id}>
                  <td className="nowrap">
                    <code>{qt.code}</code>
                  </td>
                  <td>{qt.name}</td>
                  <td className="nowrap">
                    <span
                      className={`pill pill-inline ${
                        qt.status === "active" ? "pill-ok" : "pill-muted"
                      }`}
                    >
                      {qt.status === "active"
                        ? t("qt.pillActive")
                        : t("qt.pillInactive")}
                    </span>
                  </td>
                  <td>{typeRuleSummary(t, qt)}</td>
                  <td>
                    {qt.supports_auto_grading ? t("boolean.yes") : t("boolean.no")}
                  </td>
                  <td>{qt.question_count}</td>
                  <td className="row-actions nowrap">
                    <Link href={`/question-types/${qt.id}/edit`}>
                      {t("action.edit")}
                    </Link>
                    <QuestionTypeDeleteButton
                      id={qt.id}
                      label={t("action.delete")}
                      confirmText={t("action.confirmDelete")}
                      errInUse={t("qt.errInUse")}
                      errGeneric={t("err.server")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
