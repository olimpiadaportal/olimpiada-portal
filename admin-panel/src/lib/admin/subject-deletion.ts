"use server";

// Guarded subject deletion (Admin-only) — the panel half of migration 111.
//
// WHY THIS MODULE EXISTS
// ----------------------
// /manage/subjects used to delete a subject through the generic deleteRow():
// one bare `.delete()` whose error was discarded. That is a cascade nobody
// checked — subscription_subjects (a paid line item AND the receipt for money
// already taken), topics + subtopics, and a SET NULL across the question bank,
// test_attempts and the points ledger. Migration 111 turns all of that into
// counted, named, previewable blocks; this module is what lets an admin SEE
// them. `subjects` is refused by deleteRow() from now on, so this is the only
// route.
//
// SECURITY: requireAdmin() is the FIRST statement of every export (subjects are
// Admin-only — a Content Manager must never reach them), ids are UUID-shape
// checked before they are sent anywhere, the confirmation code is re-verified
// INSIDE the database (never here), no raw Postgres message ever reaches the
// client, and every destructive call writes a `warning` audit row.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import { getT } from "@/i18n/server";
import { fillTemplate } from "@/lib/admin/olympiad-per-attempt";
import { removeMediaAssets } from "@/lib/admin/media-sweep";
import { SUBJECT_DELETE_WORD } from "@/lib/admin/deletion-confirm";
import {
  deletionBlockText,
  parseDeletionBlocks,
  type DeletionBlock,
  type DestructiveState,
} from "@/lib/admin/deletion-hints";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The typed confirmation token. Subject codes are short slugs; the cap exists so
// nothing unbounded is sent to the database, not as validation (the DB compares).
const CODE_MAX = 80;

export type SubjectQuestionSplit = {
  total: number;
  deletable: number;
  archivedInstead: number;
  alreadyArchived: number;
};

export type SubjectDeletionPreview = {
  id: string;
  name: string;
  /** Typed by the admin to confirm; also shown, since `code` is not a UI field. */
  code: string;
  status: string;
  ok: boolean;
  /** Finished sentences, already localized — never raw hints. */
  blockedBy: string[];
  /** Consequences of the PURGE, not blocks. Empty for a subject nobody uses. */
  warnings: string[];
  activeSubscribers: number;
  questions: SubjectQuestionSplit;
  cascade: { topics: number; subtopics: number; dailyRounds: number };
};

/** The shared shape — see deletion-hints.ts. Aliased for the existing callers. */
export type SubjectDeletionState = DestructiveState;

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// Localizes a blocked_by[] / warnings[] array from a preview payload. Unknown
// hints are dropped rather than printed: an unknown hint means the SQL moved
// without its copy, and the raw string is both untranslated and internal.
function localizeBlocks(raw: unknown, lt: (key: string) => string): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const b of raw) {
    const text = deletionBlockText(b as DeletionBlock, lt);
    if (text) out.push(text);
  }
  return out;
}

/**
 * Side-effect free. Drives the confirmation dialog: what is blocking, what the
 * purge would cost, and the code the admin has to type.
 */
export async function loadSubjectDeletionPreview(
  subjectId: string,
): Promise<SubjectDeletionPreview | null> {
  await requireAdmin();
  if (typeof subjectId !== "string" || !UUID_RE.test(subjectId)) return null;

  const supabase = await createClient();
  const t = await getT();
  const { data, error } = await supabase.rpc("admin_preview_subject_deletion", {
    p_subject_id: subjectId,
  });
  if (error || !data) {
    console.error("[admin] subject deletion preview failed", error?.code ?? "unknown");
    return null;
  }

  const p = data as Record<string, any>;
  return {
    id: String(p.subject?.id ?? subjectId),
    name: String(p.subject?.name ?? ""),
    code: String(p.subject?.code ?? ""),
    status: String(p.subject?.status ?? ""),
    ok: Boolean(p.ok),
    blockedBy: localizeBlocks(p.blocked_by, t),
    warnings: localizeBlocks(p.warnings, t),
    activeSubscribers: n(p.active_subscribers),
    questions: {
      total: n(p.questions?.total),
      deletable: n(p.questions?.deletable),
      archivedInstead: n(p.questions?.archived_instead),
      alreadyArchived: n(p.questions?.already_archived),
    },
    cascade: {
      topics: n(p.cascade?.topics),
      subtopics: n(p.cascade?.subtopics),
      dailyRounds: n(p.cascade?.daily_rounds),
    },
  };
}

// Both mutations end the same way: sweep the media the transaction orphaned,
// audit, revalidate. Kept in one place so the purge and the delete cannot drift
// into auditing different things.
async function afterDestructiveCall(opts: {
  actorProfileId: string | null;
  action: string;
  subjectId: string;
  metadata: Record<string, unknown>;
  orphanedMediaIds: unknown;
}): Promise<void> {
  const supabase = await createClient();
  const ids = Array.isArray(opts.orphanedMediaIds)
    ? opts.orphanedMediaIds.map((x) => String(x))
    : [];
  const swept = await removeMediaAssets(supabase, ids);

  // Small metadata only: counts and the id. Never the deleted content — an
  // audit row is a record that it happened, not a backup of what was lost.
  await writeAuditLog({
    actorProfileId: opts.actorProfileId,
    action: opts.action,
    targetTable: "subjects",
    targetId: opts.subjectId,
    metadata: { ...opts.metadata, swept_media: swept },
    severity: "warning",
  });

  revalidatePath("/manage/subjects");
}

// Shared failure translation. A guarded-deletion error carries every reason in
// DETAIL, so the admin sees all of them at once instead of clearing one,
// re-clicking, and meeting the next. Raw Postgres text is logged, never shown.
async function toFailure(
  error: { code?: string | null; hint?: string | null; details?: string | null; message?: string } | null,
  where: string,
): Promise<{ ok: false; error: string; blocks: string[] }> {
  const t = await getT();
  const blocks = parseDeletionBlocks(error).map((b) => deletionBlockText(b, t) ?? "");
  console.error(`[admin] ${where} failed`, error?.code ?? "unknown", error?.hint ?? "");
  return {
    ok: false,
    error: blocks.length > 0 ? t("del.err.blocked") : t("err.server"),
    blocks: blocks.filter(Boolean),
  };
}

// Refusal for a token that never had a chance of matching. Rendered from the
// same hint the RPC would have raised, so the sentence is identical whichever
// layer catches it.
async function tokenRefusal(): Promise<{ ok: false; error: string; blocks: string[] }> {
  const t = await getT();
  return {
    ok: false,
    error: t("del.err.blocked"),
    blocks: [deletionBlockText({ hint: "confirmation_mismatch" }, t) ?? t("err.server")],
  };
}

/**
 * Clears a subject's GENERAL-BANK questions without touching the subject, its
 * topics or its subtopics. Unanswered questions are deleted, answered ones are
 * ARCHIVED — the database decides that split inside the DELETE, never here.
 *
 * This is also the prerequisite for deleting the subject at all: migration 111
 * blocks a subject delete while the bank is non-empty, so the bank is always
 * cleared as its own confirmed, counted step rather than as an invisible side
 * effect of removing the container.
 */
export async function purgeSubjectQuestions(
  _prev: SubjectDeletionState,
  formData: FormData,
): Promise<SubjectDeletionState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const id = String(formData.get("__id") ?? "").trim();
  const code = String(formData.get("__code") ?? "").trim().slice(0, CODE_MAX);
  if (!UUID_RE.test(id)) return { ok: false, error: t("err.server"), blocks: [] };

  const supabase = await createClient();
  // Refused BEFORE the RPC: an unconfirmed purge must not reach the function
  // that empties a question bank at all. The database compares the token again
  // under its own lock — that comparison, not this one, is the control.
  // Same gate as the delete branch: both live in ONE dialog, so both are
  // confirmed by the same typed word and both resolve the real code server-side.
  const realCode = await resolveSubjectCode(supabase, id, code);
  if (realCode === null) return await tokenRefusal();
  const { data, error } = await supabase.rpc("admin_purge_subject_questions", {
    p_subject_id: id,
    p_expected_code: realCode,
  });
  if (error || !data) return await toFailure(error, "subject question purge");

  const r = data as Record<string, any>;
  await afterDestructiveCall({
    actorProfileId: ctx.profileId,
    action: "admin.subject.purge_questions",
    subjectId: id,
    metadata: {
      deleted: n(r.deleted_questions),
      archived: n(r.archived_questions),
      retained: n(r.retained_questions),
      repaired_practice_sets: n(r.repaired_practice_sets),
      media_truncated: Boolean(r.media_truncated),
    },
    orphanedMediaIds: r.orphaned_media_ids,
  });

  return {
    ok: true,
    message: fillTemplate(t("del.done.purged"), {
      deleted: n(r.deleted_questions),
      archived: n(r.archived_questions),
    }),
  };
}

/**
 * Deletes a subject that is already empty. When answered questions survive
 * anywhere in its bank the SUBJECT IS ARCHIVED instead — decided by the
 * database BEFORE anything is destroyed, so the reassuring outcome never
 * arrives after the bank is gone.
 */
/**
 * The confirmation gate for both destructive subject branches.
 *
 * Returns the row's OWN code (what the RPC compares under its lock) only after
 * the admin has typed the literal word. The browser never supplies the code, so
 * a caller who posts this endpoint directly cannot confirm anything by knowing
 * a subject's code — they have to type the word AND the row still has to exist.
 *
 * null = refuse. The caller turns that into the generic mismatch message; the
 * reason is never distinguished for the client.
 */
async function resolveSubjectCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  typed: string,
): Promise<string | null> {
  if (typed !== SUBJECT_DELETE_WORD) return null;
  const { data, error } = await supabase
    .from("subjects")
    .select("code")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    console.error("[admin] subject code lookup failed");
    return null;
  }
  const code = String((data as { code: string }).code ?? "").trim();
  return code === "" ? null : code;
}

export async function deleteSubject(
  _prev: SubjectDeletionState,
  formData: FormData,
): Promise<SubjectDeletionState> {
  // Guard FIRST — before any client-supplied FormData is read.
  const ctx = await requireAdmin();
  const t = await getT();

  const id = String(formData.get("__id") ?? "").trim();
  const code = String(formData.get("__code") ?? "").trim().slice(0, CODE_MAX);
  if (!UUID_RE.test(id)) return { ok: false, error: t("err.server"), blocks: [] };

  const supabase = await createClient();
  const realCode = await resolveSubjectCode(supabase, id, code);
  if (realCode === null) return await tokenRefusal();
  const { data, error } = await supabase.rpc("admin_delete_subject", {
    p_subject_id: id,
    p_expected_code: realCode,
  });
  if (error || !data) return await toFailure(error, "subject delete");

  const r = data as Record<string, any>;
  const archived = Boolean(r.subject_archived);
  await afterDestructiveCall({
    actorProfileId: ctx.profileId,
    action: archived ? "admin.subject.archive_instead_of_delete" : "admin.subject.delete",
    subjectId: id,
    metadata: {
      archived,
      reason: typeof r.reason === "string" ? r.reason : undefined,
      deleted: n(r.deleted_questions),
      retained: n(r.retained_questions),
    },
    orphanedMediaIds: r.orphaned_media_ids,
  });

  return {
    ok: true,
    message: archived ? t("del.done.archived") : t("del.done.deleted"),
  };
}
