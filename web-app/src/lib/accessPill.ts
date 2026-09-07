// Which label a child's ACCESS PILL shows on the parent dashboard, decided from
// every rail that can grant access. The web twin of mobile-app's
// `features/parent/commerce.ts → accessPill`; the two must keep agreeing,
// because they answer the same question about the same child and a parent uses
// both. Pure and free of `server-only` so a client surface can share it later.
//
// WHY A SECOND SOURCE. `students.access_status` is written by the SUBSCRIPTION
// rail alone — the subscription writers and the hourly reconciliation job, all
// of which read `child_subscriptions`. An entitlement-only grant writes exactly
// one row, into `public.entitlements`, and touches nothing else: an Apple
// purchase made in the mobile app, an admin comp (admin_grant_entitlement), a
// school licence. So a child whose family holds one reads `inactive` here, and
// the first screen their parent lands on labels them "Giriş yoxdur".
//
// THE THIRD GRANT IS THE FREE TRIAL, and it is invisible to BOTH of the above.
// activate_free_trial (migration 140) writes no `access_status` and no
// `child_subscriptions` row, and the entitlement rows it DOES write are
// deliberately excluded from child_entitled_subjects — that exclusion is what
// stops a 24-hour trial suppressing the purchase offer the trial exists to
// convert, so it stays. What was left is worst on the WEB specifically: the web
// is where the trial is ACTIVATED, so the parent most likely to be told "No
// access" was the one who had just started one, seconds earlier, on this very
// site. `onTrial` therefore arrives from its own read — child_free_trial(uuid),
// whose `active` is DERIVED from ends_at inside the database, so no job has to
// run for the pill and the child's arena to agree.
//
// The trial reuses `access.trialing`, the word the subscription rail already
// uses for exactly this state. Deliberately NOT `access.freeTrial`, whose az/ru
// wording is identical to `access.freeAccess` — a trial and an admin
// free-access window would then read the same on the same dashboard.
//
// FAIL OPEN. `entitled === false` and `onTrial === false` are the two readers'
// own safe fallbacks, and they reproduce the previous behaviour EXACTLY: a
// failed read falls back to today's label and can only cost the nicer of two
// words. Neither can invent access, and neither blanks the pill.
//
// A status that ALREADY reads as access keeps its own wording: a family with a
// live subscription is not relabelled merely because the entitlement mirror
// knows about them too. An entitlement outranks a trial for the same reason —
// a family holding both bought something, and that is the truer thing to say.

const ACCESS_STATUSES = ["inactive", "trialing", "active", "locked", "expired"] as const;

/** i18n key for a raw `students.access_status` (unknown values degrade to
 *  inactive, rather than rendering a raw `access.<whatever>` key at a parent). */
export function accessStatusKey(status: string | null | undefined): string {
  const s = ACCESS_STATUSES.find((x) => x === status) ?? "inactive";
  return `access.${s}`;
}

/** Does the subscription column alone already say this child has access? */
function statusGrantsAccess(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/**
 * The pill's i18n key. `entitled` = at least one LIVE subject entitlement
 * (child_entitled_subjects, migration 168); `onTrial` = inside the one-time
 * free trial (child_free_trial, migration 140).
 *
 * The mobile twin answers "access is active" here with its own `mob.sub.*`
 * string; the web says it with `access.active`, the word already on this
 * dashboard. Same state, each platform's existing vocabulary.
 */
export function accessPillKey(
  status: string | null | undefined,
  entitled: boolean,
  onTrial = false,
): string {
  if (!statusGrantsAccess(status)) {
    if (entitled) return "access.active";
    if (onTrial) return "access.trialing";
  }
  return accessStatusKey(status);
}
