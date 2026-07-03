import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { CancelSubscription } from "@/components/CancelSubscription";
import { BillingTabs } from "@/components/BillingTabs";
import { InvoicesSection, type InvoiceRow } from "@/components/InvoicesSection";

// R8 billing — one-page SaaS subscription center with internal tabs
// [Plans | Billing | Invoices] that smooth-scroll to same-page sections.
//   PLANS    — per child, the three shared-contract plan cards (pricing2.*
//              copy with graceful fallback to the live pricing.* keys), the
//              child's REAL subscribed subjects + a computed total per plan,
//              "Current plan" badge on the child's actual interval.
//   BILLING  — owner-approved static demo card (plan / cycle / next date /
//              card on file) + the REAL cancel flow (CancelSubscription
//              server action) for every cancellable child subscription.
//   INVOICES — demo invoice history + email-notification toggle (client).
// Data is read via the RLS-scoped server client; every branch is try/catch
// guarded so a query hiccup degrades gracefully instead of throwing.

const LIVE = ["trialing", "active", "past_due"] as const;

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

// Existing status badge classes (already themed in globals.css).
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

// Demo-grade plan math — matches the public pricing page copy (≈ AZN/subject).
const PLANS = [
  { interval: "week", slug: "weekly", price: 2 },
  { interval: "month", slug: "monthly", price: 6 },
  { interval: "year", slug: "yearly", price: 50 },
] as const;

// Cancel-flow copy passed to the client component so it never touches i18n.
const CANCEL_KEYS = [
  "subscription.cancelBtn",
  "cancel.title", "cancel.intro", "cancel.reasonLabel",
  "cancel.reason.price", "cancel.reason.notUsing", "cancel.reason.features",
  "cancel.reason.temporary", "cancel.reason.other",
  "cancel.benefitsTitle", "cancel.benefit1", "cancel.benefit2", "cancel.benefit3",
  "cancel.confirm", "cancel.keep", "cancel.done", "cancel.err",
];

// Copy passed to the invoices client section.
const INVOICE_KEYS = [
  "billing.emailToggle", "billing.emailToggleHint", "billing.recipient",
  "billing.changeEmail", "billing.requestInvoice", "billing.soon",
  "billing.download",
  "billing.col.id", "billing.col.date", "billing.col.plan",
  "billing.col.subjects", "billing.col.amount", "billing.col.status",
  "billing.col.action",
];

// Small MasterCard mark (inline SVG — strict CSP, no external images).
function CardBrandIcon() {
  return (
    <svg width="30" height="20" viewBox="0 0 30 20" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="29"
        height="19"
        rx="3.5"
        fill="none"
        stroke="currentColor"
        opacity="0.3"
      />
      <circle cx="12" cy="10" r="5.6" fill="#eb001b" opacity="0.9" />
      <circle cx="18" cy="10" r="5.6" fill="#f79e1b" opacity="0.85" />
    </svg>
  );
}

export default async function ParentSubscription() {
  const parent = await requireParent();
  const t = await getT();
  const supabase = await createClient();

  // pricing2.* is owned by the public pricing page; fall back to the live
  // pricing.* keys (always present) so no raw key can ever render here.
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = t(k);
      if (v && v !== k) return v;
    }
    return "";
  };

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

      // Latest live subscription per child.
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
          name:
            `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
            t("subscription.child"),
          interval: sub?.interval ?? null,
          subjects: sub ? subjectsBySub.get(sub.id) ?? [] : [],
          status: normalizeStatus(sub?.status),
        };
      });
    } catch {
      return [];
    }
  })();

  // Parent's real email for the invoices section (demo fallback).
  let parentEmail = "parent@example.com";
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", parent.profileId)
      .single();
    const e = (prof as { email?: string } | null)?.email;
    if (e) parentEmail = e;
  } catch {
    // keep the demo address
  }

  // Shared plan-card copy (pricing2.* from the contract, pricing.* fallback).
  const planCopy = PLANS.map(({ slug }) => ({
    name: pick(`pricing2.plan.${slug}.name`, `pricing.plan.${slug}.name`),
    price: pick(`pricing2.plan.${slug}.price`, `pricing.plan.${slug}.price`),
    per: pick(`pricing2.plan.${slug}.per`, `pricing.plan.${slug}.unit`),
    desc: pick(
      `pricing2.plan.${slug}.desc`,
      `pricing2.plan.${slug}.note`,
      `pricing.plan.${slug}.note`,
    ),
  }));
  const popularBadge = pick(
    "pricing2.badge.popular",
    "pricing2.popular",
    "pricing2.mostPopular",
    "billing.popular",
  );
  const perSuffix: Record<(typeof PLANS)[number]["interval"], string> = {
    week: t("billing.perWeek"),
    month: t("billing.perMonth"),
    year: t("billing.perYear"),
  };
  const monthlyName = planCopy[1].name;

  const cancelStrings: Record<string, string> = {};
  for (const k of CANCEL_KEYS) cancelStrings[k] = t(k);
  const invoiceStrings: Record<string, string> = {};
  for (const k of INVOICE_KEYS) invoiceStrings[k] = t(k);

  const cancellable = cards.filter(
    (c) =>
      c.subscriptionId !== null &&
      (c.status === "trialing" || c.status === "active"),
  );

  // Owner-approved static demo invoice history.
  const invoiceRows: InvoiceRow[] = [
    {
      id: "INV-2026-001",
      date: t("billing.date1"),
      plan: monthlyName,
      subjects: t("billing.threeSubjects"),
      amount: "≈ 18 AZN",
      status: t("billing.paid"),
    },
    {
      id: "INV-2025-012",
      date: t("billing.date2"),
      plan: monthlyName,
      subjects: t("billing.threeSubjects"),
      amount: "≈ 18 AZN",
      status: t("billing.paid"),
    },
  ];

  const tabs = [
    { id: "billing-plans", label: t("billing.tab.plans") },
    { id: "billing-billing", label: t("billing.tab.billing") },
    { id: "billing-invoices", label: t("billing.tab.invoices") },
  ];

  const billingRows: { label: string; value: React.ReactNode }[] = [
    { label: t("billing.current"), value: monthlyName },
    { label: t("billing.row.cycle"), value: monthlyName },
    { label: t("billing.row.next"), value: "29/01/2026" },
    { label: t("billing.totalLabel"), value: "≈ 18 AZN" },
    {
      label: t("billing.row.method"),
      value: (
        <span className="billing-card-brand">
          <CardBrandIcon />
          {t("billing.cardEnding")}
        </span>
      ),
    },
    { label: t("billing.row.expiry"), value: "11/2028" },
    {
      label: t("billing.row.status"),
      value: <span className="billing-pill ok">{t("billing.defaultMethod")}</span>,
    },
  ];

  return (
    <section className="billing-page">
      <header className="billing-head">
        <h1>{t("subscription.title")}</h1>
        <p>{t("subscription.subtitle")}</p>
      </header>

      <BillingTabs tabs={tabs} ariaLabel={t("billing.tabsAria")} />

      {/* ---------------------------------------------------------- PLANS */}
      <section id="billing-plans" className="billing-section">
        <h2 className="billing-section-h">{t("billing.plansTitle")}</h2>

        {cards.length === 0 ? (
          <p className="muted">{t("parent.dash.noChildren")}</p>
        ) : (
          cards.map((c) => {
            const hasPlan = c.subscriptionId !== null;
            const subscribeHref = `/children/${c.studentProfileId}/subscribe`;
            const initial = (c.name.trim()[0] ?? "•").toUpperCase();
            return (
              <div className="billing-child" key={c.studentProfileId}>
                <div className="billing-child-head">
                  <span className="billing-child-mark" aria-hidden="true">
                    {initial}
                  </span>
                  <span className="billing-child-name">{c.name}</span>
                  <span className={badgeClass(c.status)}>
                    {t(`subscription.status.${c.status}`)}
                  </span>
                </div>

                <div className="plans-grid">
                  {PLANS.map((p, idx) => {
                    const copy = planCopy[idx];
                    const isCurrent = hasPlan && c.interval === p.interval;
                    const isPopular = p.interval === "month";
                    const featured = isCurrent || (!hasPlan && isPopular);
                    const total = c.subjects.length * p.price;
                    return (
                      <div
                        key={p.interval}
                        className={`plan-card${featured ? " featured" : ""}`}
                      >
                        {isCurrent ? (
                          <span className="plan-badge current">
                            {t("billing.current")}
                          </span>
                        ) : isPopular ? (
                          <span className="plan-badge">{popularBadge}</span>
                        ) : null}
                        <div className="plan-name">{copy.name}</div>
                        <div className="plan-price">{copy.price}</div>
                        <div className="plan-per">{copy.per}</div>
                        <p className="plan-desc">{copy.desc}</p>

                        {c.subjects.length > 0 ? (
                          <>
                            <ul className="plan-benefits">
                              {c.subjects.map((subj) => (
                                <li key={subj}>{subj}</li>
                              ))}
                            </ul>
                            <div className="billing-calc">
                              {c.subjects.length} × {p.price} AZN{" "}
                              {perSuffix[p.interval]}
                            </div>
                            <div className="billing-total">
                              {t("billing.totalLabel")}:{" "}
                              <strong>≈ {total} AZN</strong>{" "}
                              <span>{perSuffix[p.interval]}</span>
                            </div>
                          </>
                        ) : (
                          <p className="billing-nosub">
                            {t("billing.noSubjects")}
                          </p>
                        )}

                        {hasPlan ? (
                          isCurrent ? (
                            <Link className="plan-cta primary" href={subscribeHref}>
                              {t("subscription.manageSubjects")}
                            </Link>
                          ) : (
                            <Link className="plan-cta" href={subscribeHref}>
                              {t("billing.addSubjects")}
                            </Link>
                          )
                        ) : (
                          <Link
                            className={`plan-cta${isPopular ? " primary" : ""}`}
                            href={subscribeHref}
                          >
                            {t("subscription.startPlan")}
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* -------------------------------------------------------- BILLING */}
      <section id="billing-billing" className="billing-section">
        <h2 className="billing-section-h">{t("billing.billingTitle")}</h2>
        <div className="billing-panel">
          <div className="billing-rows">
            {billingRows.map((r) => (
              <div className="billing-row" key={r.label}>
                <span className="billing-row-label">{r.label}</span>
                <span className="billing-row-value">{r.value}</span>
              </div>
            ))}
          </div>

          <div className="billing-actions">
            <button
              type="button"
              className="billing-btn inert"
              aria-disabled="true"
              title={t("billing.soon")}
            >
              {t("billing.changeMethod")}
            </button>
            <button
              type="button"
              className="billing-btn inert"
              aria-disabled="true"
              title={t("billing.soon")}
            >
              {t("billing.addCard")}
            </button>
            <button
              type="button"
              className="billing-btn inert"
              aria-disabled="true"
              title={t("billing.soon")}
            >
              {t("billing.updateDetails")}
            </button>
          </div>

          {cancellable.length > 0 && (
            <div className="billing-cancel-rows">
              {cancellable.map((c) => (
                <div className="billing-cancel-row" key={c.studentProfileId}>
                  <span className="billing-cancel-name">{c.name}</span>
                  <CancelSubscription
                    studentProfileId={c.studentProfileId}
                    subscriptionId={c.subscriptionId as string}
                    childName={c.name}
                    strings={cancelStrings}
                  />
                </div>
              ))}
            </div>
          )}

          <p className="billing-note">{t("billing.demoNote")}</p>
        </div>
      </section>

      {/* ------------------------------------------------------- INVOICES */}
      <section id="billing-invoices" className="billing-section">
        <h2 className="billing-section-h">{t("billing.invoicesTitle")}</h2>
        <InvoicesSection
          email={parentEmail}
          rows={invoiceRows}
          strings={invoiceStrings}
        />
      </section>
    </section>
  );
}
