"use server";

// Curriculum Structure (/curriculum) — server actions for the merged
// Topics → Subtopics tree that REPLACED the generic /manage/topics and
// /manage/subtopics registry pages.
//
// Security posture (identical to lib/admin/locations.ts):
//   * requireAdmin() is the FIRST statement of every action — before any
//     FormData / argument is read;
//   * every client-supplied id is UUID-shape-checked AND re-verified for
//     module scope (an olympiad-scoped topic, created by an olympiad package
//     bulk import, can never be edited or deleted from here — even via a
//     forged post);
//   * enums (term, status) are whitelisted server-side; names are capped;
//   * raw Postgres error text NEVER reaches the client — generic codes only,
//     details go to the server log;
//   * every mutation writes an audit row.
//
// DB behaviour this file has to respect (verified against 003/004/011):
//   * subtopics.topic_id  → topics(id) ON DELETE CASCADE — deleting a topic
//     silently takes its whole subtopic subtree with it (surfaced in the
//     impact preview).
//   * questions.topic_id / .subtopic_id → ON DELETE **SET NULL**. The DB would
//     therefore ACCEPT deleting a topic that still has questions and quietly
//     strip their taxonomy, producing rows that `question_taxonomy_guard`
//     would refuse to insert today. So the delete is BLOCKED here — in the
//     preview AND re-checked inside the delete — instead of being allowed to
//     corrupt the bank. Archive/move the questions first.
//   * trg_subtopic_term_guard inherits a NULL subtopic term from the parent
//     topic and rejects a mismatch → saveSubtopic always writes term = null
//     and lets the DB derive it (this is also what makes MOVING a subtopic to
//     a topic in another term work).
//   * trg_topic_term_cascade rewrites term on every child subtopic AND every
//     question of the topic when a topic's term changes — the edit form warns
//     about this.
//   * There is NO unique index on topics(subject_id, grade_id, name) or
//     subtopics(topic_id, name). Adding one is a schema change (own migration
//     + backport), so duplicates are prevented here with an explicit
//     case-insensitive check. Not a race-proof guarantee — a genuine
//     constraint is the follow-up — but it stops the realistic case and keeps
//     the curriculum importer's match keys unambiguous.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guards";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  CURRICULUM_KINDS,
  LOCALIZED_NAME_LOCALES,
  NAME_MAX,
  foldName,
  isCurriculumStatus,
  isUuid,
  normalizeName,
  parseLocalizedName,
  parseTerm,
  type CurriculumKind,
  type DeleteImpact,
  type LocalizedNameLocale,
} from "@/lib/admin/curriculum-shared";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Stay-mode result: the modal closes and the tree refreshes in place. */
export type CurriculumSaveState = { ok?: true; error?: string } | null;
export type CurriculumDeleteResult = { ok: true } | { error: string };
export type CurriculumImpactResult =
  | ({ ok: true } & DeleteImpact)
  | { error: string };

const KINDS = new Set<string>(CURRICULUM_KINDS);

// ---------------------------------------------------------------------------
// Module-separation helpers (Exams taxonomy vs olympiad package pools)
// ---------------------------------------------------------------------------

async function topicIsExamScoped(db: Db, topicId: string): Promise<boolean> {
  const { data } = await db
    .from("topics")
    .select("scope")
    .eq("id", topicId)
    .maybeSingle();
  return data?.scope === "exam";
}

async function subtopicParentTopicId(
  db: Db,
  subtopicId: string,
): Promise<string | null> {
  const { data } = await db
    .from("subtopics")
    .select("topic_id")
    .eq("id", subtopicId)
    .maybeSingle();
  const parent = data?.topic_id;
  return typeof parent === "string" ? parent : null;
}

// ---------------------------------------------------------------------------
// Question references (the delete blocker)
// ---------------------------------------------------------------------------

/**
 * Questions that would lose their taxonomy if this topic were deleted: rows
 * pointing at the topic itself OR at any of its subtopics (which cascade away
 * with it). One `or()` rather than two counts, so a legacy row that carries
 * only one of the two ids is counted exactly once.
 *
 * The subtopic ids are re-checked with isUuid() before being interpolated into
 * the filter expression — they come from the database, but the rule here is
 * that nothing unvalidated is ever concatenated into a PostgREST filter.
 */
async function countQuestionsForTopic(db: Db, topicId: string): Promise<number> {
  const { data: subIds } = await db
    .from("subtopics")
    .select("id")
    .eq("topic_id", topicId);
  const ids = ((subIds ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter(isUuid);

  const base = db.from("questions").select("id", { count: "exact", head: true });
  const { count } =
    ids.length > 0
      ? await base.or(`topic_id.eq.${topicId},subtopic_id.in.(${ids.join(",")})`)
      : await base.eq("topic_id", topicId);
  return count ?? 0;
}

async function countQuestionsForSubtopic(
  db: Db,
  subtopicId: string,
): Promise<number> {
  const { count } = await db
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("subtopic_id", subtopicId);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Duplicate detection (no DB unique index exists — see the header)
// ---------------------------------------------------------------------------

async function topicNameTaken(
  db: Db,
  args: {
    subjectId: string;
    gradeId: string | null;
    name: string;
    excludeId: string | null;
  },
): Promise<boolean> {
  let qb = db
    .from("topics")
    .select("id, name")
    .eq("scope", "exam")
    .eq("subject_id", args.subjectId);
  qb = args.gradeId ? qb.eq("grade_id", args.gradeId) : qb.is("grade_id", null);
  const { data } = await qb;
  const target = foldName(args.name);
  return ((data ?? []) as { id: string; name: string }[]).some(
    (r) => r.id !== args.excludeId && foldName(r.name) === target,
  );
}

async function subtopicNameTaken(
  db: Db,
  args: { topicId: string; name: string; excludeId: string | null },
): Promise<boolean> {
  const { data } = await db
    .from("subtopics")
    .select("id, name")
    .eq("topic_id", args.topicId);
  const target = foldName(args.name);
  return ((data ?? []) as { id: string; name: string }[]).some(
    (r) => r.id !== args.excludeId && foldName(r.name) === target,
  );
}

// ---------------------------------------------------------------------------
// EN/RU names (migration 114)
// ---------------------------------------------------------------------------

type LocalizedNames = Record<LocalizedNameLocale, string | null>;

/** Read + normalize the two optional translation fields off the FormData. */
function readLocalizedNames(
  formData: FormData,
): { names: LocalizedNames } | { error: string } {
  const names = { en: null, ru: null } as LocalizedNames;
  for (const loc of LOCALIZED_NAME_LOCALES) {
    const parsed = parseLocalizedName(formData.get(`name_${loc}`));
    // The client caps the inputs at NAME_MAX too, but maxLength is UX — this is
    // the gate. Same cap as the AZ name; the DB has no length constraint.
    if (parsed.tooLong) return { error: "too.long.tr" };
    names[loc] = parsed.value;
  }
  return { names };
}

/**
 * Write the EN/RU rows for a topic/subtopic.
 *
 * A CLEARED field DELETES that locale's row instead of storing '': reads
 * resolve with coalesce(translation, base name), so a blank row would render an
 * empty label — and the DB's ck_*_name_not_blank rejects it anyway.
 *
 * This runs AFTER the base row is written and outside any transaction
 * (PostgREST has none), so a failure here leaves a saved topic with stale
 * translations. That is reported honestly to the admin rather than being
 * reframed as a total failure — the topic really did save.
 */
async function writeNameTranslations(
  db: Db,
  kind: CurriculumKind,
  targetId: string,
  names: LocalizedNames,
): Promise<boolean> {
  const table = kind === "topic" ? "topic_translations" : "subtopic_translations";
  const fk = kind === "topic" ? "topic_id" : "subtopic_id";

  for (const loc of LOCALIZED_NAME_LOCALES) {
    const value = names[loc];
    const { error } =
      value === null
        ? await db.from(table).delete().eq(fk, targetId).eq("locale", loc)
        : await db
            .from(table)
            .upsert({ [fk]: targetId, locale: loc, name: value }, { onConflict: `${fk},locale` });
    if (error) {
      console.error(`[admin] ${table} ${loc} write failed`, error.message);
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// saveTopic
// ---------------------------------------------------------------------------

export async function saveTopic(
  _prev: CurriculumSaveState,
  formData: FormData,
): Promise<CurriculumSaveState> {
  const ctx = await requireAdmin();

  const id = String(formData.get("__id") ?? "").trim();
  const subjectId = String(formData.get("subject_id") ?? "").trim();
  const gradeRaw = String(formData.get("grade_id") ?? "").trim();
  const name = normalizeName(formData.get("name"));
  const term = parseTerm(formData.get("term"));
  const statusRaw = String(formData.get("status") ?? "active").trim();

  if (id && !isUuid(id)) return { error: "err.server" };
  if (!isUuid(subjectId)) return { error: "missing.subject" };
  if (gradeRaw && !isUuid(gradeRaw)) return { error: "err.server" };
  const gradeId = gradeRaw || null;
  if (!name) return { error: "missing.name" };
  if (name.length > NAME_MAX) return { error: "too.long" };
  if (term === null) return { error: "missing.term" };
  if (!isCurriculumStatus(statusRaw)) return { error: "err.server" };
  const tr = readLocalizedNames(formData);
  if ("error" in tr) return { error: tr.error };

  const db = await createClient();

  // Module separation: an existing row must be exam-scoped to be touched here.
  if (id && !(await topicIsExamScoped(db, id))) return { error: "err.server" };

  if (
    await topicNameTaken(db, { subjectId, gradeId, name, excludeId: id || null })
  ) {
    return { error: "duplicate" };
  }

  // `scope` is written EXPLICITLY rather than relying on the column default so
  // this page can never author an olympiad-scoped topic by accident.
  const payload = {
    subject_id: subjectId,
    grade_id: gradeId,
    name,
    term,
    status: statusRaw,
    scope: "exam",
  };

  let targetId: string | null = id || null;
  if (id) {
    const { error } = await db.from("topics").update(payload).eq("id", id);
    if (error) {
      console.error("[admin] topic update failed", error.message);
      return { error: "err.server" };
    }
  } else {
    const { data: created, error } = await db
      .from("topics")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      console.error("[admin] topic insert failed", error.message);
      return { error: "err.server" };
    }
    targetId = (created as { id?: string } | null)?.id ?? null;
  }

  const trOk = targetId ? await writeNameTranslations(db, "topic", targetId, tr.names) : false;

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: id ? "admin.topic.update" : "admin.topic.create",
    targetTable: "topics",
    targetId,
    // Booleans only — the audit trail records THAT a translation was set, never
    // the bodies.
    metadata: {
      name,
      term,
      status: statusRaw,
      hasEn: tr.names.en !== null,
      hasRu: tr.names.ru !== null,
    },
  });

  revalidatePath("/curriculum");
  if (!trOk) return { error: "tr.failed" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// saveSubtopic
// ---------------------------------------------------------------------------

export async function saveSubtopic(
  _prev: CurriculumSaveState,
  formData: FormData,
): Promise<CurriculumSaveState> {
  const ctx = await requireAdmin();

  const id = String(formData.get("__id") ?? "").trim();
  const topicId = String(formData.get("topic_id") ?? "").trim();
  const name = normalizeName(formData.get("name"));
  const statusRaw = String(formData.get("status") ?? "active").trim();

  if (id && !isUuid(id)) return { error: "err.server" };
  if (!isUuid(topicId)) return { error: "missing.topic" };
  if (!name) return { error: "missing.name" };
  if (name.length > NAME_MAX) return { error: "too.long" };
  if (!isCurriculumStatus(statusRaw)) return { error: "err.server" };
  const tr = readLocalizedNames(formData);
  if ("error" in tr) return { error: tr.error };

  const db = await createClient();

  // Both the TARGET parent and (on edit) the CURRENT parent must be exam-scoped.
  if (!(await topicIsExamScoped(db, topicId))) return { error: "err.server" };
  if (id) {
    const currentParent = await subtopicParentTopicId(db, id);
    if (!currentParent || !(await topicIsExamScoped(db, currentParent)))
      return { error: "err.server" };
  }

  if (await subtopicNameTaken(db, { topicId, name, excludeId: id || null })) {
    return { error: "duplicate" };
  }

  // term is intentionally NULL: trg_subtopic_term_guard inherits it from the
  // parent topic. Writing it explicitly would break moving a subtopic to a
  // topic that sits in a different Rüb (the guard rejects a mismatch).
  const payload = { topic_id: topicId, name, term: null, status: statusRaw };

  let targetId: string | null = id || null;
  if (id) {
    const { error } = await db.from("subtopics").update(payload).eq("id", id);
    if (error) {
      console.error("[admin] subtopic update failed", error.message);
      return { error: "err.server" };
    }
  } else {
    const { data: created, error } = await db
      .from("subtopics")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      console.error("[admin] subtopic insert failed", error.message);
      return { error: "err.server" };
    }
    targetId = (created as { id?: string } | null)?.id ?? null;
  }

  const trOk = targetId ? await writeNameTranslations(db, "subtopic", targetId, tr.names) : false;

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: id ? "admin.subtopic.update" : "admin.subtopic.create",
    targetTable: "subtopics",
    targetId,
    metadata: {
      name,
      status: statusRaw,
      topicId,
      hasEn: tr.names.en !== null,
      hasRu: tr.names.ru !== null,
    },
  });

  revalidatePath("/curriculum");
  if (!trOk) return { error: "tr.failed" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete impact preview + delete
// ---------------------------------------------------------------------------

export async function getCurriculumDeleteImpact(
  kind: CurriculumKind,
  id: string,
): Promise<CurriculumImpactResult> {
  await requireAdmin();
  if (!KINDS.has(kind) || !isUuid(id)) return { error: "err.server" };

  const db = await createClient();

  if (kind === "topic") {
    if (!(await topicIsExamScoped(db, id))) return { error: "err.server" };
    const [{ count: subCount }, questions] = await Promise.all([
      db
        .from("subtopics")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", id),
      countQuestionsForTopic(db, id),
    ]);
    return { ok: true, subtopics: subCount ?? 0, questions };
  }

  const parent = await subtopicParentTopicId(db, id);
  if (!parent || !(await topicIsExamScoped(db, parent)))
    return { error: "err.server" };
  return { ok: true, subtopics: 0, questions: await countQuestionsForSubtopic(db, id) };
}

export async function deleteCurriculumNode(
  kind: CurriculumKind,
  id: string,
): Promise<CurriculumDeleteResult> {
  const ctx = await requireAdmin();
  if (!KINDS.has(kind) || !isUuid(id)) return { error: "err.server" };

  const db = await createClient();

  // Re-verify scope AND re-count questions at delete time: the impact preview
  // is UX, this is the actual gate (the DB would SET NULL and corrupt the bank).
  let questionCount: number;
  let subtopicCount = 0;
  if (kind === "topic") {
    if (!(await topicIsExamScoped(db, id))) return { error: "err.server" };
    questionCount = await countQuestionsForTopic(db, id);
    const { count } = await db
      .from("subtopics")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", id);
    subtopicCount = count ?? 0;
  } else {
    const parent = await subtopicParentTopicId(db, id);
    if (!parent || !(await topicIsExamScoped(db, parent)))
      return { error: "err.server" };
    questionCount = await countQuestionsForSubtopic(db, id);
  }
  if (questionCount > 0) return { error: "hasQuestions" };

  const table = kind === "topic" ? "topics" : "subtopics";
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) {
    console.error(`[admin] ${kind} delete failed`, error.message);
    return { error: "err.server" };
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: `admin.${kind}.delete`,
    targetTable: table,
    targetId: id,
    metadata: kind === "topic" ? { cascadedSubtopics: subtopicCount } : undefined,
    severity: "warning",
  });

  revalidatePath("/curriculum");
  return { ok: true };
}
