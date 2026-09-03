// WHEN AN APPLE PURCHASE RUNS OUT — computed by us, because Apple does not say.
//
// THE WHOLE REASON THIS FILE EXISTS. The owner chose NON-RENEWING subscriptions
// (2026-08-31), because Apple permits one active subscription per subscription
// group per Apple ID and this product is PER CHILD: a parent with three children
// studying Maths needs three concurrent grants, which an auto-renewable
// subscription cannot express. The consequence is easy to miss and expensive:
//
//   * `expiresDate` in a signed transaction is documented as "the UNIX time an
//     AUTO-RENEWABLE subscription expires or renews". For a non-renewing
//     product it is simply ABSENT. Reading it and finding `undefined` must never
//     be turned into "no expiry" — that is a free lifetime grant.
//   * There are no renewal, grace-period or billing-retry events to react to. A
//     non-renewing subscription is a one-shot transaction: purchase date in,
//     end date computed, done.
//
// So the end date is `purchaseDate + one interval`, and this module is the only
// place that arithmetic happens.
//
// CALENDAR ARITHMETIC MATCHES POSTGRES. The web rail's periods are produced in
// SQL by `+ interval '1 month'` / `'1 year'`, which CLAMPS to the end of the
// target month (31 Jan + 1 month = 28 Feb) rather than overflowing into March.
// A month bought on iOS and a month bought on the web must end on the same day,
// so the clamping below is deliberate and is what the tests pin.
//
// Pure: no env var, no clock, no I/O. The caller passes the purchase instant.
import type { PlanInterval } from "@/lib/pricingConfigurator";

/**
 * Calendar arithmetic runs in UTC.
 *
 * `ends_at` is stored as `timestamptz`, i.e. an absolute instant, so there is no
 * storage ambiguity. The choice only decides WHICH calendar day a "+1 month"
 * lands on for a purchase made within a few hours of midnight Baku. UTC is
 * picked because it is the one calendar that cannot drift with a server locale
 * or a Postgres `TimeZone` setting.
 */
export const APPLE_GRANT_CALENDAR_TIME_ZONE = "UTC";

/** Days in a "week" plan. Fixed length, so no calendar clamping applies. */
const WEEK_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/**
 * Sanity window for a purchase instant. A transaction outside it is not a date
 * we are willing to do arithmetic on: below the floor it is a unit-seconds value
 * mistaken for milliseconds, above the ceiling it is garbage or a clock fault.
 * Either way, silently producing an entitlement that ends in the year 55000 is
 * worse than refusing.
 */
export const PURCHASE_DATE_MIN_MS = Date.UTC(2020, 0, 1);
export const PURCHASE_DATE_MAX_MS = Date.UTC(2100, 0, 1);

export function isPlausiblePurchaseDateMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= PURCHASE_DATE_MIN_MS &&
    value < PURCHASE_DATE_MAX_MS
  );
}

/**
 * Add whole calendar months in UTC, clamping to the end of the target month.
 *
 * This is `date + interval 'n months'` as Postgres performs it. `Date.UTC` is
 * used rather than `setUTCMonth` because the latter OVERFLOWS (31 Jan +1 month
 * becomes 2 or 3 March depending on the year) — the exact bug this function
 * exists to not have.
 */
export function addCalendarMonthsUtc(fromMs: number, months: number): number {
  const d = new Date(fromMs);
  const targetMonthIndex = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(targetMonthIndex / 12);
  const month = targetMonthIndex - year * 12;
  // Day 0 of the following month is the last day of the target month.
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDayOfTargetMonth);
  return Date.UTC(
    year,
    month,
    day,
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

/**
 * The end instant of a non-renewing purchase of `interval`, bought at
 * `purchaseDateMs`.
 *
 * Returns null — never a guess — when the purchase date is not a date we trust.
 * The caller turns that into a rejection; nothing downstream may fall back to
 * "no expiry".
 */
export function computeEndsAt(purchaseDateMs: number, interval: PlanInterval): Date | null {
  if (!isPlausiblePurchaseDateMs(purchaseDateMs)) return null;
  switch (interval) {
    case "week":
      return new Date(purchaseDateMs + WEEK_DAYS * MS_PER_DAY);
    case "month":
      return new Date(addCalendarMonthsUtc(purchaseDateMs, 1));
    case "year":
      return new Date(addCalendarMonthsUtc(purchaseDateMs, 12));
    default:
      // `interval` is exhausted above; this catches a value that arrived from
      // a database row rather than from the type system.
      return null;
  }
}
