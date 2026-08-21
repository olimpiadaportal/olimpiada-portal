"use client";

// THE PLAN BREAKDOWN (migration 109).
//
// The investor's rule: show a breakdown instead of forcing one generic payment
// period. With per-subject cycles there IS no honest single periodic total — a
// "27,00 AZN / ay" line under a basket containing a yearly subject is simply
// false. So this component renders one block per cycle actually in use, and the
// only aggregate it prints is `plan.dueToday`: what checkout charges right now,
// deliberately with no period suffix — and only when the caller has not taken
// that row over itself (`server.dueToday === null`), because two differently
// computed "due today" figures on one card is worse than none.
//
// EVERY AMOUNT PREFERS THE SERVER. The `quote` prop is a browser-side LIST
// price sum; the moment a parent context exists (`server`), its per-cycle
// `groups` and `dueToday` win, so a 2nd/3rd sibling never reads an
// undiscounted subtotal or renewal sentence under a discounted total.
//
// When the basket happens to use ONE cycle (the common case) it collapses back
// to the historical count / per-subject / subtotal / total layout, so nothing
// regresses visually for the majority of parents.
//
// `plan.dueToday` is the ONLY aggregate, and it is an aggregate of TODAY, never
// of a period: proration and the single shared renewal date per child are
// retired (owner, 2026-08-17), so each subject's cycle starts the day it is
// added and runs on its own dates. Do not reintroduce a combined "then X per
// month" line here — with independent cycles there is no such number, and the
// Manage-Subjects editor states each subject's renewal one subject at a time.
//
// The sibling discount comes ONLY from the server quote — the public
// configurator has no parent context and therefore shows none, exactly as
// before. Nothing here computes a discount.
import {
  formatAzn,
  INTERVAL_PER_KEY,
  type PlanInterval,
  type PlanQuote,
} from "@/lib/pricingConfigurator";
import { subjectLabel } from "@/lib/subjectLabel";
import type { Locale } from "@/i18n/config";

const GROUP_TITLE_KEY: Record<PlanInterval, string> = {
  week: "plan.group.weekly",
  month: "plan.group.monthly",
  year: "plan.group.yearly",
};

const RENEWAL_LINE_KEY: Record<PlanInterval, string> = {
  week: "plan.renewalLine.weekly",
  month: "plan.renewalLine.monthly",
  year: "plan.renewalLine.yearly",
};

/** Exactly the per-cycle block the plan RPCs return (already discounted). */
export type PlanSummaryServerGroup = {
  count: number;
  base: number;
  discount: number;
  total: number;
};

export type PlanSummaryServer = {
  discountPercent: number;
  discount: number;
  /**
   * WHICH CHILD earned the discount (migration 127): 2 = second child, 3+ =
   * third and beyond. Optional so the public configurator — which has no parent
   * context and therefore no rank — is unchanged.
   *
   * The owner's call, and worth stating: the sibling discount used to be a
   * silent adjustment. A smaller number appeared and nothing said why. Naming
   * the tier and printing the saving turns it into something the parent can SEE
   * at the moment they choose, which is the point of having it.
   */
  rank?: number;
  /**
   * What the server will actually charge. `null` = the CALLER prints the
   * aggregate rows itself, so this component prints none — two "due today"
   * figures on one card (the caller's discounted server amount and this
   * component's list-price sum) is the contradiction that shipped: adding one
   * 3 AZN subject to a 3-subject plan read "3,00 AZN" and "27,00 AZN" at once.
   */
  dueToday: number | null;
  trialDays: number;
  currency: string;
  /**
   * Per-cycle totals from the server quote. The client `quote` can only ever
   * hold LIST prices — it has no parent context — so without these a 2nd or 3rd
   * sibling saw undiscounted subtotals and undiscounted renewal sentences under
   * a correctly discounted total.
   */
  groups?: Record<string, PlanSummaryServerGroup> | null;
};

export function PlanSummary({
  quote,
  server = null,
  loading = false,
  locale,
  t,
}: {
  quote: PlanQuote;
  /**
   * The AUTHORITATIVE server numbers when a parent context exists. The sibling
   * discount and the trial only ever come from here.
   */
  server?: PlanSummaryServer | null;
  loading?: boolean;
  locale: Locale;
  t: (key: string) => string;
}) {
  if (!quote.hasSelection) {
    return <p className="psum-empty">{t("cfg.emptySelection")}</p>;
  }

  const currency = server?.currency ?? "AZN";
  const dueToday = server ? server.dueToday : quote.dueToday;
  // Aggregates are ours unless the caller explicitly took them over.
  const showAggregates = dueToday !== null;
  /** Per-cycle amount: the server's discounted total wins over the list sum. */
  const groupTotal = (iv: PlanInterval): number =>
    server?.groups?.[iv]?.total ?? quote.groups[iv].subtotal;

  return (
    // Dim rather than blank while a newer quote is in flight: blanking is what
    // produces the "stale total flicker" the spec calls out, and a missing
    // number reads as an error.
    <div className={`psum${loading ? " is-loading" : ""}`} aria-live="polite">
      {quote.usedIntervals.map((iv) => {
        const group = quote.groups[iv];
        return (
          <section className="psum-group" key={iv}>
            <h3 className="psum-group-title">{t(GROUP_TITLE_KEY[iv])}</h3>
            <ul className="psum-group-list">
              {group.lines.map((line) => (
                <li className="psum-row" key={line.id}>
                  <span>{subjectLabel(t, line.code, line.name)}</span>
                  <span className="psum-val mono">
                    {line.price === null ? "—" : formatAzn(line.price, locale)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="psum-row psum-subtotal">
              <span>{t("plan.group.subtotal")}</span>
              <span className="psum-val mono">
                {formatAzn(groupTotal(iv), locale)}
                <span className="psum-per"> {t(INTERVAL_PER_KEY[iv])}</span>
              </span>
            </div>
          </section>
        );
      })}

      {server && server.discountPercent > 0 && (
        <>
          <div className="psum-row psum-discount">
            {/* The TIER, named. "Sibling discount" alone could not say why this
                family gets 10% and another gets 15%. */}
            <span>
              {t(
                (server.rank ?? 2) >= 3
                  ? "sub.discount.rank3"
                  : "sub.discount.rank2",
              )}
            </span>
            <span className="psum-val mono">−{server.discountPercent}%</span>
          </div>
          <div className="psum-row psum-discount">
            <span>{t("sub.discount.saved")}</span>
            <span className="psum-val mono">−{formatAzn(server.discount, locale)}</span>
          </div>
        </>
      )}
      {/* No discount YET is worth a sentence too: it is the only place a parent
          with one child learns that a second one is cheaper. Shown only where a
          parent context exists, never on the public configurator. */}
      {server && server.discountPercent === 0 && (
        <p className="psum-note">{t("sub.discount.hint")}</p>
      )}

      {showAggregates && (
        <div className="psum-row psum-due">
          <span>{t("plan.dueToday")}</span>
          <span className="psum-val mono">
            {/* Nothing in the basket is sold on its chosen cycle: 0,00 AZN would
                read as "free", which is false — show the placeholder instead. */}
            {quote.allUnpriced ? "—" : `${formatAzn(dueToday, locale)}`}
          </span>
        </div>
      )}

      {showAggregates && quote.mixed && (
        <>
          <p className="psum-note">{t("plan.dueTodayNote")}</p>
          <div className="psum-renewals">
            <span className="psum-group-title">{t("plan.renewals")}</span>
            {quote.usedIntervals.map((iv) => (
              <p className="psum-note" key={iv}>
                {t(RENEWAL_LINE_KEY[iv])
                  .replace("{total}", formatAzn(groupTotal(iv), locale))
                  // formatAzn already carries the unit, so the placeholder that
                  // used to hold it is blanked rather than duplicated.
                  .replace(" {currency}", "")
                  .replace("{currency}", currency)}
              </p>
            ))}
          </div>
        </>
      )}

      {server && server.trialDays > 0 && (
        <div className="psum-row psum-trial">
          <span>{t("sub.trial")}</span>
          <span className="psum-val">
            {server.trialDays} {t("sub.days")}
          </span>
        </div>
      )}

      {quote.hasUnpriced && (
        <p className="psum-warn">
          {quote.allUnpriced
            ? t("cfg.warnAllUnpriced")
            : t("cfg.warnSomeUnpriced").replace(
                "{n}",
                String(quote.lines.length - quote.pricedCount),
              )}
        </p>
      )}
    </div>
  );
}
