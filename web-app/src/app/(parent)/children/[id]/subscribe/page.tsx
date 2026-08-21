import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { isChildFreeAccessActive } from "@/lib/freeAccess";
import { SubscribeForm } from "@/components/SubscribeForm";
import { ManageSubjects, type CoveredSubject } from "@/components/ManageSubjects";
import { FreeActivation } from "@/components/FreeActivation";
import { findOutstandingPlanCheckout } from "@/lib/payments/checkoutCore";

const KEYS = [
  "sub.interval", "sub.subjects", "sub.subtotal", "sub.siblingNote",
  "sub.submit", "sub.submitting", "sub.done", "sub.base", "sub.discount",
  "sub.total", "sub.trial", "sub.days", "sub.totalNow", "sub.previewHint",
  "sub.calculating", "sub.noSibling", "sub.noSubjectsAvailable",
  // Migration 127 — the sibling discount is NAMED where the parent chooses:
  // which child earned it, what it saves, and — when none applies yet — that
  // a second child is cheaper. A silent smaller number is not a discount a
  // parent can see.
  "sub.discount.rank2", "sub.discount.rank3", "sub.discount.saved",
  "sub.discount.hint",
  // Migration 127 — the web free branch reaches the free-only RPC now, so a
  // change that turns out to be priced is refused rather than applied.
  "sub.err.priceMoved",
  "sub.err.invalid", "sub.err.noSubjects", "sub.err.notYourChild",
  "parent.child.idLabel", "parent.child.idNote",
  "pricing.weekly", "pricing.monthly", "pricing.yearly", "parent.dash.title",
  // Manage-subjects (existing subscription) keys:
  "subjedit.title", "subjedit.minOne",
  // Round 11 — checkbox editor + the plan-change confirmation sheet:
  "pricing.perSubjectNote", "subjedit.activeChip", "subjedit.endingChip", "subjedit.selectedCount",
  "subjedit.pendingAdd", "subjedit.pendingRemove",
  // Migration 120 — un-cancelling a scheduled removal is its own outcome, not
  // an addition: nothing is charged and the paid period is kept.
  "subjedit.pendingReinstate", "subjedit.reinstateLine", "subjedit.reinstateNote",
  "subjedit.save", "subjedit.saving", "subjedit.saved", "subjedit.noChanges",
  "pay.cancel", "pay.title", "pay.processing",
  "pay.subtotal", "pay.discount", "pay.total",
  // Mid-cycle change: an added subject opens its OWN period today and is
  // charged that period in full (proration retired, owner 2026-08-17), a
  // removed one keeps access to its own period end.
  // subjedit.nextBilling / .nextBillingLine and .estTotal are GONE from the
  // catalog — each stated a single child-wide renewal and total, which is not
  // how the plan is billed any more.
  "subjedit.dueNow", "subjedit.dueNowNote", "subjedit.cycleNote",
  "subjedit.perSubjectLabel", "subjedit.subjectPlanLine",
  "subjedit.renewsOn", "subjedit.switchesOn", "subjedit.startsToday",
  // subjedit.noteText is NOT here: the editor prints one dated line per removed
  // subject (subjedit.noteLine) plus the no-refund rule, so the single-date
  // sentence has no reader left on the web. Mobile still keeps it as the
  // fallback for a server that returns no per-subject list.
  "subjedit.noteLabel",
  "subjedit.noteLine", "subjedit.noteNoRefund", "subjedit.pendingChip",
  // Migration 125 - the sheet's primary button leads to the bank now, so it
  // says so. `pay.payNow` is retired from this screen: it charged nothing.
  "subjedit.noChargeNow", "pay.confirmNoCharge", "pay.continue",
  // Migration 109 — per-subject billing cycles (cards + grouped summary):
  "plan.cycle", "plan.cycleAria", "plan.cycleChangedAria",
  "plan.removeSubject",
  "plan.group.weekly", "plan.group.monthly", "plan.group.yearly",
  "plan.group.subtotal", "plan.dueToday", "plan.dueTodayNote",
  "plan.renewals", "plan.renewalLine.weekly", "plan.renewalLine.monthly",
  "plan.renewalLine.yearly", "plan.mixedNote", "plan.fromPrice",
  "plan.removeAria", "plan.perSubjectHint",
  "subjedit.pendingPlanChange", "subjedit.planChangeLine", "subjedit.planChangeNote",
  "cfg.add", "cfg.addAria", "cfg.allAdded", "cfg.unpriced", "cfg.emptySelection",
  "cfg.warnAllUnpriced", "cfg.warnSomeUnpriced",
  "billing.perWeek", "billing.perMonth", "billing.perYear",
  // H8 — free-window login-ID activation callout:
  "freeact.note", "freeact.cta", "freeact.activating", "freeact.done",
  // Round 51 (audit F7) — removal-only editor tooltip while payments are off:
  "gate.paymentsOff",
];

export default async function SubscribePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parent = await requireParent();
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("students")
    .select("profile_id, first_name, last_name, child_unique_id, created_by_parent_profile_id")
    .eq("profile_id", id)
    .maybeSingle();
  if (!child || (child as any).created_by_parent_profile_id !== parent.profileId) {
    notFound();
  }

  const { data: pricing } = await supabase
    .from("subjects_pricing")
    .select("subject_id, interval, price_amount, subjects(code, name)")
    .eq("status", "active");

  // `code` drives the locale-aware label (subj.<code>) in the client editors;
  // `name` stays the DB fallback. Submitted values remain subject UUIDs.
  const map = new Map<
    string,
    { id: string; code: string | null; name: string; prices: Record<string, number> }
  >();
  for (const row of (pricing ?? []) as any[]) {
    const sid = row.subject_id;
    if (!map.has(sid)) {
      map.set(sid, {
        id: sid,
        code: row.subjects?.code ?? null,
        name: row.subjects?.name ?? "—",
        prices: {},
      });
    }
    map.get(sid)!.prices[row.interval] = Number(row.price_amount);
  }
  const subjects = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Is there already a live subscription? If so, show the subject editor instead of
  // the start-trial form (the child already has a plan + an allocated login ID).
  const { data: sub } = await supabase
    .from("child_subscriptions")
    .select("id, status, interval")
    .eq("student_profile_id", id)
    .in("status", ["trialing", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Migration 078: a subject scheduled for removal keeps its row (access runs to
  // remove_at = its own period end) but is NO LONGER part of the go-forward
  // plan, so the editor lists it as available again — otherwise a completed
  // removal looks like it failed, and the parent could not undo it.
  //
  // Migration 109: every row carries its own cycle and period. `interval` is
  // nullable on legacy rows and inherits the subscription's, so it is resolved
  // here once rather than in the client component.
  let covered: CoveredSubject[] = [];
  if (sub?.id) {
    const { data: rows } = await supabase
      .from("subscription_subjects")
      .select("subject_id, interval, pending_interval, current_period_end, remove_at")
      .eq("child_subscription_id", (sub as any).id);
    covered = ((rows ?? []) as any[]).map((r) => ({
      subjectId: r.subject_id as string,
      interval: (r.interval ?? (sub as any).interval ?? "month") as string,
      pendingInterval: (r.pending_interval ?? null) as string | null,
      periodEnd: (r.current_period_end ?? null) as string | null,
      removeAt: (r.remove_at ?? null) as string | null,
    }));
  }

  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);

  // Round 11: the page is PAYMENT-MODE aware (server-resolved; the mode string
  // is passed down — client components never touch lib/paymentMode directly).
  // The server actions enforce the same gates; these are the friendly notices.
  const { mode } = await getPaymentModeInfo();
  // Round 12: a scheduled free-access interval FOR THIS CHILD blocks paid writes
  // like a giveaway (scoped per-child so a sibling's window doesn't affect this one).
  const freeIntervalActive = await isChildFreeAccessActive(id);

  // An unfinished payment for THIS CHILD - a checkout that was opened and never
  // completed, or one the gateway declined. Resolved here, server-side, so the
  // parent finds it again on the next visit instead of only in the tab where it
  // was created; a payment that can only be finished from a page you already
  // closed is a payment that never gets finished.
  //
  // KEYED ON THE CHILD, NOT ON A SUBSCRIPTION (migration 125). Since nothing is
  // applied until the money arrives, a family's FIRST plan has no subscription
  // to key on - and that is precisely the checkout most worth being able to
  // resume. Nothing was granted for it either way, so this is an offer to
  // finish, never a debt.
  //
  // Only in REAL mode: prompting for a payment during a giveaway or while
  // payments are off would be wrong, and the checkout action would refuse it
  // anyway (the mode is re-read at signing time).
  const outstandingCheckout =
    mode === "real"
      ? await findOutstandingPlanCheckout({
          ownerParentProfileId: parent.profileId,
          studentId: id,
        })
      : null;

  return (
    <section className="prose" style={{ maxWidth: 600 }}>
      {/* Same head row as the sibling child pages (edit / olympiads): title +
          the ghost link back to the dashboard. */}
      <div className="wiz-head">
        <h1>{t("sub.title")}</h1>
        <Link className="btn-ghost" href="/dashboard">
          {t("parent.dash.title")}
        </Link>
      </div>
      <p className="muted">
        {(child as any).first_name} {(child as any).last_name}
      </p>
      {mode === "off" ? (
        // Payments off → no NEW plans and no ADDS — but a live subscription
        // stays manageable in REMOVAL-ONLY mode (Round 51, audit F7): the DB
        // kill switch deliberately keeps removals legal so a parent is never
        // trapped paying for a subject they want to drop.
        <>
          <div className="price-callout">{t("gate.paymentsOff")}</div>
          {sub?.id && (
            <ManageSubjects
              studentId={id}
              subjects={subjects}
              covered={covered}
              paymentMode={mode}
              dict={dict}
            />
          )}
        </>
      ) : mode === "giveaway" || freeIntervalActive ? (
        // Free giveaway window OR an active free-access interval → paid writes are
        // blocked server-side; show the friendly "everything is free right now"
        // notice instead of the forms. H8: a child with NO live subscription and
        // NO allocated 8-digit login ID also gets the free activation button here
        // (same server action as the wizard's free path) so the free window never
        // dead-ends a new child without a login ID.
        <>
          <div className="price-callout">
            {mode === "giveaway" ? t("gate.giveawayFree") : t("gate.freeAccess")}
          </div>
          {!sub?.id && !(child as any).child_unique_id && (
            <FreeActivation studentId={id} dict={dict} />
          )}
        </>
      ) : sub?.id ? (
        <ManageSubjects
          studentId={id}
          subjects={subjects}
          covered={covered}
          paymentMode={mode}
          outstandingCheckout={outstandingCheckout}
          dict={dict}
        />
      ) : (
        <SubscribeForm
          studentId={id}
          subjects={subjects}
          outstandingCheckout={outstandingCheckout}
          dict={dict}
        />
      )}
    </section>
  );
}
