import { requirePermission } from "@/lib/admin/guards";
import { getDict, getT } from "@/i18n/server";
import { loadQuestionOptions } from "@/lib/admin/question-options";
import { QuestionForm } from "@/components/QuestionForm";

export default async function NewQuestionPage() {
  await requirePermission("content.create");
  const t = await getT();
  const dict = await getDict();
  const options = await loadQuestionOptions(t);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("qnew.title")}</h1>
      </div>
      <section className="card">
        <QuestionForm dict={dict} options={options} submitLabel={t("qform.save")} />
      </section>
    </div>
  );
}
