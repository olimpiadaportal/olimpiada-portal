// Migration 111's machine-readable deletion hints, turned into sentences.
//
// Every guarded-deletion function raises `errcode = check_violation` with a
// HINT (the single reason, or a generic *_not_deletable when there are several)
// and a DETAIL carrying `{"blocks":[{hint,count},…]}`. The previews return the
// same {hint, count} shape in `blocked_by[]` / `warnings[]`. One map serves all
// of them, so a hint can never render in one place and fall through to "server
// error" in another.
//
// Plain module (no "use server"): imported by the server actions AND by the
// server page that hands the strings to the client dialog, exactly like
// olympiad-strings.ts.
import { fillTemplate } from "@/lib/admin/olympiad-per-attempt";

export type DeletionBlock = { hint: string; count?: number };

/**
 * What every guarded-deletion server action returns, and what the shared
 * confirmation dialog renders. ONE shape for subjects, packages and grade
 * pools: the dialog is generic over the payload, so a branch that answered in
 * its own shape would need its own dialog — which is the duplication this
 * module exists to prevent.
 *
 * `redirectTo` is set only when the page the dialog lives on no longer exists
 * (a deleted package's edit page). It is a fixed server-side literal, never a
 * value derived from client input — the panel's redirect rule allows no other
 * source.
 */
export type DestructiveState =
  | null
  | { ok: true; message: string; redirectTo?: string }
  | { ok: false; error: string; blocks: string[] };

// hint → i18n key. Anything not listed here is deliberately NOT rendered from a
// database string: an unknown hint means the SQL changed without its copy, and
// showing the raw Postgres message would leak internals (and be untranslated).
const HINT_KEYS: Record<string, string> = {
  // Olympiad package
  package_has_purchases: "del.hint.packageHasPurchases",
  package_is_active: "del.hint.packageIsActive",
  package_not_deletable: "del.hint.packageNotDeletable",
  not_archived: "del.hint.notArchived",
  // Olympiad grade pool
  grade_pool_not_deletable: "del.hint.gradePoolNotDeletable",
  last_grade: "del.hint.lastGrade",
  grade_has_purchases: "del.hint.gradeHasPurchases",
  grade_has_purchases_purge: "del.hint.gradeHasPurchasesPurge",
  // Subject
  subject_not_deletable: "del.hint.subjectNotDeletable",
  subject_in_subscriptions: "del.hint.subjectInSubscriptions",
  subject_has_billing_history: "del.hint.subjectHasBillingHistory",
  subject_has_attempts: "del.hint.subjectHasAttempts",
  subject_has_points: "del.hint.subjectHasPoints",
  subject_in_olympiad_packages: "del.hint.subjectInOlympiadPackages",
  subject_has_topics: "del.hint.subjectHasTopics",
  subject_has_questions: "del.hint.subjectHasQuestions",
  subject_has_round_attempts: "del.hint.subjectHasRoundAttempts",
  // Shared
  live_attempts: "del.hint.liveAttempts",
  confirmation_mismatch: "del.hint.confirmationMismatch",
  answered_questions_retained: "del.hint.answeredQuestionsRetained",
  // A consequence, not a block — see admin_preview_subject_deletion.
  subject_purge_active_subscribers: "del.hint.activeSubscribers",
};

export function deletionHintKey(hint: string | null | undefined): string | null {
  if (!hint) return null;
  return HINT_KEYS[hint] ?? null;
}

/**
 * One block/warning as a finished sentence. `{n}` is the count the SQL
 * reported; an unknown hint returns null so the caller falls back to its own
 * generic message rather than printing a raw database string.
 */
export function deletionBlockText(
  block: DeletionBlock,
  lt: (key: string) => string,
): string | null {
  const key = deletionHintKey(block.hint);
  if (!key) return null;
  return fillTemplate(lt(key), { n: block.count ?? 0 });
}

// Cap on the DETAIL payload we will parse. It is server-generated, but a size
// bound on anything fed to JSON.parse is the house rule, and the real payload
// is never more than a few hundred bytes.
const DETAIL_MAX = 4000;

/**
 * The blocks behind a failed guarded-deletion call.
 *
 * DETAIL carries every reason at once, which is the whole point of the shared
 * *_deletion_blocks() helpers — the admin sees all of them instead of clearing
 * one, re-clicking, and meeting the next. When DETAIL is missing or malformed
 * the HINT alone still yields one usable sentence.
 */
export function parseDeletionBlocks(
  error: { hint?: string | null; details?: string | null } | null,
): DeletionBlock[] {
  if (!error) return [];
  const out: DeletionBlock[] = [];
  try {
    const raw = typeof error.details === "string" ? error.details.slice(0, DETAIL_MAX) : "";
    const parsed = raw ? (JSON.parse(raw) as { blocks?: unknown }) : {};
    if (Array.isArray(parsed.blocks)) {
      for (const b of parsed.blocks) {
        const hint = (b as DeletionBlock)?.hint;
        if (typeof hint !== "string" || !HINT_KEYS[hint]) continue;
        const n = Number((b as DeletionBlock)?.count);
        out.push({ hint, count: Number.isFinite(n) ? n : undefined });
      }
    }
  } catch {
    // Malformed DETAIL — fall through to the HINT below.
  }
  if (out.length === 0 && error.hint && HINT_KEYS[error.hint]) {
    out.push({ hint: error.hint });
  }
  return out;
}
