"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAdmin,
  requirePanelAccess,
  requirePermission,
} from "@/lib/admin/guards";
import { getT } from "@/i18n/server";

export type QuestionState = { error?: string } | null;

const META_FIELDS = [
  "grade_id",
  "subject_id",
  "topic_id",
  "subtopic_id",
  "type_id",
  "difficulty_id",
  "olympiad_type_id",
  "source_id",
] as const;

function s(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export async function saveQuestion(
  _prev: QuestionState,
  formData: FormData,
): Promise<QuestionState> {
  const ctx = await requirePermission("content.create"); // admin or content.create
  const t = await getT();
  const id = s(formData, "__id");
  const supabase = await createClient();

  const meta: Record<string, unknown> = {};
  for (const f of META_FIELDS) {
    const v = s(formData, f);
    meta[f] = v === "" ? null : v;
  }
  if (!meta.subject_id) return { error: t("qerr.subjectRequired") };
  if (!meta.grade_id) return { error: t("qerr.gradeRequired") };
  if (!meta.type_id) return { error: t("qerr.typeRequired") };
  if (!meta.difficulty_id) return { error: t("qerr.difficultyRequired") };

  const localeRaw = s(formData, "primary_locale");
  const locale = ["az", "en", "ru"].includes(localeRaw) ? localeRaw : "az";

  const body = s(formData, "body");
  const prompt = s(formData, "prompt");
  const explanation = s(formData, "explanation");
  if (!body) return { error: t("qerr.bodyRequired") };

  const count = Number(s(formData, "opt_count")) || 0;
  const options: { text: string; is_correct: boolean; order_index: number }[] = [];
  for (let i = 0; i < count; i++) {
    const text = s(formData, `opt.${i}.text`);
    if (!text) continue;
    options.push({
      text,
      is_correct: formData.get(`opt.${i}.correct`) != null,
      order_index: options.length,
    });
  }
  if (options.length > 0 && !options.some((o) => o.is_correct)) {
    return { error: t("qerr.needCorrect") };
  }

  let questionId = id;

  if (!questionId) {
    const { data: q, error } = await supabase
      .from("questions")
      .insert({
        ...meta,
        primary_locale: locale,
        status: "draft",
        created_by: ctx.profileId,
        updated_by: ctx.profileId,
      })
      .select("id")
      .single();
    if (error || !q) return { error: error?.message ?? "Insert failed." };
    questionId = q.id;
  } else {
    const { error } = await supabase
      .from("questions")
      .update({ ...meta, primary_locale: locale, updated_by: ctx.profileId })
      .eq("id", questionId);
    if (error) return { error: error.message };
  }

  const cleanup = async (msg: string): Promise<QuestionState> => {
    if (!id && questionId) {
      // Only undo a question we created in this call.
      await supabase.from("questions").delete().eq("id", questionId);
    }
    return { error: msg };
  };

  // Azerbaijani translation (body/prompt).
  {
    const { error } = await supabase
      .from("question_translations")
      .upsert(
        { question_id: questionId, locale, body, prompt: prompt || null },
        { onConflict: "question_id,locale" },
      );
    if (error) return cleanup(error.message);
  }

  // Azerbaijani explanation (optional).
  if (explanation) {
    const { error } = await supabase
      .from("question_explanations")
      .upsert(
        { question_id: questionId, locale, explanation_body: explanation },
        { onConflict: "question_id,locale" },
      );
    if (error) return cleanup(error.message);
  } else if (id) {
    await supabase
      .from("question_explanations")
      .delete()
      .eq("question_id", questionId)
      .eq("locale", locale);
  }

  // Replace answer options (delete + reinsert keeps it simple and correct).
  await supabase.from("answer_options").delete().eq("question_id", questionId);
  for (const o of options) {
    const { data: opt, error: oErr } = await supabase
      .from("answer_options")
      .insert({
        question_id: questionId,
        is_correct: o.is_correct,
        order_index: o.order_index,
      })
      .select("id")
      .single();
    if (oErr || !opt) return cleanup(oErr?.message ?? "Option insert failed.");
    const { error: tErr } = await supabase
      .from("answer_option_translations")
      .insert({ option_id: opt.id, locale, text: o.text });
    if (tErr) return cleanup(tErr.message);
  }

  revalidatePath("/questions");
  redirect(`/questions/${questionId}/edit`);
}

// Lifecycle transitions with role rules (also enforced by RLS).
const TRANSITIONS: Record<
  string,
  { from: string[]; to: string; perm?: string }
> = {
  submit: { from: ["draft", "rejected"], to: "in_review" },
  approve: { from: ["in_review"], to: "approved", perm: "content.review" },
  reject: { from: ["in_review"], to: "rejected", perm: "content.review" },
  publish: { from: ["approved"], to: "published", perm: "content.publish" },
  unpublish: { from: ["published"], to: "approved", perm: "content.publish" },
  archive: {
    from: ["draft", "in_review", "approved", "published", "rejected"],
    to: "archived",
    perm: "content.archive",
  },
};

export async function transitionQuestion(formData: FormData): Promise<void> {
  const id = s(formData, "__id");
  const action = s(formData, "__action");
  const tr = TRANSITIONS[action];
  if (!id || !tr) return;

  const ctx = await requirePanelAccess();
  if (tr.perm && !ctx.isAdmin && !ctx.permissions.includes(tr.perm)) {
    redirect("/unauthorized");
  }

  const supabase = await createClient();
  const { data: q } = await supabase
    .from("questions")
    .select("status, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!q || !tr.from.includes(q.status)) return;

  // Submitting is allowed for the creator (or an admin).
  if (action === "submit" && !ctx.isAdmin && q.created_by !== ctx.profileId) {
    redirect("/unauthorized");
  }

  await supabase
    .from("questions")
    .update({ status: tr.to, updated_by: ctx.profileId })
    .eq("id", id);
  revalidatePath("/questions");
  revalidatePath(`/questions/${id}/edit`);
}

export async function deleteQuestion(formData: FormData): Promise<void> {
  const id = s(formData, "__id");
  if (!id) return;
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("questions").delete().eq("id", id);
  revalidatePath("/questions");
  redirect("/questions");
}
