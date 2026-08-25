// The one-time 1-day pre-purchase FREE TRIAL (migrations 139-141) — SERVER reads.
//
// A parent picks up to TWO subjects for one child and gets 24 hours of access
// with no card and no charge. Reads go through SECURITY DEFINER RPCs scoped to
// the caller's own identity, exactly as freeAccess.ts does, so a parent can only
// ever see their OWN child's trial.
//
// EXPIRY IS DERIVED, NEVER STORED CLIENT-SIDE. `endsAt` is the single source of
// truth and comes from the server on every render; the countdown component
// re-derives the remainder from it. Nothing is written to localStorage, so a new
// session on a different device shows the same figure.
//
// The pure pieces (the cap, the h/m/s split, the parser) live in
// `freeTrialShared.ts` because the picker and the countdown are CLIENT
// components and cannot import a `server-only` module. They are re-exported
// here so server callers still have one import site.
//
// DISTINCT from the giveaway (a computed platform-wide window owning no rows)
// and from admin free-access intervals (per-parent/per-child, all-or-nothing).
// The trial is the only one of the three that is SUBJECT-SCOPED.
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { NO_TRIAL, parseFreeTrial, type FreeTrialState } from "@/lib/freeTrialShared";

export {
  TRIAL_MAX_SUBJECTS,
  splitRemaining,
  type FreeTrialState,
  type TrialSubject,
} from "@/lib/freeTrialShared";

/**
 * A SPECIFIC child's trial, scoped server-side to the caller's own child.
 * Drives the parent countdown and the dashboard pill. Safe fallback = inactive,
 * so a hiccup never opens access by accident. Not request-cached (the arg varies).
 */
export async function getChildFreeTrial(studentId: string): Promise<FreeTrialState> {
  if (!studentId) return NO_TRIAL;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("child_free_trial", { p_student: studentId });
    if (error) return NO_TRIAL;
    return parseFreeTrial(data);
  } catch {
    return NO_TRIAL;
  }
}

/** The signed-in CHILD's own trial (child dashboard). Cached per request. */
export const getMyFreeTrial = cache(async (): Promise<FreeTrialState> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_free_trial");
    if (error) return NO_TRIAL;
    return parseFreeTrial(data);
  } catch {
    return NO_TRIAL;
  }
});
