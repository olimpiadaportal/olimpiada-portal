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

// `ok` is set only on the modal ("stay") path: the create-question modal needs
// a success result instead of a redirect so it can close and refresh in place.
export type QuestionState = { error?: string; ok?: boolean } | null;

// Server-side length caps on free text (defence-in-depth; the UI also limits).
const BODY_MAX = 8000; // question body / prompt
const EXPLANATION_MAX = 8000;
const OPTION_MAX = 2000; // answer-option text

const META_FIELDS = [
  "grade_id",
  "subject_id",
  "topic_id",
  "subtopic_id",
  "type_id",
  "olympiad_type_id",
  "source_id",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // M1: PRIVATE olympiad-pool questions (olympiad_package_id set) are
  // Admin-only. The list already excludes them for content managers; also
  // reject a direct edit-by-id here (generic error, no detail leak).
  if (id && !ctx.isAdmin) {
    const { data: target } = await supabase
      .from("questions")
      .select("olympiad_package_id")
      .eq("id", id)
      .maybeSingle();
    if (!target || target.olympiad_package_id) return { error: t("err.server") };
  }

  const meta: Record<string, unknown> = {};
  for (const f of META_FIELDS) {
    const v = s(formData, f);
    meta[f] = v === "" ? null : v;
  }
  if (!meta.subject_id) return { error: t("qerr.subjectRequired") };
  if (!meta.grade_id) return { error: t("qerr.gradeRequired") };
  if (!meta.type_id) return { error: t("qerr.typeRequired") };
  // Difficulty is optional — an admin may tag it later (used only for server-side
  // random selection, never chosen by students).

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

  // Clamp to a sane integer range (M2): a huge/NaN client value must never
  // drive an unbounded loop. The UI allows at most 10 options.
  const countRaw = Math.floor(Number(s(formData, "opt_count")) || 0);
  const count = Math.min(10, Math.max(0, countRaw));
  const options: { text: string; is_correct: boolean; order_index: number }[] = [];
  for (let i = 0; i < count; i++) {
    const text = s(formData, `opt.${i}.text`);
    if (!text) continue;
    if (text.length > OPTION_MAX) return { error: t("err.tooLong") };
    options.push({
      text,
      is_correct: formData.get(`opt.${i}.correct`) != null,
      order_index: options.length,
    });
  }

  // Type-aware answer validation, driven by the per-type structure rules on
  // question_types (status / options_required / correct_required) — the same
  // config the DB validator assert_question_type_rules enforces inside the
  // bulk-import RPCs. Authoritative here regardless of what the client UI shows.
  if (!UUID_RE.test(meta.type_id as string)) {
    return { error: t("qerr.typeRequired") };
  }
  const correctCount = options.filter((o) => o.is_correct).length;
  const { data: qType } = await supabase
    .from("question_types")
    .select("code, status, options_required, correct_required")
    .eq("id", meta.type_id as string)
    .maybeSingle();
  if (!qType) return { error: t("qerr.typeRequired") };

  // Only ACTIVE types may be chosen for NEW questions. Existing questions keep
  // their (possibly deactivated) type, but the structure rules still apply.
  if (!id && qType.status !== "active") {
    return { error: t("qval.typeInactive") };
  }

  const optionsRequired: number | null = qType.options_required;
  const correctRequired: number | null = qType.correct_required;
  if (optionsRequired != null) {
    // Exact non-empty-option count (e.g. exactly 5 for multiple_choice).
    if (options.length !== optionsRequired) {
      return {
        error: t("qval.exactOptions").replace("{n}", String(optionsRequired)),
      };
    }
  } else if (options.length < 2 || options.length > 10) {
    // Flexible types: 2..10 options (the count clamp above already caps at 10).
    return { error: t("qval.minOptions") };
  }
  if (correctRequired != null) {
    // Exact correct count (e.g. exactly 1 for multiple_choice).
    if (correctCount !== correctRequired) {
      return {
        error: t("qval.exactCorrect").replace("{n}", String(correctRequired)),
      };
    }
  } else if (correctCount < 1) {
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
    if (error || !q) {
      console.error("[admin] question insert failed", error?.message);
      return { error: t("err.server") };
    }
    questionId = q.id;
  } else {
    const { error } = await supabase
      .from("questions")
      .update({ ...meta, primary_locale: locale, updated_by: ctx.profileId })
      .eq("id", questionId);
    if (error) {
      console.error("[admin] question update failed", error.message);
      return { error: t("err.server") };
    }
  }

  const cleanup = async (context: string, msg?: string): Promise<QuestionState> => {
    console.error("[admin]", context, msg);
    if (!id && questionId) {
      // Only undo a question we created in this call.
      await supabase.from("questions").delete().eq("id", questionId);
    }
    return { error: t("err.server") };
  };

  // Azerbaijani translation (body/prompt).
  {
    const { error } = await supabase
      .from("question_translations")
      .upsert(
        { question_id: questionId, locale, body, prompt: prompt || null },
        { onConflict: "question_id,locale" },
      );
    if (error) return cleanup("question translation upsert failed", error.message);
  }

  // Azerbaijani explanation (optional).
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

  revalidatePath("/questions");
  // Modal path (__stay=1): return success instead of navigating — the client
  // closes the modal and refreshes the list. The edit page keeps the redirect.
  if (s(formData, "__stay") === "1") {
    return { ok: true };
  }
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
    .select("status, created_by, olympiad_package_id")
    .eq("id", id)
    .maybeSingle();
  if (!q || !tr.from.includes(q.status)) return;

  // M1: olympiad-pool questions are Admin-only — content managers must not
  // transition them even with a direct id.
  if (!ctx.isAdmin && q.olympiad_package_id) return;

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
  // Guard FIRST — before touching any client-supplied FormData.
  await requireAdmin();
  const id = s(formData, "__id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("questions").delete().eq("id", id);
  revalidatePath("/questions");
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
  const t = await getT();

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

  // Override every item's meta.subject / meta.grade_level with the values
  // resolved from the selected ids. Old-format files that still carry these
  // fields are silently superseded (backward compatible by design).
  const items = payload.map((item) =>
    overrideItemMeta(item, {
      subject: subj.name,
      grade_level: grade.level,
    }),
  );

  const { data, error } = await supabase.rpc("bulk_insert_questions", {
    p_questions: items,
    p_filename: file.name,
  });
  if (error) {
    console.error("[admin] question bulk import failed", error.message);
    return { ok: false, error: t("err.server") };
  }

  const result = data as {
    total: number;
    successful: number;
    failed: number;
    errors: { index: number; error: string }[];
  };

  revalidatePath("/questions");
  return {
    ok: true,
    result: {
      ...result,
      errors: sanitizeRowErrors(result?.errors, t("bulk.rowFailed")),
    },
  };
}

// Merges batch-level meta values (subject name / grade level) into one import
// item, preserving everything else. Non-object items pass through as a bare
// meta wrapper — the RPC then reports them as per-row failures.
function overrideItemMeta(
  item: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const obj =
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
  const meta =
    obj.meta && typeof obj.meta === "object" && !Array.isArray(obj.meta)
      ? (obj.meta as Record<string, unknown>)
      : {};
  return { ...obj, meta: { ...meta, ...patch } };
}

// L9: the RPC records raw SQLERRM per failed row. Our own validation raises
// start with "bulk_insert" and are safe/useful; anything else (constraint
// violations, internal Postgres text) is replaced with a generic trilingual
// message so DB internals never reach the client.
function sanitizeRowErrors(
  errors: { index: number; error: string }[] | null | undefined,
  generic: string,
): { index: number; error: string }[] {
  return (errors ?? []).map((e) => ({
    index: e.index,
    error:
      typeof e.error === "string" && e.error.startsWith("bulk_insert")
        ? e.error
        : generic,
  }));
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
  await supabase.from("questions").delete().in("id", ids);
  revalidatePath("/questions");
}

export async function bulkTransitionQuestions(formData: FormData): Promise<void> {
  // Guard FIRST — before touching any client-supplied FormData.
  const ctx = await requirePanelAccess();
  const action = s(formData, "__action");
  const tr = TRANSITIONS[action];
  const ids = idList(formData);
  if (!tr || ids.length === 0) return;

  if (tr.perm && !ctx.isAdmin && !ctx.permissions.includes(tr.perm)) {
    redirect("/unauthorized");
  }

  const supabase = await createClient();
  const { data: qs } = await supabase
    .from("questions")
    .select("id, status, created_by, olympiad_package_id")
    .in("id", ids);

  // Only transition rows whose current status allows it (submit also needs
  // creator/admin; M1: olympiad-pool rows stay Admin-only). RLS additionally
  // restricts which rows actually update.
  const eligible = (qs ?? [])
    .filter(
      (q: {
        status: string;
        created_by: string | null;
        olympiad_package_id: string | null;
      }) =>
        tr.from.includes(q.status) &&
        (ctx.isAdmin || !q.olympiad_package_id) &&
        (action !== "submit" || ctx.isAdmin || q.created_by === ctx.profileId),
    )
    .map((q: { id: string }) => q.id);
  if (eligible.length === 0) {
    revalidatePath("/questions");
    return;
  }

  await supabase
    .from("questions")
    .update({ status: tr.to, updated_by: ctx.profileId })
    .in("id", eligible);
  revalidatePath("/questions");
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
  await supabase
    .from("questions")
    .update({
      subject_id: subjectId,
      topic_id: topicId,
      subtopic_id: subtopicId || null,
      updated_by: ctx.profileId,
    })
    .in("id", ids);
  revalidatePath("/questions");
}
