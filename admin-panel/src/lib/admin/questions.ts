"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requireAdmin,
  requirePanelAccess,
  requirePermission,
} from "@/lib/admin/guards";
import { getLocale, getT } from "@/i18n/server";
import { withLocalStrings } from "@/lib/admin/question-flow-labels";
import {
  IMAGE_FILENAME_RE,
  sniffVerifiedImage,
  splitStoragePath,
  verifyStorageObject,
} from "@/lib/admin/media-verify";
import {
  validateBulkItem,
  normTypeName,
  mapRpcRowError,
  overrideItemMeta,
  pickDefaultType,
  type ActiveTypeRule,
} from "@/lib/admin/bulk-validate";

// `ok` is set only on the modal ("stay") path: the create-question modal needs
// a success result instead of a redirect so it can close and refresh in place.
export type QuestionState = { error?: string; ok?: boolean } | null;

// Server-side length caps on free text (defence-in-depth; the UI also limits).
const BODY_MAX = 8000; // question body / prompt
const EXPLANATION_MAX = 8000;
const OPTION_MAX = 2000; // answer-option text

// Round 21: exactly 5 options (A–E), exactly 1 correct — the same structure
// the DB enforces via question_types.options_required for single_choice.
const OPTION_COUNT = 5;

// Create-modal question image: staged by the browser under staging/ in the
// question-media bucket, then verified + moved + linked HERE in the same
// saveQuestion call (one-submission save).
const MEDIA_BUCKET = "question-media";
const MEDIA_MAX_SIZE = 5 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function s(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

// Module-separation guard: general-bank (EXAM) questions may only reference
// EXAM-scoped topics. Olympiad-package bulk imports create scope='olympiad'
// topics that must never be attachable here — even via a forged form post.
// Subtopics have no scope column; they inherit it via their parent topic.
// Empty ids pass (bulkAssignTopic's subtopic is optional); unknown ids fail
// closed. (saveQuestion does its own stricter subject/grade-aware check.)
async function isExamTaxonomy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  topicId: string | null,
  subtopicId: string | null,
): Promise<boolean> {
  const topicIds = new Set<string>();
  if (topicId) topicIds.add(topicId);
  if (subtopicId) {
    const { data: st } = await supabase
      .from("subtopics")
      .select("topic_id")
      .eq("id", subtopicId)
      .maybeSingle();
    if (!st?.topic_id) return false;
    topicIds.add(String(st.topic_id));
  }
  if (topicIds.size === 0) return true;
  const ids = [...topicIds];
  const { data: rows } = await supabase
    .from("topics")
    .select("id, scope")
    .in("id", ids);
  const found = (rows ?? []) as { id: string; scope: string }[];
  return found.length === ids.length && found.every((r) => r.scope === "exam");
}

// Round 22: the question editor lives in a modal on /questions — this action
// loads everything the editor needs for one question on demand (the old
// /questions/[id]/edit server page did the same queries at render time).
export type EditQuestionData =
  | {
      ok: true;
      id: string;
      status: string;
      defaults: {
        meta: Record<string, string | null>;
        primary_locale: string;
        body: string;
        prompt: string;
        explanation: string;
        options: { text: string; is_correct: boolean }[];
      };
      media: { url: string; mime: string } | null;
    }
  // Error CODES only (the client maps them to trilingual strings): a content
  // manager probing an olympiad-pool id gets "notFound" (must not even learn
  // the row exists); an admin gets "olympiadScoped" (managed via the package).
  | { ok: false; error: "notFound" | "olympiadScoped" };

export async function loadQuestionForEdit(
  rawId: string,
): Promise<EditQuestionData> {
  // Guard FIRST — before touching any client-supplied input.
  const ctx = await requirePermission("content.create");
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!UUID_RE.test(id)) return { ok: false, error: "notFound" };
  const supabase = await createClient();

  const { data: q } = await supabase
    .from("questions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!q) return { ok: false, error: "notFound" };
  if (q.olympiad_package_id) {
    return { ok: false, error: ctx.isAdmin ? "olympiadScoped" : "notFound" };
  }

  const loc: string = q.primary_locale ?? "az";
  const [{ data: trans }, { data: expl }, { data: aopts }] = await Promise.all([
    supabase
      .from("question_translations")
      .select("locale, body, prompt, media_asset_id")
      .eq("question_id", id),
    supabase
      .from("question_explanations")
      .select("locale, explanation_body")
      .eq("question_id", id),
    supabase
      .from("answer_options")
      .select("id, is_correct, order_index, answer_option_translations(locale, text)")
      .eq("question_id", id)
      .order("order_index"),
  ]);
  const tr = (trans ?? []).find((x: any) => x.locale === loc);
  const exp = (expl ?? []).find((x: any) => x.locale === loc);

  // Current media, if attached to the primary-locale translation.
  let media: { url: string; mime: string } | null = null;
  if (tr?.media_asset_id) {
    const { data: m } = await supabase
      .from("media_assets")
      .select("bucket, path, mime_type")
      .eq("id", tr.media_asset_id)
      .maybeSingle();
    if (m) {
      const { data: pub } = supabase.storage.from(m.bucket).getPublicUrl(m.path);
      media = { url: pub.publicUrl, mime: m.mime_type ?? "" };
    }
  }

  return {
    ok: true,
    id,
    status: String(q.status),
    defaults: {
      meta: {
        subject_id: q.subject_id,
        grade_id: q.grade_id,
        topic_id: q.topic_id,
        subtopic_id: q.subtopic_id,
      },
      primary_locale: loc,
      body: tr?.body ?? "",
      prompt: tr?.prompt ?? "",
      explanation: exp?.explanation_body ?? "",
      options: ((aopts ?? []) as any[]).map((o: any) => ({
        text:
          (o.answer_option_translations ?? []).find(
            (x: any) => x.locale === loc,
          )?.text ?? "",
        is_correct: !!o.is_correct,
      })),
    },
    media,
  };
}

export async function saveQuestion(
  _prev: QuestionState,
  formData: FormData,
): Promise<QuestionState> {
  const ctx = await requirePermission("content.create"); // admin or content.create
  const t = withLocalStrings(await getT(), await getLocale());
  const id = s(formData, "__id");
  const supabase = await createClient();

  // PRIVATE olympiad-pool questions (olympiad_package_id set) are managed
  // ONLY through their package — the general editor must never touch them,
  // ADMINS INCLUDED. Reject a direct edit-by-id (generic error, no detail leak).
  if (id) {
    const { data: target } = await supabase
      .from("questions")
      .select("olympiad_package_id")
      .eq("id", id)
      .maybeSingle();
    if (!target || target.olympiad_package_id) return { error: t("err.server") };
  }

  // ---- Required taxonomy: subject, grade, topic AND subtopic ---------------
  const subjectId = s(formData, "subject_id");
  const gradeId = s(formData, "grade_id");
  const topicId = s(formData, "topic_id");
  const subtopicId = s(formData, "subtopic_id");
  if (!UUID_RE.test(subjectId)) return { error: t("qerr.subjectRequired") };
  if (!UUID_RE.test(gradeId)) return { error: t("qerr.gradeRequired") };
  if (!UUID_RE.test(topicId)) return { error: t("qerr.topicRequired") };
  if (!UUID_RE.test(subtopicId)) return { error: t("qerr.subtopicRequired") };

  // The topic must be EXAM-scoped, belong to the selected subject and (when it
  // is grade-bound) to the selected grade; the subtopic must belong to the
  // topic. Forged ids fail closed with a non-leaking message.
  const { data: topicRow } = await supabase
    .from("topics")
    .select("id, subject_id, grade_id, scope, term")
    .eq("id", topicId)
    .maybeSingle();
  if (
    !topicRow ||
    topicRow.scope !== "exam" ||
    String(topicRow.subject_id) !== subjectId ||
    (topicRow.grade_id != null && String(topicRow.grade_id) !== gradeId)
  ) {
    return { error: t("qerr.taxonomyMismatch") };
  }
  const { data: subtopicRow } = await supabase
    .from("subtopics")
    .select("id, topic_id")
    .eq("id", subtopicId)
    .maybeSingle();
  if (!subtopicRow || String(subtopicRow.topic_id) !== topicId) {
    return { error: t("qerr.taxonomyMismatch") };
  }

  // ---- Rüb/term: read from the topic; a legacy topic requires a pick -------
  // A NULL-term topic can only be saved against after the admin picks 1..4;
  // that pick UPGRADES THE TOPIC (explicit declaration — the DB cascades it to
  // the topic's subtopics/questions). The question row then carries the same
  // term, so the DB mismatch trigger can never fire on this path.
  let term: number =
    topicRow.term == null ? 0 : Number(topicRow.term);
  let upgradeTopicTerm: number | null = null;
  if (topicRow.term == null) {
    const raw = s(formData, "topic_term");
    if (!/^[1-4]$/.test(raw)) return { error: t("qerr.termRequired") };
    upgradeTopicTerm = Number(raw);
    term = upgradeTopicTerm;
  }

  const localeRaw = s(formData, "primary_locale");
  const locale = ["az", "en", "ru"].includes(localeRaw) ? localeRaw : "az";

  const body = s(formData, "body");
  const prompt = s(formData, "prompt");
  const explanation = s(formData, "explanation");
  if (!body) return { error: t("qerr.bodyRequired") };
  // Caps: body/prompt ≤ 8000, explanation ≤ 8000, option text ≤ 2000.
  if (body.length > BODY_MAX || prompt.length > BODY_MAX) {
    return { error: t("err.tooLong") };
  }
  if (explanation.length > EXPLANATION_MAX) return { error: t("err.tooLong") };

  // ---- Exactly 5 options (A–E), exactly 1 correct (radio index) ------------
  const options: { text: string; is_correct: boolean; order_index: number }[] = [];
  const correctRaw = s(formData, "correct");
  if (!/^[0-4]$/.test(correctRaw)) return { error: t("qerr.oneCorrect") };
  const correctIdx = Number(correctRaw);
  for (let i = 0; i < OPTION_COUNT; i++) {
    const text = s(formData, `opt.${i}.text`);
    if (!text) return { error: t("qerr.fiveOptions") };
    if (text.length > OPTION_MAX) return { error: t("err.tooLong") };
    options.push({ text, is_correct: i === correctIdx, order_index: i });
  }

  // ---- Type: resolved server-side (the form no longer offers a select) -----
  // Every question authored through this editor is single_choice. On EDIT the
  // stored olympiad_type_id is left untouched (the form never showed it);
  // on CREATE it stays NULL.
  const { data: qType } = await supabase
    .from("question_types")
    .select("id")
    .eq("code", "single_choice")
    .maybeSingle();
  if (!qType) {
    console.error("[admin] single_choice question type missing");
    return { error: t("err.server") };
  }

  // ---- Optional staged image (create modal, one-submission save) -----------
  // The browser uploaded the file to staging/<uuid>.<ext>; verify it exists,
  // cap the size, and byte-sniff the real mime BEFORE creating anything.
  let staged:
    | { path: string; filename: string; mime: string; size: number }
    | null = null;
  const mediaPath = s(formData, "media_path");
  if (!id && mediaPath) {
    const filename = splitStoragePath(mediaPath, "staging/");
    if (!filename || !IMAGE_FILENAME_RE.test(filename)) {
      return { error: t("qimg.invalid") };
    }
    const obj = await verifyStorageObject(supabase, MEDIA_BUCKET, "staging", filename);
    if (!obj || obj.size > MEDIA_MAX_SIZE) return { error: t("qimg.invalid") };
    const sniffed = await sniffVerifiedImage(supabase, MEDIA_BUCKET, mediaPath, obj.mime);
    if (!sniffed) return { error: t("qimg.invalid") };
    staged = { path: mediaPath, filename, mime: sniffed, size: obj.size };
  }

  // ---- Explicit legacy-topic upgrade (before the question write) -----------
  // Guarded by .is("term", null) so a concurrent upgrade is never overwritten;
  // if someone set a DIFFERENT term meanwhile, the question write below fails
  // on the DB mismatch trigger and surfaces a generic error.
  if (upgradeTopicTerm != null) {
    const { error } = await supabase
      .from("topics")
      .update({ term: upgradeTopicTerm })
      .eq("id", topicId)
      .is("term", null);
    if (error) {
      console.error("[admin] topic term upgrade failed", error.message);
      return { error: t("err.server") };
    }
  }

  const metaPayload = {
    subject_id: subjectId,
    grade_id: gradeId,
    topic_id: topicId,
    subtopic_id: subtopicId,
    type_id: qType.id,
    term,
  };

  let questionId = id;

  if (!questionId) {
    const { data: q, error } = await supabase
      .from("questions")
      .insert({
        ...metaPayload,
        primary_locale: locale,
        status: "in_review",
        created_by: ctx.profileId,
        updated_by: ctx.profileId,
      })
      .select("id")
      .single();
    if (error || !q) {
      console.error("[admin] question insert failed", error?.message);
      return { error: t("err.server") };
    }
    questionId = q.id;
  } else {
    const { error } = await supabase
      .from("questions")
      .update({ ...metaPayload, primary_locale: locale, updated_by: ctx.profileId })
      .eq("id", questionId)
      // Defence-in-depth: even a forged id can never mutate a package question.
      .is("olympiad_package_id", null);
    if (error) {
      console.error("[admin] question update failed", error.message);
      return { error: t("err.server") };
    }
  }

  const cleanup = async (context: string, msg?: string): Promise<QuestionState> => {
    console.error("[admin]", context, msg);
    if (!id && questionId) {
      // Only undo a question we created in this call. (A still-staged image
      // object is left in place so the admin's retry can reuse it.)
      await supabase.from("questions").delete().eq("id", questionId);
    }
    return { error: t("err.server") };
  };

  // Primary-locale translation (body/prompt).
  {
    const { error } = await supabase
      .from("question_translations")
      .upsert(
        { question_id: questionId, locale, body, prompt: prompt || null },
        { onConflict: "question_id,locale" },
      );
    if (error) return cleanup("question translation upsert failed", error.message);
  }

  // Primary-locale explanation (optional).
  if (explanation) {
    const { error } = await supabase
      .from("question_explanations")
      .upsert(
        { question_id: questionId, locale, explanation_body: explanation },
        { onConflict: "question_id,locale" },
      );
    if (error) return cleanup("question explanation upsert failed", error.message);
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
    if (oErr || !opt) return cleanup("answer option insert failed", oErr?.message);
    const { error: tErr } = await supabase
      .from("answer_option_translations")
      .insert({ option_id: opt.id, locale, text: o.text });
    if (tErr) return cleanup("answer option translation failed", tErr.message);
  }

  // ---- Attach the staged image (create only) --------------------------------
  // Move staging/<file> → questions/<id>/<file>, record the media_assets row
  // with SERVER-derived (sniffed) mime + size, link the primary translation.
  // Any failure rolls the question back (and removes a half-moved object).
  if (staged && !id && questionId) {
    const finalPath = `questions/${questionId}/${staged.filename}`;
    const { error: mvErr } = await supabase.storage
      .from(MEDIA_BUCKET)
      .move(staged.path, finalPath);
    if (mvErr) return cleanup("question image move failed", mvErr.message);

    const { data: media, error: maErr } = await supabase
      .from("media_assets")
      .insert({
        bucket: MEDIA_BUCKET,
        path: finalPath,
        owner_profile_id: ctx.profileId,
        mime_type: staged.mime,
        file_size_bytes: staged.size,
        visibility: "public",
      })
      .select("id")
      .single();
    if (maErr || !media) {
      await supabase.storage.from(MEDIA_BUCKET).remove([finalPath]);
      return cleanup("question image media insert failed", maErr?.message);
    }

    const { error: linkErr } = await supabase
      .from("question_translations")
      .update({ media_asset_id: media.id })
      .eq("question_id", questionId)
      .eq("locale", locale);
    if (linkErr) {
      await supabase.from("media_assets").delete().eq("id", media.id);
      await supabase.storage.from(MEDIA_BUCKET).remove([finalPath]);
      return cleanup("question image link failed", linkErr.message);
    }
  }

  revalidatePath("/questions");
  // Modal path (__stay=1): return success instead of navigating — the client
  // closes the modal and refreshes the list. (Create AND edit both run inside
  // modals since Round 22; the redirect below is only a non-JS fallback.)
  if (s(formData, "__stay") === "1") {
    return { ok: true };
  }
  redirect("/questions");
}

// Lifecycle transitions with role rules (also enforced by RLS). Three-state
// model: in_review ⇄ published ⇄ rejected. Creation lands in in_review.
//   publish   → 'published'  (content.publish)   from in_review / rejected
//   reject    → 'rejected'   (content.review)    from in_review / published
//   to_review → 'in_review'  (content.review)    from published / rejected
const TRANSITIONS: Record<
  string,
  { from: string[]; to: string; perm?: string }
> = {
  publish: { from: ["in_review", "rejected"], to: "published", perm: "content.publish" },
  reject: { from: ["in_review", "published"], to: "rejected", perm: "content.review" },
  to_review: { from: ["published", "rejected"], to: "in_review", perm: "content.review" },
};

export async function transitionQuestion(formData: FormData): Promise<void> {
  // Guard FIRST — before touching any client-supplied FormData.
  const ctx = await requirePanelAccess();
  const id = s(formData, "__id");
  const action = s(formData, "__action");
  const tr = TRANSITIONS[action];
  if (!id || !tr) return;

  if (tr.perm && !ctx.isAdmin && !ctx.permissions.includes(tr.perm)) {
    redirect("/unauthorized");
  }

  const supabase = await createClient();
  const { data: q } = await supabase
    .from("questions")
    .select("status, olympiad_package_id")
    .eq("id", id)
    .maybeSingle();
  if (!q || !tr.from.includes(q.status)) return;

  // Olympiad-pool questions are managed only through their package — NOBODY
  // (admins included) may transition them from the general surface. Pool rows
  // are imported as 'published' and the attempt engine depends on that.
  if (q.olympiad_package_id) return;

  await supabase
    .from("questions")
    .update({ status: tr.to, updated_by: ctx.profileId })
    .eq("id", id)
    // Defence-in-depth: a forged id can never mutate a package question.
    .is("olympiad_package_id", null);
  revalidatePath("/questions");
}

// Result shape so the edit modal can surface the delete-guard message inline.
// `ok` is set on the modal ("stay") path so the client closes + refreshes in
// place; without __stay success redirects to the list (non-JS fallback).
export type DeleteQuestionState = { error?: string; ok?: boolean } | null;

export async function deleteQuestion(
  _prev: DeleteQuestionState,
  formData: FormData,
): Promise<DeleteQuestionState> {
  // Guard FIRST — before touching any client-supplied FormData.
  await requireAdmin();
  const id = s(formData, "__id");
  if (!id) return null;
  const supabase = await createClient();
  // Scope guard: the general surface can never delete an olympiad-pool
  // question (those live and die with their package).
  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", id)
    .is("olympiad_package_id", null);
  if (error) {
    const t = withLocalStrings(await getT(), await getLocale());
    // trg_question_delete_guard (migration 063, platform-wide): a question
    // any attempt ever answered must never be hard-deleted — the per-question
    // answer rows ARE the grading history. Friendly trilingual message; never
    // the raw DB error.
    if (
      error.code === "23514" &&
      (error.hint === "question_has_attempts" ||
        /attempt history/i.test(error.message ?? ""))
    ) {
      return { error: t("qdel.hasAttempts") };
    }
    console.error("[admin] question delete failed", error.message);
    return { error: t("err.server") };
  }
  revalidatePath("/questions");
  if (s(formData, "__stay") === "1") return { ok: true };
  redirect("/questions");
}

// ---------------------------------------------------------------------------
// Bulk operations. Bulk insert is delegated to the SECURITY DEFINER
// bulk_insert_questions RPC (checks content.create internally + derives
// created_by from the session). Bulk delete/transition run as the signed-in
// user under RLS, mirroring the single-item permission rules.
// ---------------------------------------------------------------------------

export type BulkImportState =
  | {
      ok: boolean;
      result?: {
        total: number;
        successful: number;
        failed: number;
        errors: { index: number; error: string }[];
      };
      error?: string;
    }
  | null;


export async function bulkImportQuestions(
  _prev: BulkImportState,
  formData: FormData,
): Promise<BulkImportState> {
  await requirePermission("content.create");
  const t = withLocalStrings(await getT(), await getLocale());

  // Batch-level Subject + Grade come from the modal selects (NOT from the
  // file). UUID-shape check first, then a real existence check — the RPC
  // resolves subject by subjects.name and grade by grades.level, so those are
  // exactly the values we inject into every item below.
  const subjectId = s(formData, "subject_id");
  const gradeId = s(formData, "grade_id");
  if (!UUID_RE.test(subjectId)) {
    return { ok: false, error: t("qerr.subjectRequired") };
  }
  if (!UUID_RE.test(gradeId)) {
    return { ok: false, error: t("qerr.gradeRequired") };
  }
  const supabase = await createClient();
  const [{ data: subj }, { data: grade }] = await Promise.all([
    supabase.from("subjects").select("id, name").eq("id", subjectId).maybeSingle(),
    supabase.from("grades").select("id, level").eq("id", gradeId).maybeSingle(),
  ]);
  if (!subj?.name) return { ok: false, error: t("qerr.subjectRequired") };
  if (!grade || grade.level == null) {
    return { ok: false, error: t("qerr.gradeRequired") };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t("bulk.pickFile") };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: t("bulk.tooLarge") };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: t("bulk.invalidJson") };
  }
  if (!Array.isArray(payload)) {
    return { ok: false, error: t("bulk.notArray") };
  }

  // Load the ACTIVE question types + their structure rules (single_choice is
  // 5 options / 1 correct since migration 055). Validation is driven by these
  // rules, never a hardcoded count, so future types adapt automatically. An
  // item that omits meta.type defaults to single_choice — the same default the
  // v3 RPC applies.
  const { data: typeRows } = await supabase
    .from("question_types")
    .select("code, name, options_required, correct_required")
    .eq("status", "active")
    .order("name");
  const activeTypes: ActiveTypeRule[] = ((typeRows ?? []) as any[]).map((r) => ({
    code: String(r.code ?? ""),
    name: String(r.name),
    options_required: r.options_required ?? null,
    correct_required: r.correct_required ?? null,
  }));
  const activeByNorm = new Map<string, ActiveTypeRule>();
  for (const r of activeTypes) activeByNorm.set(normTypeName(r.name), r);
  const defaultType = pickDefaultType(activeTypes);

  const total = payload.length;
  const errors: { index: number; error: string }[] = [];
  // Structurally valid rows, with their 1-based file index preserved so the
  // per-row error index stays consistent across TS-rejected + RPC rows.
  const validItems: Record<string, unknown>[] = [];
  const validFileIndex: number[] = [];

  payload.forEach((item, i) => {
    // GENERAL mode: meta.topic + meta.subtopic + meta.term (1..4) required.
    const msg = validateBulkItem(item, t, activeByNorm, defaultType, "general");
    if (msg) {
      errors.push({ index: i + 1, error: msg });
      return;
    }
    // Inject batch subject/grade (superseding any stale file values).
    validItems.push(
      overrideItemMeta(item, { subject: subj.name, grade_level: grade.level }),
    );
    validFileIndex.push(i + 1);
  });

  let successful = 0;
  if (validItems.length > 0) {
    const { data, error } = await supabase.rpc("bulk_insert_questions", {
      p_questions: validItems,
      p_filename: file.name,
    });
    if (error) {
      console.error("[admin] question bulk import failed", error.message);
      return { ok: false, error: t("err.server") };
    }
    const rpc = data as {
      total: number;
      successful: number;
      failed: number;
      errors: { index: number; error: string }[];
    };
    successful = rpc?.successful ?? 0;
    for (const e of rpc?.errors ?? []) {
      // The RPC's index is 1-based over the filtered array we sent — map it back
      // to the original file position so the row number the admin sees is right.
      const fileIdx = validFileIndex[e.index - 1] ?? e.index;
      errors.push({ index: fileIdx, error: mapRpcRowError(e.error, t) });
    }
  }

  errors.sort((a, b) => a.index - b.index);
  revalidatePath("/questions");
  return {
    ok: true,
    result: {
      total,
      successful,
      failed: total - successful,
      errors,
    },
  };
}


// L11: only UUID-shaped entries survive (never feed arbitrary strings into
// .in() filters) and the list is capped at 500 ids per bulk call.
function idList(formData: FormData): string[] {
  return String(formData.get("ids") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => UUID_RE.test(x))
    .slice(0, 500);
}

export async function bulkDeleteQuestions(formData: FormData): Promise<void> {
  await requireAdmin();
  const ids = idList(formData);
  if (ids.length === 0) return;
  const supabase = await createClient();
  // Scope guard: forged/stale ids can never delete olympiad-pool questions
  // from the general surface (those live and die with their package).
  await supabase
    .from("questions")
    .delete()
    .in("id", ids)
    .is("olympiad_package_id", null);
  revalidatePath("/questions");
}

// useActionState result so the table can show "N updated, M skipped" feedback
// (the owner reported bulk actions felt like silent no-ops).
export type BulkTransitionState = { updated: number; skipped: number } | null;

export async function bulkTransitionQuestions(
  _prev: BulkTransitionState,
  formData: FormData,
): Promise<BulkTransitionState> {
  // Guard FIRST — before touching any client-supplied FormData.
  const ctx = await requirePanelAccess();
  const action = s(formData, "__action");
  const tr = TRANSITIONS[action];
  const ids = idList(formData);
  if (!tr || ids.length === 0) return { updated: 0, skipped: ids.length };

  if (tr.perm && !ctx.isAdmin && !ctx.permissions.includes(tr.perm)) {
    redirect("/unauthorized");
  }

  const supabase = await createClient();
  const { data: qs } = await supabase
    .from("questions")
    .select("id, status, olympiad_package_id")
    .in("id", ids);

  // Only transition rows whose current status allows it. Olympiad-pool rows
  // are NEVER eligible (admins included) — they are managed through their
  // package only. RLS additionally restricts which rows actually update.
  const eligible = (qs ?? [])
    .filter(
      (q: { status: string; olympiad_package_id: string | null }) =>
        tr.from.includes(q.status) && !q.olympiad_package_id,
    )
    .map((q: { id: string }) => q.id);
  const skipped = ids.length - eligible.length;

  if (eligible.length === 0) {
    revalidatePath("/questions");
    return { updated: 0, skipped };
  }

  const { error } = await supabase
    .from("questions")
    .update({ status: tr.to, updated_by: ctx.profileId })
    .in("id", eligible)
    // Defence-in-depth: re-assert the scope on the UPDATE itself.
    .is("olympiad_package_id", null);
  revalidatePath("/questions");
  return error ? { updated: 0, skipped: ids.length } : { updated: eligible.length, skipped };
}

export async function bulkAssignTopic(formData: FormData): Promise<void> {
  const ctx = await requirePermission("content.create");
  const ids = idList(formData);
  const subjectId = s(formData, "subject_id");
  const topicId = s(formData, "topic_id");
  const subtopicId = s(formData, "subtopic_id");
  if (ids.length === 0 || !subjectId || !topicId) return;

  // Set subject+topic(+subtopic) together so the question's subject always
  // matches its topic. RLS restricts which rows actually update.
  const supabase = await createClient();
  // Module separation: never re-tag exam questions with olympiad-scoped
  // taxonomy (silent no-op, mirroring the other early returns above).
  if (!(await isExamTaxonomy(supabase, topicId, subtopicId || null))) return;
  await supabase
    .from("questions")
    .update({
      subject_id: subjectId,
      topic_id: topicId,
      subtopic_id: subtopicId || null,
      updated_by: ctx.profileId,
    })
    .in("id", ids)
    // Scope guard: never re-classify olympiad-pool questions from here.
    .is("olympiad_package_id", null);
  revalidatePath("/questions");
}
