"use client";

// START-A-PLAN form for a child with NO live subscription.
//
// Migration 109: there is no global billing-period control any more. The parent
// picks subjects, gives EACH of them its own cycle on a <SubjectPlanCard>, and
// <PlanSummary> shows the per-cycle breakdown fed by the debounced AUTHORITATIVE
// server quote (the sibling discount is only ever computed server-side).
//
// The form posts one repeated `plan` field per selection ("<uuid>:<interval>");
// the old `interval` hidden input is gone, because a single "/ ay" suffix under
// a mixed-cycle basket is exactly the misleading label the requirement forbids.
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  subscribeChild,
  quoteSubscription,
  type SubscribeState,
  type QuoteResult,
} from "@/lib/auth/subscriptionService";
import { CheckoutRedirect } from "@/components/CheckoutRedirect";
import { PlanSummary } from "@/components/PlanSummary";
import { SubjectPlanCard } from "@/components/SubjectPlanCard";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  addPlanSubject,
  availableSubjects,
  computePlanQuote,
  formatAzn,
  INTERVAL_LABEL_KEY,
  PLAN_INTERVALS,
  removePlanSubject,
  setPlanInterval,
  subjectPrice,
  type ConfiguratorSubject,
  type PlanInterval,
  type PlanItem,
} from "@/lib/pricingConfigurator";

type Subj = { id: string; code: string | null; name: string; prices: Record<string, number> };

export function SubscribeForm({
  studentId,
  subjects,
  outstandingCheckout,
  dict,
}: {
  studentId: string;
  subjects: Subj[];
  /**
   * An unfinished payment for this child, resolved server-side (opened and
   * never completed, or declined by the gateway). Since migration 125 it
   * granted nothing, so this is an offer to finish rather than a debt — and
   * because a first plan has no subscription until its payment lands, this is
   * the ONLY way the parent can find that checkout again after closing the tab.
   */
  outstandingCheckout?: { order: string; amount: number } | null;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  // Locale-aware subject labels (subj.<code>) via the app-wide provider dict.
  const t = useT();
  const locale = useLocale();
  const [state, action, pending] = useActionState<SubscribeState, FormData>(
    subscribeChild,
    null,
  );
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [quote, setQuote] = useState<QuoteResult | null>(null);

  const catalog = useMemo<ConfiguratorSubject[]>(
    () => subjects.map((s) => ({ ...s, prices: s.prices as ConfiguratorSubject["prices"] })),
    [subjects],
  );
  const byId = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);
  const available = useMemo(
    () => availableSubjects(catalog, plan.map((p) => p.subjectId)),
    [catalog, plan],
  );
  // Cosmetic, instant client preview (the server reprices authoritatively below).
  const localQuote = useMemo(() => computePlanQuote(catalog, plan), [catalog, plan]);
  // Serialized basket: the quote effect keys on subject AND cycle, so changing
  // one card's cycle refetches while an unrelated re-render does not.
  const planKey = useMemo(
    () => plan.map((p) => `${p.subjectId}:${p.interval}`).join(","),
    [plan],
  );

  // Live, AUTHORITATIVE preview. The `cancelled` guard means a slow response for
  // an older basket can never overwrite a newer one.
  useEffect(() => {
    if (!planKey) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const items = planKey.split(",").map((raw) => {
      const [subjectId, interval] = raw.split(":");
      return { subjectId, interval };
    });
    quoteSubscription({ studentId, items }).then((q) => {
      if (!cancelled) setQuote(q);
    });
    return () => {
      cancelled = true;
    };
  }, [planKey, studentId]);

  // PAYMENT FIRST. A payable plan is not applied until the bank confirms it, so
  // the action comes back with a SIGNED checkout and nothing else — no plan, no
  // 8-digit login ID, because `create_child_plan` has not run. One card, one
  // button, and the parent leaves for the bank.
  if (state?.ok && state.checkout) {
    const c = state.checkout;
    return (
      <div className="card">
        <p>
          <strong>{t("sub.payFirst")}</strong>
        </p>
        <p className="muted">{t("sub.payFirstNote")}</p>
        <CheckoutRedirect
          order={c.order}
          amount={c.amount}
          signed={{ action: c.action, fields: c.fields, amount: c.amount }}
        />
        {/* A ghost link, so the one primary button on the screen is the one the
            parent must act on. */}
        <Link className="btn-ghost" href="/dashboard">
          {tt("parent.dash.title")}
        </Link>
      </div>
    );
  }

  // FREE (a trial): the plan exists already, because nothing had to be paid for
  // it — so this is the historical success screen, 8-digit ID and all.
  if (state?.ok && state.result) {
    const r = state.result;
    return (
      <div className="card">
        <p>
          <strong>{tt("sub.done")}</strong>
        </p>
        {r.childUniqueId && (
          <div style={{ margin: "12px 0" }}>
            <p className="muted">{tt("parent.child.idLabel")}:</p>
            <p style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "3px" }}>
              <code>{r.childUniqueId}</code>
            </p>
            <p className="muted">{tt("parent.child.idNote")}</p>
          </div>
        )}
        <ul className="clean">
          <li>
            {tt("sub.base")}: {r.base} {r.currency}
          </li>
        </ul>
        {/* Every OTHER figure — sibling discount, per-cycle subtotals, what was
            charged, the trial — comes from the server result. Rendering them
            here as well left a list-price "due today" from the browser sitting
            under the amount that was actually charged. */}
        <PlanSummary
          quote={localQuote}
          server={{
            discountPercent: r.discount_percent,
            discount: r.discount,
            // A plan reaches this screen only when nothing was due, so the
            // honest "due today" is zero. Printing `r.total` here stated a
            // charge that did not happen.
            dueToday: 0,
            trialDays: r.trial_days,
            currency: r.currency,
            groups: r.groups ?? null,
          }}
          locale={locale}
          t={tt}
        />
        <Link className="btn" href="/dashboard">
          {tt("parent.dash.title")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="form" style={{ maxWidth: 560 }}>
      <input type="hidden" name="student_id" value={studentId} />
      {/* Picked up from an earlier visit. Shown ABOVE the picker because
          finishing it is the shorter path to the same plan — and starting over
          is still available directly below. */}
      {outstandingCheckout && (
        <CheckoutRedirect
          order={outstandingCheckout.order}
          amount={outstandingCheckout.amount}
        />
      )}
      {plan.map((p) => (
        <input
          key={p.subjectId}
          type="hidden"
          name="plan"
          value={`${p.subjectId}:${p.interval}`}
        />
      ))}

      {/* 1) Pick the subjects. */}
      <div>
        <span className="field-label">{tt("sub.subjects")}</span>
        {catalog.length === 0 ? (
          <p className="muted">{tt("sub.noSubjectsAvailable")}</p>
        ) : available.length === 0 ? (
          <p className="muted">{tt("cfg.allAdded")}</p>
        ) : (
          <ul className="pcfg-list">
            {available.map((s) => {
              // No global cycle exists, so the list shows the cheapest one.
              let from: { price: number; iv: PlanInterval } | null = null;
              for (const iv of PLAN_INTERVALS) {
                const p = subjectPrice(s, iv);
                if (p === null) continue;
                if (!from || p < from.price) from = { price: p, iv };
              }
              return (
                <li key={s.id} className="pcfg-row">
                  <span className="pcfg-row-main">
                    <span className="pcfg-row-name">{subjectLabel(t, s.code, s.name)}</span>
                    <span className="pcfg-row-price">
                      {from === null
                        ? tt("cfg.unpriced")
                        : tt("plan.fromPrice")
                            .replace("{price}", formatAzn(from.price, locale))
                            .replace("{cycle}", tt(INTERVAL_LABEL_KEY[from.iv]))}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="pcfg-add"
                    onClick={() => setPlan((prev) => addPlanSubject(prev, s.id, catalog))}
                    aria-label={tt("cfg.addAria").replace(
                      "{subject}",
                      subjectLabel(t, s.code, s.name),
                    )}
                  >
                    <span aria-hidden="true" className="pcfg-add-glyph">
                      +
                    </span>
                    {tt("cfg.add")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 2) One card per selection: name, its own cycle, its price, remove. */}
      {plan.length > 0 && (
        <div className="splan-list" style={{ marginTop: 14 }}>
          <p className="hint">{tt("plan.perSubjectHint")}</p>
          {plan.map((item) => {
            const s = byId.get(item.subjectId);
            if (!s) return null;
            return (
              <SubjectPlanCard
                key={s.id}
                id={s.id}
                code={s.code}
                name={s.name}
                interval={item.interval}
                prices={s.prices}
                onIntervalChange={(id, iv) =>
                  setPlan((prev) => setPlanInterval(prev, id, iv))
                }
                onRemove={(id) => setPlan((prev) => removePlanSubject(prev, id))}
                disabled={pending}
                locale={locale}
                t={tt}
              />
            );
          })}
        </div>
      )}

      {/* 3) Authoritative server preview: base / sibling discount / due today. */}
      <div className="card" style={{ marginTop: 14 }}>
        {plan.length === 0 ? (
          <p className="muted">{tt("sub.previewHint")}</p>
        ) : quote && quote.ok ? (
          <>
            <div className="quote-row">
              <span className="q-label">{tt("sub.base")}</span>
              <span>
                {quote.base} {quote.currency}
              </span>
            </div>
            <PlanSummary
              quote={localQuote}
              server={{
                discountPercent: quote.discount_percent,
                discount: quote.discount,
                // Migration 127: the TIER, so the saving is named rather than
                // silently applied.
                rank: quote.rank,
                // `due_now`, NOT `total` (migration 125, audit invariant H7).
                // These are different numbers whenever a trial applies, and the
                // screen used to print the total beside a trial row — telling a
                // first-time family they owe today what they do not, and a
                // returning one they get a trial they will not. The checkout is
                // opened for exactly this figure.
                dueToday: quote.dueNow,
                trialDays: quote.trial_days,
                currency: quote.currency,
                // Per-cycle subtotals at the SIBLING rate; the local quote can
                // only ever hold list prices.
                groups: quote.groups ?? null,
              }}
              locale={locale}
              t={tt}
            />
            {/* Says WHY "due today" is zero, so a 0,00 does not read as free
                forever. Rendered from the same server quote as the figure. */}
            {quote.trial_days > 0 && quote.dueNow === 0 && (
              <p className="muted">
                {t("sub.trialNoChargeToday").replace(
                  "{days}",
                  String(quote.trial_days),
                )}
              </p>
            )}
          </>
        ) : (
          <p className="muted">{tt("sub.calculating")}</p>
        )}
      </div>

      {state?.error && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending || plan.length === 0}>
        {pending ? tt("sub.submitting") : tt("sub.submit")}
      </button>
    </form>
  );
}
