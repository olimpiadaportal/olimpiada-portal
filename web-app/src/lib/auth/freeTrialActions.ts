"use server";
// The Free Trial activation server action.
//
// This wrapper TRANSLATES. `state.error` is printed raw into the form's error
// paragraph, so returning a bare key would render the literal string
// `trial.err.alreadyUsed` on a parent's screen -- the same reason
// subscriptionService.ts translates at this layer rather than in the core.
import { revalidatePath } from "next/cache";
import { requireParent } from "@/lib/auth/session";
import { getT, getLocale } from "@/i18n/server";
import { rateLimitAllow } from "@/lib/rateLimit";
import { activateFreeTrialCore } from "@/lib/auth/freeTrialCore";
import { TRIAL_MAX_SUBJECTS } from "@/lib/freeTrial";
import { isUuid } from "@/lib/uuid";

export type ActivateTrialState =
  | { ok: true; endsAt: string }
  | { ok?: false; error?: string };

export async function activateFreeTrialAction(
  _prev: ActivateTrialState,
  formData: FormData,
): Promise<ActivateTrialState> {
  // Authorize FIRST -- before reading a single FormData field.
  const parent = await requireParent();
  const t = await getT();

  // A one-shot lifetime grant is worth rate limiting even though the database
  // refuses a second one: without this, a script can hammer the RPC discovering
  // which children exist by the shape of the refusal.
  if (!rateLimitAllow("trialactivate", parent.profileId, 10, 10 * 60_000)) {
    return { error: t("trial.err.tooMany") };
  }

  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(studentId)) return { error: t("sub.err.notYourChild") };

  // The picker posts one `subject_id` entry per selected card.
  const subjectIds = formData
    .getAll("subject_id")
    .map((v) => String(v))
    .filter((v) => v !== "");

  if (subjectIds.length === 0) return { error: t("trial.err.noSubjects") };
  if (subjectIds.length > TRIAL_MAX_SUBJECTS) return { error: t("trial.err.tooMany") };

  const locale = await getLocale();
  const res = await activateFreeTrialCore({
    parentProfileId: parent.profileId,
    studentId,
    subjectIds,
    locale,
  });

  if (!res.ok) return { error: t(res.errorKey) };

  // The child's access changed, so every surface that reads it must re-render.
  revalidatePath(`/children/${studentId}/subscribe`);
  revalidatePath("/dashboard");
  return { ok: true, endsAt: res.endsAt };
}
