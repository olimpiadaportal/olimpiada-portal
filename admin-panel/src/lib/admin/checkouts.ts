"use server";

// Admin CHECKOUT REVIEW — Administrator-only (Content Managers must never reach
// payment modules).
//
// WHY THIS EXISTS. `checkout_sessions.redemption_status = 'needs_review'` is the
// database's way of saying "we are holding a family's money and have not
// delivered on it". Until migration 127 it reached exactly one place: 013 check
// 118 — a validation file somebody runs when they ALREADY suspect something. A
// state that only becomes visible to a person who went looking for it is not an
// alarm, and money is not a thing to be quiet about.
//
// So there are now two ways it reaches a human, and this file is one of them.
// The other is `checkout_alert_admins`, which files a PRIORITY 1 notification
// the moment a redemption is recorded — priority 1 because `create_notification`
// deliberately refuses to let a recipient silence that level. This page is where
// they land afterwards.
//
// TWO KINDS OF ROW LIVE HERE, and the difference is the whole reason the list
// shows the status beside the note:
//
//   * `needs_review`  — money taken, nothing delivered. Someone owes this family
//     either the thing they paid for or their money back.
//   * `applied` WITH A NOTE — the plan or package WAS delivered and a follow-up
//     failed (the Auth-admin call that activates a child's login), or the
//     payment was later REVERSED at the gateway. A different problem needing a
//     different answer, which is why it does not share the word.
//
// READS ONLY, plus ONE WRITE: recording what an operator did. That write goes
// through `admin_resolve_checkout_review`, which re-validates the Administrator
// role itself and writes its own audit row — so this file must not duplicate
// that audit write (same posture as subscriptions.ts / pricing.ts).
//
// IT NEVER GRANTS ANYTHING. There is no "deliver it anyway" button and there
// must not be: delivering is `checkout_redeem_plan`'s job, behind a verified
// payment, and a button here that reached past it would be the exact defect
// migrations 125–127 exist to close.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { getLocale, getT } from "@/i18n/server";
import { localStrings } from "@/app/(protected)/subscriptions/labels";

/**
 * How many rows one page shows. Deliberately small — this list should be short.
 * NOT exported: a "use server" module may only export async functions, and this
 * constant has no caller outside this file.
 */
const CHECKOUT_REVIEW_PAGE_SIZE = 50;

/** The prefix an operator's resolution carries; 013 checks 118 and 123 key on it. */
const RESOLVED_PREFIX = "resolved:";

const ORDER_RE = /^\d{6,32}$/;

export type CheckoutReviewRow = {
  order: string;
  /** 'needs_review' = money held, nothing delivered. 'applied' = delivered, follow-up failed. */
  status: string;
  /** The machine reason, e.g. expired | grade_changed | apply_failed:23514 | reversed:… */
  note: string | null;
  /** 'plan_start' | 'plan_change' | 'olympiad'. */
  intentKind: string | null;
  amount: number | null;
  currency: string;
  createdAt: string | null;
  decidedAt: string | null;
  /** The child, when the row still has one (the FK NULLs it on deletion). */
  childName: string | null;
  parentEmail: string | null;
  /** True once an operator has written what they did. */
  resolved: boolean;
  /**
   * The money went back to the family.
   *
   * Derived from the PAYMENT row, never from the note. A gateway reversal on a
   * session that was decided but delivered nothing (redeemed with
   * `needs_review`) marks the payment refunded and — until round 8 — wrote
   * nothing at all onto the session, because `checkout_revoke_reversed` only
   * had arms for "never redeemed" and "applied". This queue therefore went on
   * telling an operator "we are holding this family's money and have not
   * delivered" about money that had already been returned, and the obvious
   * response to that sentence — grant the access by hand — gives the package
   * away for free.
   *
   * Reading the payment rather than the note also repairs every historical row
   * without a migration: `payments.status = 'refunded'` has been written
   * unconditionally, before the branch, since the reversal path existed.
   */
  refunded: boolean;
};

export type CheckoutReviewList = {
  rows: CheckoutReviewRow[];
  /** Rows still waiting on a person — the number the alarm is about. */
  open: number;
  loadError: boolean;
};

/**
 * Every decided redemption that needs — or needed — a person, newest first.
 *
 * Resolved rows are INCLUDED rather than hidden. An operator who has just
 * written "refunded, family contacted" should be able to see that it landed,
 * and a list that empties itself the moment you act on it gives no way to check
 * your own work. They sort below the open ones and are visibly marked.
 */
export async function listCheckoutReviews(): Promise<CheckoutReviewList> {
  await requireAdmin(); // authorize FIRST
  if (!hasServiceRole()) return { rows: [], open: 0, loadError: true };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("checkout_sessions")
    .select(
      "provider_session_id, redemption_status, redemption_note, intent_kind, amount, currency, created_at, redeemed_at, student_profile_id, owner_parent_profile_id",
    )
    .not("intent_kind", "is", null)
    .not("redeemed_at", "is", null)
    // The two shapes of "a person is needed", exactly as 013 check 118 defines
    // them. `applied` rows with no note are the ordinary happy path and must not
    // appear here.
    .or("redemption_status.eq.needs_review,redemption_note.not.is.null")
    .order("redeemed_at", { ascending: false })
    .limit(CHECKOUT_REVIEW_PAGE_SIZE);

  if (error) {
    console.error("[admin] checkout review list failed", error.code ?? "unknown");
    return { rows: [], open: 0, loadError: true };
  }

  const raw = (data ?? []) as Record<string, unknown>[];
  const childIds = raw
    .map((r) => r.student_profile_id)
    .filter((v): v is string => typeof v === "string");
  const parentIds = raw
    .map((r) => r.owner_parent_profile_id)
    .filter((v): v is string => typeof v === "string");
  const orders = raw
    .map((r) => r.provider_session_id)
    .filter((v): v is string => typeof v === "string");

  const [children, parents, paid] = await Promise.all([
    childIds.length
      ? admin
          .from("students")
          .select("profile_id, first_name, last_name")
          .in("profile_id", childIds)
      : Promise.resolve({ data: [] as unknown[] }),
    parentIds.length
      ? admin.from("profiles").select("id, email").in("id", parentIds)
      : Promise.resolve({ data: [] as unknown[] }),
    // The money half of each row. READ-ONLY, service-role, and the ONLY source
    // for "did the family get their money back" — see the `refunded` field.
    orders.length
      ? admin
          .from("payments")
          .select("provider_ref, status")
          .eq("provider", "azericard")
          .in("provider_ref", orders)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const childName = new Map<string, string>();
  for (const c of (children.data ?? []) as Record<string, unknown>[]) {
    const name = [c.first_name, c.last_name]
      .filter((p) => typeof p === "string" && p !== "")
      .join(" ");
    childName.set(String(c.profile_id), name || "—");
  }
  const parentEmail = new Map<string, string>();
  for (const p of (parents.data ?? []) as Record<string, unknown>[]) {
    if (typeof p.email === "string") parentEmail.set(String(p.id), p.email);
  }
  const refundedOrders = new Set<string>();
  for (const p of (paid.data ?? []) as Record<string, unknown>[]) {
    if (p.status === "refunded" && typeof p.provider_ref === "string") {
      refundedOrders.add(p.provider_ref);
    }
  }

  const rows: CheckoutReviewRow[] = raw.map((r) => {
    const note = typeof r.redemption_note === "string" ? r.redemption_note : null;
    const order = String(r.provider_session_id ?? "");
    return {
      order,
      refunded: refundedOrders.has(order),
      status: String(r.redemption_status ?? ""),
      note,
      intentKind: typeof r.intent_kind === "string" ? r.intent_kind : null,
      amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
      currency: String(r.currency ?? "AZN"),
      createdAt: typeof r.created_at === "string" ? r.created_at : null,
      decidedAt: typeof r.redeemed_at === "string" ? r.redeemed_at : null,
      childName:
        typeof r.student_profile_id === "string"
          ? childName.get(r.student_profile_id) ?? null
          : null,
      parentEmail:
        typeof r.owner_parent_profile_id === "string"
          ? parentEmail.get(r.owner_parent_profile_id) ?? null
          : null,
      resolved: (note ?? "").startsWith(RESOLVED_PREFIX),
    };
  });

  // Open first, then by decision time. A settled row is history; an open one is
  // a family waiting.
  rows.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "");
  });

  return { rows, open: rows.filter((r) => !r.resolved).length, loadError: false };
}

export type ResolveCheckoutState = { ok?: boolean; error?: string } | null;

/**
 * Record what an operator DID about one of these.
 *
 * The write is `admin_resolve_checkout_review`: it appends `resolved:<sentence>`
 * to the note, writes an audit row, and deliberately LEAVES THE STATUS ALONE.
 * The status says what happened to the money at redemption time; overwriting it
 * with `applied` would be a lie about a case that was refunded rather than
 * delivered, and there is no third enum value that means "a person settled it".
 *
 * Request-scoped (anon-key + cookies) client — EXECUTE is granted to
 * `authenticated` and the RPC's own `is_admin()` guard gates it, the same
 * posture as manageSubscription / saveSubjectPrice.
 */
export async function resolveCheckoutReview(
  _prev: ResolveCheckoutState,
  formData: FormData,
): Promise<ResolveCheckoutState> {
  await requireAdmin(); // authorize FIRST — before reading FormData
  const t = await getT();
  const lt = localStrings(await getLocale());

  const order = String(formData.get("order") ?? "").trim();
  const resolution = String(formData.get("resolution") ?? "").trim().slice(0, 180);
  if (!ORDER_RE.test(order)) return { error: t("err.server") };
  if (resolution === "") return { error: lt("ckrev.err.needResolution") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_checkout_review", {
    p_order: order,
    p_resolution: resolution,
  });
  if (error) {
    console.error("[admin] checkout resolution failed", error.code ?? "unknown");
    const hint = (error as { hint?: string }).hint;
    if (hint === "resolution_required") return { error: lt("ckrev.err.needResolution") };
    if (hint === "not_found") return { error: lt("ckrev.err.notFound") };
    return { error: t("err.server") };
  }

  revalidatePath("/subscriptions/checkouts");
  return { ok: true };
}
