"use server";

// Stage 11 — child subscription server actions (web surface). Since Stage M2
// these are thin, behavior-identical wrappers: each action authorizes the
// parent via the COOKIE session (requireParent, exactly as before), reads its
// FormData, then delegates to the shared cookie-free CORE in
// lib/auth/subscriptionCore (one source of truth with the mobile BFF) and
// localizes the returned error KEY with getT. Validation order, ownership
// checks, payment-mode gates, RPCs, notifications and revalidation all live in
// the core, unchanged from the historical actions. PRICE, sibling discount and
// trial are computed server-side by the RPCs (the client never sets amounts).
import { requireParent } from "@/lib/auth/session";
import {
  activateChildGiveawayCore,
  cancelChildSubscriptionCore,
  quoteSubscriptionCore,
  subscribeChildCore,
  updateSubscriptionSubjectsCore,
} from "@/lib/auth/subscriptionCore";
import { getT } from "@/i18n/server";
import { isChildFreeAccessActive } from "@/lib/freeAccess";

export type SubscribeState =
  | {
      ok: boolean;
      result?: {
        base: number;
        discount_percent: number;
        discount: number;
        total: number;
        trial_days: number;
        currency: string;
        // Batch H: the 8-digit login ID is allocated on subscribe — reveal it here.
        childUniqueId?: string | null;
      };
      error?: string;
    }
  | null;

export async function subscribeChild(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  const interval = String(formData.get("interval") ?? "");
  const subjectIds = formData.getAll("subject").map(String);

  const res = await subscribeChildCore({
    parentProfileId: parent.profileId,
    studentId,
    interval,
    subjectIds,
    // Web free-access probe: caller-scoped RPC via the cookie client.
    isFreeAccessActive: isChildFreeAccessActive,
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  return { ok: true, result: res.result };
}

// ---- Batch H: live, server-side price preview (sibling discount included) -----
// The SubscribeForm calls this when subjects/interval change so the displayed
// total reflects the AUTHORITATIVE sibling-discount computation (never hardcoded).
export type QuoteResult =
  | {
      ok: true;
      base: number;
      discount_percent: number;
      discount: number;
      total: number;
      trial_days: number;
      currency: string;
    }
  | { ok: false; error?: string };

export async function quoteSubscription(args: {
  studentId: string;
  interval: string;
  subjectIds: string[];
}): Promise<QuoteResult> {
  const t = await getT();
  const res = await quoteSubscriptionCore({
    // Historical order preserved: the parent is resolved (and a missing session
    // redirects) only at the ownership check, AFTER input validation.
    resolveParentProfileId: async () => (await requireParent()).profileId,
    studentId: args.studentId,
    interval: args.interval,
    subjectIds: args.subjectIds,
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  const { ok: _ok, ...quote } = res;
  return { ok: true, ...quote };
}

// ---- W2: cancel a child's current subscription (parent-initiated) -------------
// Access is KEPT until the current period end (see subscriptionCore for the
// full contract). RLS does not grant parents UPDATE on child_subscriptions, so
// the core uses the service-role admin client AFTER verifying ownership.
export type CancelSubscriptionState = { ok?: boolean; error?: string } | null;

export async function cancelChildSubscription(
  _prev: CancelSubscriptionState,
  formData: FormData,
): Promise<CancelSubscriptionState> {
  // M7: authorize FIRST — before touching FormData.
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  const subscriptionId = String(formData.get("subscription_id") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 60);

  const res = await cancelChildSubscriptionCore({
    parentProfileId: parent.profileId,
    studentId,
    subscriptionId,
    reason,
  });
  if (!res.ok) return { error: t(res.errorKey) };
  return { ok: true };
}

// ---- Round 11 (item 1): batch subject update from the checkbox editor ---------
// The Manage-Subjects UI posts the DESIRED full subject set (checkboxes); the
// core computes the diff and applies it through the existing re-pricing RPCs.
export type SubjectsUpdateState =
  | { ok: true; added: number; removed: number }
  | { ok: false; error: string }
  | null;

export async function updateSubscriptionSubjectsAction(
  _prev: SubjectsUpdateState,
  formData: FormData,
): Promise<SubjectsUpdateState> {
  // M7: authorize FIRST — before touching FormData; the billing gate runs only
  // after ownership is proven (it still receives this child's id).
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  const subjectIds = formData.getAll("subject").map(String);

  const res = await updateSubscriptionSubjectsCore({
    parentProfileId: parent.profileId,
    studentId,
    subjectIds,
    isFreeAccessActive: isChildFreeAccessActive,
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  return res;
}

// ---- Round 11 (item 6): add-child during an active GIVEAWAY window ------------
// The wizard skips plan selection + payment entirely: the child gets their
// 8-digit login ID immediately (activate_child_login_id — NO subscription row)
// and platform access comes from the server-side giveaway override. When the
// window ends the override stops applying and normal payment rules resume on
// their own — nothing to unwind. H8: an ACTIVE per-child FREE-ACCESS interval
// qualifies the same way (same override model), so a new child added during a
// free window isn't dead-ended without a login ID.
export type GiveawayActivateState =
  | { ok: true; childUniqueId: string | null }
  | { ok: false; error: string }
  | null;

export async function activateChildGiveaway(
  _prev: GiveawayActivateState,
  formData: FormData,
): Promise<GiveawayActivateState> {
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");

  const res = await activateChildGiveawayCore({
    parentProfileId: parent.profileId,
    studentId,
    isFreeAccessActive: isChildFreeAccessActive,
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  return res;
}
