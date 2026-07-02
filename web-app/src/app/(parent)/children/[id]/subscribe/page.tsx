import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
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
  "subjedit.title", "subjedit.current", "subjedit.add", "subjedit.remove",
  "subjedit.addPick", "subjedit.none", "subjedit.minOne",
  "subjedit.err.addFailed", "subjedit.err.removeFailed",
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
    .select("id, status")
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

  return (
    <section className="prose" style={{ maxWidth: 600 }}>
      <h1>{t("sub.title")}</h1>
      <p className="muted">
        {(child as any).first_name} {(child as any).last_name}
      </p>
      {!(await isFeatureEnabled("payments")) ? (
        // payments flag OFF → no new plans and no billing edits (the server
        // actions enforce the same gate; this is the friendly notice).
        <div className="price-callout">{t("gate.paymentsOff")}</div>
      ) : sub?.id ? (
        <ManageSubjects
          studentId={id}
          subjects={subjects}
          coveredIds={coveredIds}
          dict={dict}
        />
      ) : (
        <SubscribeForm studentId={id} subjects={subjects} dict={dict} />
      )}
    </section>
  );
}
