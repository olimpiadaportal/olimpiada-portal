import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { isChildFreeAccessActive } from "@/lib/freeAccess";
import { CancelSubscription } from "@/components/CancelSubscription";
import { BillingTabs } from "@/components/BillingTabs";
import { Segmented } from "@/components/Segmented";
import { getPerSubjectPrices } from "@/lib/pricing";
import { subjectLabel } from "@/lib/subjectLabel";
import { resolveChildAvatarUrl } from "@/lib/childAvatar";
import { ChildAvatar } from "@/components/ChildAvatar";
import { CmsProse } from "@/components/CmsProse";
import { formatLongDate } from "@/lib/formatDate";

// R8 billing — one-page SaaS subscription center with internal tabs
// [Plans | Billing | Invoices] that smooth-scroll to same-page sections.
//   PLANS    — per child, the three shared-contract plan cards (pricing2.*
//              copy with graceful fallback to the live pricing.* keys), the
//              child's REAL subscribed subjects + a computed total per plan,
//              "Current plan" badge on the child's actual interval.
//   BILLING  — the child's REAL billing facts (per-subject cycles, the next
//              charge date and its amount) + the REAL cancel flow
//              (CancelSubscription server action) for every cancellable child
//              subscription. Nothing here is invented: the static demo card
//              (next billing 29/01/2026, MasterCard ****8475, inert card
//              buttons) went out with the demo payment mode on 2026-08-18.
//   INVOICES — an honest empty state until a payment provider issues real
//              ones. It used to be two fabricated PAID invoices; a displayed
//              false price is not cured by calling it a demo.
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
  /**
   * Migration 109: one entry per covered subject, each with ITS OWN cycle and
   * period end. The old single `interval` is gone — a child can now hold a
   * weekly and a yearly subject at once, so no single value describes the plan.
   */
  plan: { name: string; interval: string; periodEnd: string | null }[];
  /** MIN of the subject period ends: the next charge date. */
  nextRenewalAt: string | null;
  /** The NEXT invoice amount (the subjects renewing at nextRenewalAt). */
  totalAmount: number | null;
  subjects: string[];
  status: SubStatus;
  /** Parent-managed avatar display URL (signed photo / preset PNG) or null. */
  avatarUrl: string | null;
};

// M8: per-subject prices come from the DB (subjects_pricing via getPerSubjectPrices)
// — never hardcoded here. Totals shown are the pre-discount subject×price sum;
// the sibling discount is applied server-side at checkout (sub.siblingNote).
const PLANS = [
  { interval: "week", slug: "weekly" },
  { interval: "month", slug: "monthly" },
  { interval: "year", slug: "yearly" },
] as const;

// Migration 109: a subject's OWN cycle, named for the per-subject plan list.
const CYCLE_NAME_KEY: Record<string, string> = {
  week: "pricing.weekly",
  month: "pricing.monthly",
  year: "pricing.yearly",
};

// Cancel-flow copy passed to the client component so it never touches i18n.
const CANCEL_KEYS = [
  "subscription.cancelBtn",
  "cancel.title", "cancel.intro", "cancel.reasonLabel",
  "cancel.reason.price", "cancel.reason.notUsing", "cancel.reason.features",
  "cancel.reason.temporary", "cancel.reason.other",
  "cancel.benefitsTitle", "cancel.benefit1", "cancel.benefit2", "cancel.benefit3",
  "cancel.confirm", "cancel.keep", "cancel.done", "cancel.err",
];

export default async function ParentSubscription({
  searchParams,
}: {
  searchParams: Promise<{ child?: string | string[] }>;
}) {
  const parent = await requireParent();
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();

  // Round 11: payment-mode awareness (server-resolved). During an active
  // giveaway window every plan CTA becomes a disabled "free" chip and a slim
  // notice bar renders above the Plans section — paid writes are blocked
  // server-side anyway; this is the friendly surface.
  const { mode } = await getPaymentModeInfo();
  // Round 12: `giveaway` (the free-surface flag) is finalized AFTER the selected
  // child is known, so a per-child free-access interval scopes to that child.
  // M8: real per-interval, per-subject prices from subjects_pricing.
  const prices = await getPerSubjectPrices();

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
        .select(
          "profile_id, first_name, last_name, avatar_kind, avatar_key, avatar_media_path",
        )
        .eq("created_by_parent_profile_id", parent.profileId)
        .order("created_at", { ascending: true });
      const kids = (children ?? []) as any[];
      if (kids.length === 0) return [];

      const childIds = kids.map((c) => c.profile_id);

      // Latest live subscription per child.
      const subByChild = new Map<
        string,
        {
          id: string;
          interval: string;
          status: string;
          nextRenewalAt: string | null;
          totalAmount: number | null;
        }
      >();
      try {
        const { data: subs } = await supabase
          .from("child_subscriptions")
          .select(
            "id, student_profile_id, status, interval, next_renewal_at, total_amount, created_at",
          )
          .in("student_profile_id", childIds)
          .in("status", LIVE as unknown as string[])
          .order("created_at", { ascending: false });
        for (const s of (subs ?? []) as any[]) {
          if (!subByChild.has(s.student_profile_id)) {
            subByChild.set(s.student_profile_id, {
              id: s.id,
              interval: s.interval,
              status: s.status,
              nextRenewalAt: s.next_renewal_at ?? null,
              totalAmount: s.total_amount == null ? null : Number(s.total_amount),
            });
          }
        }
      } catch {
        // No live subs → cards render as "none".
      }

      // Covered subject names for each live subscription (best-effort).
      const subjectsBySub = new Map<string, string[]>();
      const planBySub = new Map<
        string,
        { name: string; interval: string; periodEnd: string | null }[]
      >();
      const liveSubIds = Array.from(subByChild.values()).map((v) => v.id);
      if (liveSubIds.length > 0) {
        try {
          const { data: covered } = await supabase
            .from("subscription_subjects")
            .select(
              "child_subscription_id, subject_id, interval, current_period_end, remove_at, subjects(code, name)",
            )
            .in("child_subscription_id", liveSubIds);
          for (const row of (covered ?? []) as any[]) {
            const list = subjectsBySub.get(row.child_subscription_id) ?? [];
            const nm = row.subjects?.name;
            if (nm) list.push(subjectLabel(t, row.subjects?.code, nm));
            subjectsBySub.set(row.child_subscription_id, list);
            const rows = planBySub.get(row.child_subscription_id) ?? [];
            rows.push({
              name: nm ? subjectLabel(t, row.subjects?.code, nm) : "—",
              // A legacy row inherits the subscription's cycle.
              interval:
                row.interval ??
                Array.from(subByChild.values()).find(
                  (v) => v.id === row.child_subscription_id,
                )?.interval ??
                "month",
              periodEnd: row.current_period_end ?? null,
            });
            planBySub.set(row.child_subscription_id, rows);
          }
        } catch {
          // Subjects are optional decoration on the card.
        }
      }

      return await Promise.all(
        kids.map(async (c): Promise<Card> => {
          const sub = subByChild.get(c.profile_id) ?? null;
          return {
            studentProfileId: c.profile_id,
            subscriptionId: sub?.id ?? null,
            name:
              `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
              t("subscription.child"),
            plan: sub ? planBySub.get(sub.id) ?? [] : [],
            nextRenewalAt: sub?.nextRenewalAt ?? null,
            totalAmount: sub?.totalAmount ?? null,
            subjects: sub ? subjectsBySub.get(sub.id) ?? [] : [],
            status: normalizeStatus(sub?.status),
            // Parent-managed avatar (signed photo URL / preset PNG / null).
            avatarUrl: await resolveChildAvatarUrl(supabase, c),
          };
        }),
      );
    } catch {
      return [];
    }
  })();

  // Task 5 — URL-driven child selector (?child=<studentProfileId>). The
  // requested id is validated against the parent's OWN children: `cards` is
  // built from an ownership-filtered, RLS-scoped query, so a foreign or
  // malformed id simply never matches and safely falls back to the first
  // child. Server-driven <Link> tabs keep the selection refresh-/deep-link-
  // safe with zero trust in client state.
  const sp = await searchParams;
  const requestedChild = typeof sp?.child === "string" ? sp.child : "";
  const selectedCard =
    cards.find((c) => c.studentProfileId === requestedChild) ?? cards[0] ?? null;

  // Free surface = global giveaway OR a free-access interval FOR THE SELECTED CHILD
  // (scoped per-child so a sibling's window doesn't turn this child's plans free).
  const freeIntervalActive = selectedCard
    ? await isChildFreeAccessActive(selectedCard.studentProfileId)
    : false;
  const giveaway = mode === "giveaway" || freeIntervalActive;

  // Shared plan-card copy (pricing2.* from the contract, pricing.* fallback).
  // The .price strings carry a {price} placeholder filled with the DB price.
  const planCopy = PLANS.map(({ slug, interval }) => ({
    name: pick(`pricing2.plan.${slug}.name`, `pricing.plan.${slug}.name`),
    price: pick(`pricing2.plan.${slug}.price`, `pricing.plan.${slug}.price`).replace(
      "{price}",
      String(prices[interval]),
    ),
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

  const cancelStrings: Record<string, string> = {};
  for (const k of CANCEL_KEYS) cancelStrings[k] = t(k);

  // Billing/cancel rows are scoped to the SELECTED child only (Task 5); the
  // cancel action itself re-validates ownership + subscription id server-side.
  // L6: past_due is cancellable too (the server action already accepts it).
  const cancellable =
    selectedCard &&
    selectedCard.subscriptionId !== null &&
    (selectedCard.status === "trialing" ||
      selectedCard.status === "active" ||
      selectedCard.status === "past_due")
      ? [selectedCard]
      : [];


  const tabs = [
    { id: "billing-plans", label: t("billing.tab.plans") },
    { id: "billing-billing", label: t("billing.tab.billing") },
    { id: "billing-invoices", label: t("billing.tab.invoices") },
  ];

  // Migration 109: every row here is the child's REAL number — next_renewal_at
  // is the MIN of the subject period ends (the next charge) and total_amount is
  // the invoice that falls due on it. A row is OMITTED rather than filled with
  // a placeholder: the hardcoded fallbacks (29/01/2026, ≈ 18 AZN) and the
  // card-on-file block were demo content and were deleted with the demo payment
  // mode on 2026-08-18. With no live plan the list is empty and the panel says
  // so.
  const liveCycles = selectedCard
    ? Array.from(new Set(selectedCard.plan.map((p) => p.interval)))
    : [];
  const billingRows: { label: string; value: React.ReactNode }[] = [];
  if (liveCycles.length > 0) {
    billingRows.push({
      label: t("billing.row.cycle"),
      value: liveCycles
        .map((iv) => t(CYCLE_NAME_KEY[iv] ?? "pricing.monthly"))
        .join(" · "),
    });
  }
  if (selectedCard?.nextRenewalAt) {
    billingRows.push({
      label: t("billing.row.next"),
      value: formatLongDate(selectedCard.nextRenewalAt, locale),
    });
  }
  if (selectedCard?.totalAmount != null) {
    billingRows.push({
      label: t("billing.totalLabel"),
      value: `${selectedCard.totalAmount} AZN`,
    });
  }

  return (
    <section className="billing-page">
      <header className="billing-head">
        <h1>{t("subscription.title")}</h1>
        <CmsProse text={t("subscription.subtitle")} />
      </header>

      {/* Task 5 — child selector tabs (only with 2+ children). URL-driven
          <Link>s (?child=…) so a refresh/deep link keeps the right child. */}
      {cards.length > 1 && (
        <Segmented as="nav" className="bkids-tabs" aria-label={t("billing.selectChild")} track>
          {cards.map((c) => {
            const active = selectedCard?.studentProfileId === c.studentProfileId;
            return (
              <Link
                key={c.studentProfileId}
                href={`/subscription?child=${c.studentProfileId}`}
                className={`bkids-tab${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {c.avatarUrl ? (
                  <ChildAvatar url={c.avatarUrl} name={c.name} size={24} />
                ) : (
                  <span className="bkids-mark" aria-hidden="true">
                    {(c.name.trim()[0] ?? "•").toUpperCase()}
                  </span>
                )}
                <span className="bkids-name">{c.name}</span>
              </Link>
            );
          })}
        </Segmented>
      )}

      <BillingTabs tabs={tabs} ariaLabel={t("billing.tabsAria")} />

      {/* Round 11 — slim free-notice bar during an active giveaway window. */}
      {giveaway && (
        <p className="subjedit-free-bar">{t("billing.giveawayNote")}</p>
      )}

      {/* Round 51 (audit F4): payments OFF — say it once up front. The plan
          cards below drop their start/add CTAs (the DB kill switch rejects
          those writes anyway); managing existing subjects stays available
          because REMOVALS are deliberately still legal. */}
      {mode === "off" && (
        <div className="price-callout">{t("gate.paymentsOff")}</div>
      )}

      {/* ---------------------------------------------------------- PLANS */}
      <section id="billing-plans" className="billing-section">
        <h2 className="billing-section-h">{t("billing.plansTitle")}</h2>

        {!selectedCard ? (
          <p className="muted">{t("parent.dash.noChildren")}</p>
        ) : (
          [selectedCard].map((c) => {
            const hasPlan = c.subscriptionId !== null;
            const subscribeHref = `/children/${c.studentProfileId}/subscribe`;
            const initial = (c.name.trim()[0] ?? "•").toUpperCase();
            return (
              <div className="billing-child" key={c.studentProfileId}>
                <div className="billing-child-head">
                  {c.avatarUrl ? (
                    <ChildAvatar url={c.avatarUrl} name={c.name} size={40} />
                  ) : (
                    <span className="billing-child-mark" aria-hidden="true">
                      {initial}
                    </span>
                  )}
                  <span className="billing-child-name">{c.name}</span>
                  <span className={badgeClass(c.status)}>
                    {t(`subscription.status.${c.status}`)}
                  </span>
                </div>

                {hasPlan ? (
                  // Migration 109: a live plan is a LIST of subjects, each on
                  // its own cycle. Three cycle cards cannot say "you are on
                  // this one" any more, so they are kept only for the
                  // no-plan pitch below.
                  <div className="billing-plan-list">
                    <ul className="plan-benefits">
                      {c.plan.map((row) => (
                        <li key={`${row.name}-${row.interval}`}>
                          {row.name} · {t(CYCLE_NAME_KEY[row.interval] ?? "pricing.monthly")}
                          {row.periodEnd ? ` · ${formatLongDate(row.periodEnd, locale)}` : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="billing-total">
                      {t("billing.row.next")}:{" "}
                      <strong>
                        {c.nextRenewalAt ? formatLongDate(c.nextRenewalAt, locale) : "—"}
                      </strong>
                    </div>
                    {c.totalAmount != null && (
                      <div className="billing-total">
                        {t("billing.totalLabel")}: <strong>{c.totalAmount} AZN</strong>
                      </div>
                    )}
                    <div className="plan-per subjedit-per-note">{t("plan.dueTodayNote")}</div>
                    <div className="plan-per subjedit-per-note">{t("sub.siblingNote")}</div>
                    {giveaway ? (
                      <span className="plan-cta subjedit-free-chip" aria-disabled="true">
                        {t("billing.freeChip")}
                      </span>
                    ) : (
                      // Manage stays available in EVERY mode — removals are
                      // legal while payments are off (audit F4/F7).
                      <Link className="plan-cta primary" href={subscribeHref}>
                        {t("subscription.manageSubjects")}
                      </Link>
                    )}
                  </div>
                ) : (
                <div className="plans-grid">
                  {PLANS.map((p, idx) => {
                    const copy = planCopy[idx];
                    const isCurrent = false;
                    const isPopular = p.interval === "month";
                    const featured = isCurrent || (!hasPlan && isPopular);
                    // M8: DB per-subject price; the sibling discount is NOT
                    // fake-mathed here — it applies at checkout (siblingNote).
                    const perSubject = prices[p.interval];
                    const total = c.subjects.length * perSubject;
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
                        {/* Owner item 5 — the price is per ONE subject. */}
                        <div className="plan-per subjedit-per-note">
                          {t("pricing.perSubjectNote")}
                        </div>
                        <p className="plan-desc">{copy.desc}</p>

                        {c.subjects.length > 0 ? (
                          <>
                            <ul className="plan-benefits">
                              {c.subjects.map((subj) => (
                                <li key={subj}>{subj}</li>
                              ))}
                            </ul>
                            <div className="billing-calc">
                              {c.subjects.length} × {perSubject} AZN{" "}
                              {perSuffix[p.interval]}
                            </div>
                            <div className="billing-total">
                              {t("billing.totalLabel")}:{" "}
                              <strong>≈ {total} AZN</strong>{" "}
                              <span>{perSuffix[p.interval]}</span>
                            </div>
                            {/* Sibling discount applies at checkout, server-side. */}
                            <div className="plan-per subjedit-per-note">
                              {t("sub.siblingNote")}
                            </div>
                          </>
                        ) : (
                          <p className="billing-nosub">
                            {t("billing.noSubjects")}
                          </p>
                        )}

                        {giveaway ? (
                          // Giveaway window: no subscribe links — everything
                          // is free; the chip is deliberately non-interactive.
                          <span
                            className="plan-cta subjedit-free-chip"
                            aria-disabled="true"
                          >
                            {t("billing.freeChip")}
                          </span>
                        ) : hasPlan ? (
                          isCurrent ? (
                            // Manage stays available in EVERY mode — removals
                            // are legal while payments are off (audit F4/F7).
                            <Link className="plan-cta primary" href={subscribeHref}>
                              {t("subscription.manageSubjects")}
                            </Link>
                          ) : mode === "off" ? null : (
                            <Link className="plan-cta" href={subscribeHref}>
                              {t("billing.addSubjects")}
                            </Link>
                          )
                        ) : mode === "off" ? null : (
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
                )}
              </div>
            );
          })
        )}
      </section>

      {/* -------------------------------------------------------- BILLING */}
      <section id="billing-billing" className="billing-section">
        <h2 className="billing-section-h">{t("billing.billingTitle")}</h2>
        <div className="billing-panel">
          {billingRows.length > 0 ? (
            <div className="billing-rows">
              {billingRows.map((r) => (
                <div className="billing-row" key={r.label}>
                  <span className="billing-row-label">{r.label}</span>
                  <span className="billing-row-value">{r.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{t("billing.noBillingYet")}</p>
          )}

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
        </div>
      </section>

      {/* ------------------------------------------------------- INVOICES */}
      <section id="billing-invoices" className="billing-section">
        <h2 className="billing-section-h">{t("billing.invoicesTitle")}</h2>
        <p className="muted">{t("billing.invoicesEmpty")}</p>
      </section>
    </section>
  );
}
