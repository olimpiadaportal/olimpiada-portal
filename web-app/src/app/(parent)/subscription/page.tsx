import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { CancelSubscription } from "@/components/CancelSubscription";

// W2 — subscription management as modern SaaS plan cards (one per child). Each card
// shows the child's name, plan interval, subscribed subjects, a status badge, and
// contextual actions: manage subjects, start a plan (no subscription), and cancel
// (only when trialing/active). Data is read via the RLS-scoped server client and
// every branch is try/catch guarded so a query hiccup degrades to an empty list
// rather than throwing. Copy comes from getT() — no raw i18n keys are rendered.

const LIVE = ["trialing", "active", "past_due"] as const;

// The exact contract statuses (W1 owns the labels). We normalize whatever the DB
// returns (including nulls) onto one of these so the badge always has a class+label.
type SubStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "none";

function normalizeStatus(status: string | null | undefined): SubStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "expired":
      return status;
    default:
      return "none";
  }
}

// Map a status to the W1 badge modifier class. active/trialing/canceled have their
// own scoped colors; the rest reuse the neutral base .sub-status.
function badgeClass(status: SubStatus): string {
  if (status === "active" || status === "past_due") return "sub-status active";
  if (status === "trialing") return "sub-status trial";
  if (status === "canceled" || status === "expired") return "sub-status canceled";
  return "sub-status";
}

type Card = {
  studentProfileId: string;
  subscriptionId: string | null;
  name: string;
  interval: string | null;
  subjects: string[];
  status: SubStatus;
};

// Cancel-flow copy (W1 keys) passed to the client component so it never touches i18n.
const CANCEL_KEYS = [
  "subscription.cancelBtn",
  "cancel.title", "cancel.intro", "cancel.reasonLabel",
  "cancel.reason.price", "cancel.reason.notUsing", "cancel.reason.features",
  "cancel.reason.temporary", "cancel.reason.other",
  "cancel.benefitsTitle", "cancel.benefit1", "cancel.benefit2", "cancel.benefit3",
  "cancel.confirm", "cancel.keep", "cancel.done", "cancel.err",
];

export default async function ParentSubscription() {
  const parent = await requireParent();
  const t = await getT();
  const supabase = await createClient();

  const cards: Card[] = await (async () => {
    try {
      const { data: children } = await supabase
        .from("students")
        .select("profile_id, first_name, last_name")
        .eq("created_by_parent_profile_id", parent.profileId)
        .order("created_at", { ascending: true });
      const kids = (children ?? []) as any[];
      if (kids.length === 0) return [];

      const childIds = kids.map((c) => c.profile_id);

      // Latest live subscription per child (id + interval so the card can show them).
      const subByChild = new Map<string, { id: string; interval: string; status: string }>();
      try {
        const { data: subs } = await supabase
          .from("child_subscriptions")
          .select("id, student_profile_id, status, interval, created_at")
          .in("student_profile_id", childIds)
          .in("status", LIVE as unknown as string[])
          .order("created_at", { ascending: false });
        for (const s of (subs ?? []) as any[]) {
          if (!subByChild.has(s.student_profile_id)) {
            subByChild.set(s.student_profile_id, {
              id: s.id,
              interval: s.interval,
              status: s.status,
            });
          }
        }
      } catch {
        // No live subs → cards render as "none".
      }

      // Covered subject names for each live subscription (best-effort).
      const subjectsBySub = new Map<string, string[]>();
      const liveSubIds = Array.from(subByChild.values()).map((v) => v.id);
      if (liveSubIds.length > 0) {
        try {
          const { data: covered } = await supabase
            .from("subscription_subjects")
            .select("child_subscription_id, subjects(name)")
            .in("child_subscription_id", liveSubIds);
          for (const row of (covered ?? []) as any[]) {
            const list = subjectsBySub.get(row.child_subscription_id) ?? [];
            const nm = row.subjects?.name;
            if (nm) list.push(nm);
            subjectsBySub.set(row.child_subscription_id, list);
          }
        } catch {
          // Subjects are optional decoration on the card.
        }
      }

      return kids.map((c): Card => {
        const sub = subByChild.get(c.profile_id) ?? null;
        return {
          studentProfileId: c.profile_id,
          subscriptionId: sub?.id ?? null,
          name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || t("subscription.child"),
          interval: sub?.interval ?? null,
          subjects: sub ? subjectsBySub.get(sub.id) ?? [] : [],
          status: normalizeStatus(sub?.status),
        };
      });
    } catch {
      return [];
    }
  })();

  const intervalLabel = (interval: string | null): string => {
    switch (interval) {
      case "week":
        return t("pricing.weekly");
      case "month":
        return t("pricing.monthly");
      case "year":
        return t("pricing.yearly");
      default:
        return t("subscription.status.none");
    }
  };

  const cancelStrings: Record<string, string> = {};
  for (const k of CANCEL_KEYS) cancelStrings[k] = t(k);

  return (
    <section className="prose">
      <h1>{t("subscription.title")}</h1>
      <p className="muted">{t("subscription.subtitle")}</p>

      {cards.length === 0 ? (
        <p className="muted">{t("parent.dash.noChildren")}</p>
      ) : (
        <div className="sub-cards">
          {cards.map((c, i) => {
            const hasPlan = c.subscriptionId !== null;
            const canCancel = c.status === "trialing" || c.status === "active";
            // Highlight the first active/trialing plan as the featured card.
            const featured =
              i === cards.findIndex((x) => x.status === "active" || x.status === "trialing") &&
              (c.status === "active" || c.status === "trialing");
            return (
              <div
                className={`sub-card${featured ? " featured" : ""}`}
                key={c.studentProfileId}
              >
                <div className="sub-card-head">
                  <span className="sub-plan">{c.name}</span>
                  <span className={badgeClass(c.status)}>
                    {t(`subscription.status.${c.status}`)}
                  </span>
                </div>

                <div className="sub-price">{intervalLabel(c.interval)}</div>

                <div className="sub-features">
                  <div className="sub-feature">
                    <span>{t("subscription.subjects")}:</span>{" "}
                    {c.subjects.length > 0 ? c.subjects.join(", ") : "—"}
                  </div>
                </div>

                <div className="sub-card-actions">
                  {hasPlan ? (
                    <Link
                      className="btn"
                      href={`/children/${c.studentProfileId}/subscribe`}
                    >
                      {t("subscription.manageSubjects")}
                    </Link>
                  ) : (
                    <Link
                      className="btn"
                      href={`/children/${c.studentProfileId}/subscribe`}
                    >
                      {t("subscription.startPlan")}
                    </Link>
                  )}
                  {canCancel && c.subscriptionId && (
                    <CancelSubscription
                      studentProfileId={c.studentProfileId}
                      subscriptionId={c.subscriptionId}
                      childName={c.name}
                      strings={cancelStrings}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
