import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guards";
import { getDict, getT } from "@/i18n/server";
import { loadQuestionOptions } from "@/lib/admin/question-options";
import { QuestionForm } from "@/components/QuestionForm";
import { QuestionLifecycle } from "@/components/QuestionLifecycle";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("content.create");
  const t = await getT();
  const dict = await getDict();
  const supabase = await createClient();

  const { data: q } = await supabase
    .from("questions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!q) notFound();

  const loc: string = q.primary_locale ?? "az";

  const { data: trans } = await supabase
    .from("question_translations")
    .select("locale, body, prompt")
    .eq("question_id", id);
  const tr = (trans ?? []).find((x: any) => x.locale === loc);

  const { data: expl } = await supabase
    .from("question_explanations")
    .select("locale, explanation_body")
    .eq("question_id", id);
  const exp = (expl ?? []).find((x: any) => x.locale === loc);

  const { data: aopts } = await supabase
    .from("answer_options")
    .select("id, is_correct, order_index, answer_option_translations(locale, text)")
    .eq("question_id", id)
    .order("order_index");
  const optionDefaults = (aopts ?? []).map((o: any) => ({
    text:
      (o.answer_option_translations ?? []).find((x: any) => x.locale === loc)
        ?.text ?? "",
    is_correct: o.is_correct,
  }));

  const selectOptions = await loadQuestionOptions(t);
  const defaults = {
    meta: {
      subject_id: q.subject_id,
      grade_id: q.grade_id,
      type_id: q.type_id,
      difficulty_id: q.difficulty_id,
      topic_id: q.topic_id,
      subtopic_id: q.subtopic_id,
      olympiad_type_id: q.olympiad_type_id,
      source_id: q.source_id,
    },
    primary_locale: loc,
    body: tr?.body ?? "",
    prompt: tr?.prompt ?? "",
    explanation: exp?.explanation_body ?? "",
    options: optionDefaults,
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("qedit.title")}</h1>
        <p className="muted">
          <Link href="/questions">← {t("nav.questions")}</Link> ·{" "}
          {t("qedit.statusLabel")}: {t(`qstatus.${q.status}`)}
        </p>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <QuestionLifecycle
          id={id}
          status={q.status}
          isAdmin={ctx.isAdmin}
          permissions={ctx.permissions}
          dict={dict}
        />
      </section>

      <section className="card">
        <QuestionForm
          dict={dict}
          options={selectOptions}
          defaults={defaults}
          id={id}
          submitLabel={t("qform.save")}
        />
      </section>
    </div>
  );
}
