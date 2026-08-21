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

/**
 * One machine-readable reason, as the SQL reports it.
 *
 * `count` is the number every hint carries. The three optional fields belong to
 * `grade_purchased_pool_below_attempt` (migration 112), whose sentence is
 * useless without them: "this grade is purchased" does not tell the admin WHICH
 * grade, how many questions the pool would be left with, or how many it has to
 * serve — and those three numbers are the whole difference between a refusal
 * the admin can act on and one they can only be annoyed by.
 */
export type DeletionBlock = {
  hint: string;
  count?: number;
  /** The grade's name, exactly as the panel shows it everywhere else. */
  grade?: string;
  /** Published questions the grade's pool would be left with. */
  remaining?: number;
  /** …and the number one attempt needs (migration 106's per-grade value). */
  required?: number;
};

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
  // Migration 124 — an ENTITLEMENT on the package is not a purchase row: an
  // apple_iap / google_play grant, a school licence or a manual comp lands here
  // too, and the guarded-deletion helper reports it under its own hint. Without
  // this line the panel drops the reason silently and shows the generic server
  // error instead of the one sentence that says what to do.
  package_has_entitlements: "del.hint.packageHasEntitlements",
  package_is_active: "del.hint.packageIsActive",
  package_not_deletable: "del.hint.packageNotDeletable",
  not_archived: "del.hint.notArchived",
  // Olympiad pool — delete of a SELECTION, and of one row (migration 112).
  // empty_selection / too_many_questions are also refused in the server action
  // before the RPC, so the sentence is identical whichever layer catches it.
  question_not_in_package: "del.hint.questionNotInPackage",
  // A stale id is NOT a foreign id: the row simply went away between the dialog
  // opening and the click, usually because a second admin got there first.
  question_gone: "del.hint.questionGone",
  too_many_questions: "del.hint.tooManySelected",
  empty_selection: "del.hint.emptySelection",
  // The purchased-pool rule: emptying a paid grade's pool below one attempt
  // silently revokes a lifetime entitlement (CLAUDE.md).
  grade_purchased_pool_below_attempt: "del.hint.gradePurchasedPool",
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
  // Migration 124 — same story on the subject side (see above).
  subject_has_entitlements: "del.hint.subjectHasEntitlements",
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
  return fillTemplate(lt(key), {
    n: block.count ?? 0,
    grade: block.grade ?? "",
    remaining: block.remaining ?? 0,
    required: block.required ?? 0,
  });
}

/** A finite number from the DETAIL payload, or nothing at all. */
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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
        const raw = b as DeletionBlock;
        const hint = raw?.hint;
        if (typeof hint !== "string" || !HINT_KEYS[hint]) continue;
        out.push({
          hint,
          count: num(raw?.count),
          // The grade NAME comes out of the database and lands in the DOM.
          // React escapes it, but it is still capped: nothing this payload
          // carries needs more than a label's worth of characters.
          grade: typeof raw?.grade === "string" ? raw.grade.slice(0, 80) : undefined,
          remaining: num(raw?.remaining),
          required: num(raw?.required),
        });
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
