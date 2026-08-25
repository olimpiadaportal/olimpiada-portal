// Activating the one-time 1-day Free Trial (migrations 139-141).
//
// SERVER-ONLY. Returns an i18n KEY, never Postgres text: the RPC's messages name
// tables and constraints, and a raw `error.message` on screen is both a leak and
// untranslatable.
//
// Every rule this file appears to enforce is ALSO enforced in the database --
// the 2-subject cap by `ck_free_trial_subjects`, the once-only rule by
// `uq_free_trials_student`, ownership by a check inside `activate_free_trial`
// itself. What happens here is mapping, not gating: a hand-crafted POST that
// skips this file still cannot produce a third subject or a second trial.
import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";
import { TRIAL_MAX_SUBJECTS } from "@/lib/freeTrial";

export type ActivateTrialResult =
  | { ok: true; endsAt: string }
  | { ok: false; errorKey: string };

/**
 * The RPC raises with a HINT so the caller can translate without parsing prose.
 * Anything unrecognised becomes the generic key -- a new database hint must
 * never surface as raw SQL text on a parent's screen.
 */
function keyForHint(hint: string | null | undefined, message: string): string {
  const h = (hint ?? "").trim();
  if (h === "trial_already_used") return "trial.err.alreadyUsed";
  if (h === "too_many_subjects") return "trial.err.tooMany";
  if (h === "bad_subject") return "trial.err.badSubject";
  if (h === "already_free") return "trial.err.alreadyFree";
  if (h === "already_covered") return "trial.err.alreadyCovered";
  if (h === "not_your_child") return "sub.err.notYourChild";
  // The once-only constraint can also surface as a bare unique violation if the
  // insert races ahead of the hint being attached.
  if (/already used/i.test(message) || /uq_free_trials_student/i.test(message)) {
    return "trial.err.alreadyUsed";
  }
  return "trial.err.generic";
}

export async function activateFreeTrialCore(params: {
  parentProfileId: string;
  studentId: string;
  subjectIds: string[];
  locale: string;
}): Promise<ActivateTrialResult> {
  const { parentProfileId, studentId, subjectIds, locale } = params;

  if (!isUuid(parentProfileId) || !isUuid(studentId)) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  // Shape checks before the round trip. These mirror the DB rules rather than
  // replacing them, and exist so the common mistakes produce a translated
  // message instead of a generic failure.
  const ids = Array.from(new Set(subjectIds.filter((s) => isUuid(s))));
  if (ids.length !== subjectIds.length) return { ok: false, errorKey: "trial.err.badSubject" };
  if (ids.length < 1) return { ok: false, errorKey: "trial.err.noSubjects" };
  if (ids.length > TRIAL_MAX_SUBJECTS) return { ok: false, errorKey: "trial.err.tooMany" };

  try {
    const admin = getAdminClient();
    const { data, error } = await admin.rpc("activate_free_trial", {
      p_parent: parentProfileId,
      p_student: studentId,
      p_subject_ids: ids,
      p_locale: locale === "en" || locale === "ru" ? locale : "az",
    });

    if (error) {
      // Logged server-side with detail; the caller gets a key.
      console.error("[trial] activate failed");
      return { ok: false, errorKey: keyForHint(error.hint, error.message ?? "") };
    }

    const endsAt =
      data && typeof data === "object" && typeof (data as { ends_at?: unknown }).ends_at === "string"
        ? (data as { ends_at: string }).ends_at
        : null;
    if (!endsAt) return { ok: false, errorKey: "trial.err.generic" };
    return { ok: true, endsAt };
  } catch {
    console.error("[trial] activate threw");
    return { ok: false, errorKey: "trial.err.generic" };
  }
}
