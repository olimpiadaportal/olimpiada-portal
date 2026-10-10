// A child's plan status as the PARENT sees it (2026-10-10): one of
// Subscription Active / Trial Active / Trial Expired, or the plain access word
// when none of those applies. Shared by the dashboard card and the child's
// edit page so the two can never disagree about the same child.
//
// The label itself is decided by lib/accessPill (pure, tested); this module
// only gathers the inputs from every rail that can grant access.
import "server-only";
import { isChildFreeAccessActive } from "@/lib/freeAccess";
import { getChildFreeTrial } from "@/lib/freeTrial";
import { isChildEntitled } from "@/lib/childEntitlement";
import { accessPillKey } from "@/lib/accessPill";
import { NO_TRIAL, type FreeTrialState } from "@/lib/freeTrialShared";

export type ChildPlanStatus = {
  /** i18n key for the status pill. */
  pillKey: string;
  /** A giveaway or a free-access window covers this child: nothing to sell. */
  free: boolean;
  /** The one-time trial (and any extension), as the database reports it. */
  trial: FreeTrialState;
  /**
   * The trial is over and nothing else gives access — the state the
   * dashboard's "your child's trial has expired" banner exists for.
   */
  trialExpiredNoAccess: boolean;
};

export async function getChildPlanStatus(
  studentId: string,
  accessStatus: string | null | undefined,
  giveawayActive: boolean,
): Promise<ChildPlanStatus> {
  // A campaign replaces the pill with its own word, and there is nothing to
  // subscribe to while it runs — no trial reads needed.
  if (giveawayActive) {
    return { pillKey: "access.giveaway", free: true, trial: NO_TRIAL, trialExpiredNoAccess: false };
  }
  if (await isChildFreeAccessActive(studentId)) {
    return { pillKey: "access.freeAccess", free: true, trial: NO_TRIAL, trialExpiredNoAccess: false };
  }
  const [entitled, trial] = await Promise.all([
    isChildEntitled(studentId),
    getChildFreeTrial(studentId),
  ]);
  const trialEnded = trial.used && !trial.active;
  const pillKey = accessPillKey(accessStatus, entitled, trial.active, trialEnded);
  return {
    pillKey,
    free: false,
    trial,
    trialExpiredNoAccess: pillKey === "access.trialExpired",
  };
}
