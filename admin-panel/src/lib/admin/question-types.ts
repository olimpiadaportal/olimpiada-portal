"use server";

// Question-types admin CRUD (Admin-only). This module is intentionally
// dedicated (removed from the generic /manage registry) because question types
// carry per-type STRUCTURE RULES the generic ResourceForm cannot express:
// status (active = selectable for NEW questions), options_required (exact
// option count, 2..10 or empty = flexible) and correct_required (exact correct
// count, 1..options_required or empty = at least 1). These columns are the
// single source of truth also enforced by the DB validator
// assert_question_type_rules inside both bulk-import RPCs.
//
// Security: every mutation re-checks requireAdmin FIRST, whitelists status,
// range-checks the integers server-side, never writes `code` on update
// (immutable stable identifier), and audits via writeAuditLog. Errors are
// returned as short codes the client form maps to localized strings.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";

export type QuestionTypeRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  options_required: number | null;
  correct_required: number | null;
  supports_auto_grading: boolean;
  question_count?: number;
};

export type QuestionTypeSaveState = { error?: string } | null;
export type QuestionTypeDeleteState = { error?: string } | null;

const NAME_MAX = 120;
// Whitelist: a question type is either selectable for new questions (active)
// or kept only for existing content (inactive). No client string passes raw.
const STATUSES = new Set(["active", "inactive"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Auto-generate the internal stable `code` from `name` on CREATE only
// (mirrors the registry's autoCode behavior; code is immutable afterwards).
const AZ_MAP: Record<string, string> = {
  ə: "e", ö: "o", ü: "u", ğ: "g", ı: "i", ç: "c", ş: "s",
};
function slugifyCode(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[əöügıçş]/g, (c) => AZ_MAP[c] ?? c)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "item"
  );
}

// "" → null; otherwise a finite integer within [min, max] or undefined (=invalid).
function intOrNull(
  raw: FormDataEntryValue | null,
  min: number,
  max: number,
): number | null | undefined {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    return undefined;
  }
  return n;
}

export async function listQuestionTypes(): Promise<QuestionTypeRow[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("question_types")
    .select(
      "id, code, name, status, options_required, correct_required, supports_auto_grading, questions(count)",
    )
    .order("name");
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status,
    options_required: r.options_required,
    correct_required: r.correct_required,
    supports_auto_grading: !!r.supports_auto_grading,
    question_count: r.questions?.[0]?.count ?? 0,
  }));
}

export async function getQuestionType(
  id: string,
): Promise<QuestionTypeRow | null> {
  await requireAdmin();
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("question_types")
    .select(
      "id, code, name, status, options_required, correct_required, supports_auto_grading",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as QuestionTypeRow) ?? null;
}

export async function saveQuestionType(
  _prev: QuestionTypeSaveState,
  formData: FormData,
): Promise<QuestionTypeSaveState> {
  // Guard FIRST — before reading any client-supplied FormData.
  const ctx = await requireAdmin();

  const id = String(formData.get("__id") ?? "").trim();
  if (id && !UUID_RE.test(id)) return { error: "err.server" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "missing.name" };
  if (name.length > NAME_MAX) return { error: "err.tooLong" };

  const statusRaw = String(formData.get("status") ?? "").trim();
  const status = STATUSES.has(statusRaw) ? statusRaw : "active";

  // options_required: empty (flexible 2..10) or an exact integer 2..10.
  const optionsRequired = intOrNull(formData.get("options_required"), 2, 10);
  if (optionsRequired === undefined) return { error: "range.options" };
  // correct_required: empty (at least 1) or an exact integer
  // 1..options_required (1..10 when the option count is flexible).
  const correctRequired = intOrNull(
    formData.get("correct_required"),
    1,
    optionsRequired ?? 10,
  );
  if (correctRequired === undefined) return { error: "range.correct" };

  const supportsAutoGrading = formData.get("supports_auto_grading") != null;

  const payload: Record<string, unknown> = {
    name,
    status,
    options_required: optionsRequired,
    correct_required: correctRequired,
    supports_auto_grading: supportsAutoGrading,
  };

  const supabase = await createClient();
  let targetId = id || null;

  if (id) {
    // `code` is intentionally NEVER part of the update payload — immutable.
    const { error } = await supabase
      .from("question_types")
      .update(payload)
      .eq("id", id);
    if (error) {
      console.error("[admin] question type update failed", error.message);
      return { error: "err.server" };
    }
  } else {
    payload.code = slugifyCode(name);
    let { data: created, error } = await supabase
      .from("question_types")
      .insert(payload)
      .select("id")
      .single();
    if (error && (error as { code?: string }).code === "23505") {
      // `code` collided — retry once with a short random suffix.
      payload.code = `${slugifyCode(name)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      ({ data: created, error } = await supabase
        .from("question_types")
        .insert(payload)
        .select("id")
        .single());
    }
    if (error) {
      if ((error as { code?: string }).code === "23505")
        return { error: "duplicate" };
      console.error("[admin] question type insert failed", error.message);
      return { error: "err.server" };
    }
    targetId = (created as { id?: string } | null)?.id ?? null;
  }

  // Best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: id ? "admin.question_type.update" : "admin.question_type.create",
    targetTable: "question_types",
    targetId,
    metadata: {
      name,
      status,
      options_required: optionsRequired,
      correct_required: correctRequired,
      supports_auto_grading: supportsAutoGrading,
    },
  });

  revalidatePath("/question-types");
  redirect("/question-types");
}

export async function deleteQuestionType(
  _prev: QuestionTypeDeleteState,
  formData: FormData,
): Promise<QuestionTypeDeleteState> {
  // Guard FIRST — before reading any client-supplied FormData.
  const ctx = await requireAdmin();
  const id = String(formData.get("__id") ?? "").trim();
  if (!UUID_RE.test(id)) return { error: "err.server" };

  const supabase = await createClient();

  // Never delete a type that has questions — deactivate instead (archive over
  // delete, mirroring the platform-wide rule). Checked explicitly so the admin
  // gets a specific suggestion rather than a raw FK failure.
  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("type_id", id);
  if ((count ?? 0) > 0) return { error: "inUse" };

  const { error } = await supabase.from("question_types").delete().eq("id", id);
  if (error) {
    // 23503 = still referenced (race with the count above) → same suggestion.
    if ((error as { code?: string }).code === "23503") return { error: "inUse" };
    console.error("[admin] question type delete failed", error.message);
    return { error: "err.server" };
  }

  // Best-effort audit trail (never fails the mutation — handled inside).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.question_type.delete",
    targetTable: "question_types",
    targetId: id,
    severity: "warning",
  });

  revalidatePath("/question-types");
  redirect("/question-types");
}
