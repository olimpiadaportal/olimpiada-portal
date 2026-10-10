// DOES THIS CHILD ALREADY HOLD LIVE ACCESS? — the double-billing probe both
// store rails ask before they open a purchase intent. SERVER ONLY.
//
// Moved here from lib/payments/apple/grantEntitlement.ts on 2026-10-10, when
// Android started selling through Google Play. The rule is not Apple-specific
// and must not exist twice: the iOS and Android intent routes must refuse the
// SAME second charge. apple/grantEntitlement.ts re-exports it unchanged.
import "server-only";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

/** What a store product sells. Mirrors public.entitlement_scope. */
export type IapScope = "subject" | "olympiad_package";

/**
 * DOES THIS CHILD ALREADY HOLD LIVE ACCESS TO THIS TARGET, FROM ANY SOURCE?
 *
 * This is the ONLY place double-billing can be pre-empted. A parent who already
 * paid on the web must not be charged again by Apple for the same subject, and
 * once StoreKit has taken the money there is nothing this server can do about
 * it — Apple's refund flow belongs to Apple. So the question is asked BEFORE the
 * intent row exists, and a `true` answer stops the sale.
 *
 * DELIBERATELY NOT CONSULTED: the giveaway window and per-child admin free
 * access. Neither is OWNERSHIP — both are temporary comps with an end date, and
 * a parent buying a year of maths during a fourteen-day giveaway is making a
 * perfectly rational purchase. Refusing that would be the platform deciding it
 * knows better. A LIVE ENTITLEMENT is different: it is a thing the family
 * already has.
 *
 * AND NEITHER IS A TRIAL, which is why `source = 'trial'` is excluded here. It
 * is the SAME exclusion `child_entitled_subjects` makes (migration 168) and the
 * two must stay byte-for-byte the same rule: that function decides what the
 * parent panel OFFERS, this one decides what the server will SELL. When they
 * disagree the failure is not a hidden button but a red one — the panel offers
 * the trial-covered subject, the parent taps Buy, and this probe refuses with
 * `iap.err.alreadyActive` before the store sheet ever opens. A trial writes
 * REAL entitlement rows (activate_free_trial → entitlement_grant(…,'trial',…)),
 * so without this filter it arrives through this very query and suppresses the
 * sale of exactly the one or two subjects the trial exists to convert, for the
 * whole 24 hours it runs.
 *
 * WHAT BECOMES OF THE TRIAL ROW WHEN THE PAID GRANT LANDS: nothing, and nothing
 * needs to. Both rows are live at once, and that is safe in three independent
 * ways —
 *   * THEY CANNOT COLLIDE. `uq_entitlements_source_ref` is unique on
 *     (source, external_ref); the trial's ref is `trial:<student>:<subject>`
 *     and Apple's is the originalTransactionId, so `entitlement_grant`'s
 *     `on conflict (source, external_ref) do update` inserts a SECOND row
 *     rather than overwriting the trial. There is no unique index on
 *     (student, subject), on purpose.
 *   * PLAY NEVER BLINKS. `has_subject_access()` reads neither the source nor
 *     the row count — one live row of any source is access — so the child keeps
 *     playing across the purchase and after the trial's own ends_at passes.
 *   * THE PURCHASE UPGRADES THE DAY. `subject_access_is_trial_only()` already
 *     names this case ("PAID ALWAYS WINS … which happens naturally when a
 *     parent buys during the trial day") and answers false the moment a
 *     non-trial row is live, so today's rounds become RATED instead of staying
 *     practice.
 * The expired trial row then simply stops matching every predicate that reads
 * it. It is history, not state.
 *
 * Liveness is COMPUTED the way `has_subject_access` computes it — there is no
 * status column to read, on purpose (entitlements' own table comment says why)
 * — with the one deliberate difference above: that function answers "may this
 * child PLAY", where a trial counts, and this one answers "has this been
 * BOUGHT", where it does not. The end-date arms differ by scope because the
 * schema forces them to:
 * `ck_entitlement_bounded` makes a subject grant's `ends_at` NOT NULL, and
 * `ck_entitlement_lifetime` makes a package grant's `ends_at` ALWAYS NULL.
 *
 * Returns null when the question could not be answered. The caller must treat
 * that as a refusal: a failed sale is recoverable, a double charge is not.
 */
export async function hasLiveEntitlement(params: {
  readonly studentProfileId: string;
  readonly scope: IapScope;
  readonly subjectId: string | null;
  readonly packageId: string | null;
}): Promise<boolean | null> {
  if (!isServiceRoleConfigured) return null;
  const target = params.scope === "subject" ? params.subjectId : params.packageId;
  if (!target) return null;

  const admin = getAdminClient();
  const now = new Date().toISOString();
  let query = admin
    .from("entitlements")
    .select("id")
    .eq("student_profile_id", params.studentProfileId)
    .eq("scope", params.scope)
    // Borrowed access is not ownership — see the header. Unconditional rather
    // than scope-branched: only subjects are ever granted as a trial today, and
    // if a trial-sourced package row ever existed, letting it be bought is the
    // side to fail on.
    .neq("source", "trial")
    .is("revoked_at", null)
    .lte("starts_at", now)
    .limit(1);
  query =
    params.scope === "subject"
      ? query.eq("subject_id", target).gt("ends_at", now)
      : query.eq("package_id", target).is("ends_at", null);

  const { data, error } = await query;
  if (error) {
    console.error("[iap] access lookup failed:", error.code ?? "unknown");
    return null;
  }
  return Array.isArray(data) && data.length > 0;
}
