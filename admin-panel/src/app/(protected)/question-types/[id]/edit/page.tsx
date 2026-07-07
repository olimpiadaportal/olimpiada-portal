import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getQuestionType } from "@/lib/admin/question-types";
import { QuestionTypeForm } from "@/components/QuestionTypeForm";
import { getT } from "@/i18n/server";

export default async function EditQuestionTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const t = await getT();
  const qt = await getQuestionType(id);
  if (!qt) notFound();

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("qt.editHeading")}</h1>
        <p className="muted">
          <Link href="/question-types">
            ← {t("manage.back")} · {t("nav.questionTypes")}
          </Link>
        </p>
      </div>

      <section className="card">
        <QuestionTypeForm
          id={qt.id}
          defaultValues={{
            code: qt.code,
            name: qt.name,
            status: qt.status,
            options_required: qt.options_required,
            correct_required: qt.correct_required,
            supports_auto_grading: qt.supports_auto_grading,
          }}
          labels={{
            code: t("qt.code"),
            codeHint: t("qt.codeHint"),
            name: t("field.name"),
            status: t("field.status"),
            statusHint: t("qt.statusHint"),
            statusActive: t("qt.pillActive"),
            statusInactive: t("qt.pillInactive"),
            correctRequired: t("qt.correctRequired"),
            correctHint: t("qt.correctHint"),
            autoGrading: t("field.supports_auto_grading"),
            submit: t("action.save"),
            saving: t("manage.saving"),
            errMissingName: t("qt.errName"),
            errTooLong: t("err.tooLong"),
            errRangeCorrect: t("qt.errRangeCorrect"),
            errDuplicate: t("qt.errDuplicate"),
            errGeneric: t("err.server"),
          }}
        />
      </section>
    </div>
  );
}
