import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { isChildFreeAccessActive } from "@/lib/freeAccess";
import { SubscribeForm } from "@/components/SubscribeForm";
import { ManageSubjects } from "@/components/ManageSubjects";

const KEYS = [
  "sub.interval", "sub.subjects", "sub.subtotal", "sub.siblingNote",
  "sub.submit", "sub.submitting", "sub.done", "sub.base", "sub.discount",
  "sub.total", "sub.trial", "sub.days", "sub.totalNow", "sub.previewHint",
  "sub.calculating", "sub.noSibling", "sub.noSubjectsAvailable",
  "sub.err.invalid", "sub.err.noSubjects", "sub.err.notYourChild",
  "parent.child.idLabel", "parent.child.idNote",
  "pricing.weekly", "pricing.monthly", "pricing.yearly", "parent.dash.title",
  // Manage-subjects (existing subscription) keys:
  "subjedit.title", "subjedit.minOne",
  // Round 11 — checkbox editor + demo-payment modal:
  "pricing.perSubjectNote", "subjedit.activeChip", "subjedit.selectedCount",
  "subjedit.pendingAdd", "subjedit.pendingRemove", "subjedit.estTotal",
  "subjedit.save", "subjedit.saving", "subjedit.saved", "subjedit.noChanges",
  "subjedit.demoModeNote", "dpay.cancel",
  "pay.title", "pay.demoBadge", "pay.note", "pay.cardName", "pay.cardNumber",
  "pay.expiry", "pay.cvc", "pay.payNow", "pay.processing",
  "pay.subtotal", "pay.discount", "pay.total",
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
    .select("profile_id, first_name, last_name, created_by_parent_profile_id")
    .eq("profile_id", id)
    .maybeSingle();
  if (!child || (child as any).created_by_parent_profile_id !== parent.profileId) {
    notFound();
  }

  const { data: pricing } = await supabase
    .from("subjects_pricing")
    .select("subject_id, interval, price_amount, subjects(name)")
    .eq("status", "active");

  const map = new Map<string, { id: string; name: string; prices: Record<string, number> }>();
  for (const row of (pricing ?? []) as any[]) {
    const sid = row.subject_id;
    if (!map.has(sid)) map.set(sid, { id: sid, name: row.subjects?.name ?? "—", prices: {} });
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

  let coveredIds: string[] = [];
  if (sub?.id) {
    const { data: covered } = await supabase
      .from("subscription_subjects")
      .select("subject_id")
      .eq("child_subscription_id", (sub as any).id);
    coveredIds = ((covered ?? []) as any[]).map((r) => r.subject_id);
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

  return (
    <section className="prose" style={{ maxWidth: 600 }}>
      <h1>{t("sub.title")}</h1>
      <p className="muted">
        {(child as any).first_name} {(child as any).last_name}
      </p>
      {mode === "off" ? (
        // Payments off → no new plans and no billing edits.
        <div className="price-callout">{t("gate.paymentsOff")}</div>
      ) : mode === "giveaway" || freeIntervalActive ? (
        // Free giveaway window OR an active free-access interval → paid writes are
        // blocked server-side; show the friendly "everything is free right now"
        // notice instead of the forms.
        <div className="price-callout">
          {mode === "giveaway" ? t("gate.giveawayFree") : t("gate.freeAccess")}
        </div>
      ) : sub?.id ? (
        <ManageSubjects
          studentId={id}
          subjects={subjects}
          coveredIds={coveredIds}
          interval={(sub as any).interval ?? "month"}
          paymentMode={mode}
          dict={dict}
        />
      ) : (
        <SubscribeForm studentId={id} subjects={subjects} dict={dict} />
      )}
    </section>
  );
}
