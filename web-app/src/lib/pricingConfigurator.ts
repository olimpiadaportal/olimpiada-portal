// PUBLIC PRICING CONFIGURATOR — pure selection + price arithmetic.
//
// WHY THIS MODULE EXISTS
// ----------------------
// The public /services page lets a signed-out visitor build a subject basket
// and see what it would cost. That is *display* logic only, so it must never
// live in a visual component (project rule: no business logic in components)
// and it must be unit-testable without React, Next or Supabase. Everything
// here is pure: no imports beyond the i18n `Locale` type, no I/O, no globals,
// no `Date`, no `Intl` (see the formatting note below).
//
// INFORMATIONAL ONLY — READ BEFORE REUSING
// ----------------------------------------
// Nothing in this module can create, modify or authorize a subscription. The
// numbers it produces are a *preview* computed in the browser from the same
// `subjects_pricing` rows the checkout RPCs price from (loaded server-side by
// `lib/pricing.getPublicSubjectPricing`). The authoritative amount is ALWAYS
// the one the server returns at purchase time:
//   - starting a plan   → `create_child_subscription` (quote: `quote_child_subscription`)
//   - changing subjects → `apply_subject_change`      (quote: `quote_subject_change`)
// Both re-price from the database and both apply the sibling discount. A
// client-submitted total is never trusted anywhere in this codebase, and this
// module must not become a way to smuggle one in — the hand-off query string
// built by `buildSelectionQuery` carries subject IDs and an interval, never a
// price.
//
// NO SIBLING DISCOUNT HERE — DELIBERATE
// -------------------------------------
// The sibling discount (2nd child 10%, 3rd+ 15%) depends on how many children
// a specific parent already has. A signed-out visitor has no children, so no
// honest discount figure exists for them and inventing one would be a false
// price. The public page therefore shows list price only, and the existing
// static sibling note stays as *explanatory* copy. Differences between the
// week/month/year price are simply different list prices per interval — they
// are never labeled a "discount".
//
// NO Intl HERE — DELIBERATE
// -------------------------
// `lib/formatDate.ts` documents the "2026 M08 22" bug: a bare "az" tag can
// resolve to the CLDR root locale on runtimes without Azerbaijani data.
// `Intl.NumberFormat` is exposed to the same class of runtime-data risk, so
// money is formatted by hand from a fixed 2-decimal string. Deterministic
// output, identical on the server and in every browser.
import type { Locale } from "@/i18n/config";

/* -------------------------------------------------------------- intervals -- */

/**
 * The billing intervals the platform sells, in display order.
 * Mirrors the `public.plan_interval` enum and the values the subscription
 * RPCs accept — never widen this list without a matching DB change.
 */
export const PLAN_INTERVALS = ["week", "month", "year"] as const;

/** One billing interval: `"week" | "month" | "year"`. */
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

/** Interval preselected when none is supplied (the plan most families pick). */
export const DEFAULT_PLAN_INTERVAL: PlanInterval = "month";

/**
 * Hard cap on how many subjects one selection may carry. Matches the cap the
 * server actions enforce (`subscriptionCore` slices client-supplied subject
 * arrays to 20), so a hand-crafted query string can never produce a basket the
 * purchase flow would reject.
 */
export const MAX_CONFIGURATOR_SUBJECTS = 20;

/** i18n key for each interval's label (`pricing.weekly` / `.monthly` / `.yearly`). */
export const INTERVAL_LABEL_KEY: Record<PlanInterval, string> = {
  week: "pricing.weekly",
  month: "pricing.monthly",
  year: "pricing.yearly",
};

/** i18n key for each interval's "per <period>" suffix. */
export const INTERVAL_PER_KEY: Record<PlanInterval, string> = {
  week: "billing.perWeek",
  month: "billing.perMonth",
  year: "billing.perYear",
};

/** Narrow an unknown value to a `PlanInterval`. Used on every arriving param. */
export function isPlanInterval(value: unknown): value is PlanInterval {
  return (
    typeof value === "string" &&
    (PLAN_INTERVALS as readonly string[]).includes(value)
  );
}

/* ---------------------------------------------------------------- catalog -- */

/**
 * One purchasable subject as the public page sees it: identity plus its list
 * price per interval.
 *
 * `prices` is PARTIAL on purpose — a subject can have an active
 * `subjects_pricing` row for some intervals and not others, and the UI has to
 * survive that rather than render `NaN`.
 *
 * The catalog only ever contains subjects with ACTIVE pricing, so "not in the
 * catalog" already means "unknown or archived" for every validation below.
 */
export type ConfiguratorSubject = {
  /** `subjects.id` (UUID) — the value submitted to the purchase flow. */
  id: string;
  /** Canonical machine code (`"math"`), drives the locale-aware label. */
  code: string | null;
  /** Raw Azerbaijani DB name, the label fallback for unknown codes. */
  name: string;
  /** List price per interval, in AZN. Missing interval = not sold that way. */
  prices: Partial<Record<PlanInterval, number>>;
};

/** Index a catalog by id for O(1) membership tests. */
function catalogIndex(
  catalog: readonly ConfiguratorSubject[],
): Map<string, ConfiguratorSubject> {
  const byId = new Map<string, ConfiguratorSubject>();
  for (const subject of catalog) {
    // Compare case-insensitively: a UUID pasted from a URL may be upper-cased,
    // and Postgres treats the two as the same value.
    if (subject && typeof subject.id === "string" && subject.id) {
      byId.set(subject.id.toLowerCase(), subject);
    }
  }
  return byId;
}

/**
 * List price of one subject for one interval, or `null` when the subject is
 * not sold on that interval (or the stored value is not a usable number).
 */
export function subjectPrice(
  subject: ConfiguratorSubject | undefined | null,
  interval: PlanInterval,
): number | null {
  const raw = subject?.prices?.[interval];
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
}

/* -------------------------------------------------------------- selection -- */

/**
 * Add one subject to the selection.
 *
 * Guarantees, in order:
 *  1. unknown / archived ids (not in the catalog) are ignored,
 *  2. an id already selected is ignored — duplicate selection is impossible,
 *  3. the selection never grows past {@link MAX_CONFIGURATOR_SUBJECTS}.
 *
 * Returns a NEW array (never mutates the input) so React state updates stay
 * referentially honest.
 */
export function addSubject(
  selected: readonly string[],
  id: string,
  catalog: readonly ConfiguratorSubject[],
): string[] {
  const byId = catalogIndex(catalog);
  const known = byId.get((id ?? "").toLowerCase());
  if (!known) return [...selected];
  if (selected.some((s) => s.toLowerCase() === known.id.toLowerCase())) {
    return [...selected];
  }
  if (selected.length >= MAX_CONFIGURATOR_SUBJECTS) return [...selected];
  return [...selected, known.id];
}

/**
 * Remove one subject from the selection. Removing something that is not
 * selected is a no-op. Returns a NEW array.
 */
export function removeSubject(selected: readonly string[], id: string): string[] {
  const target = (id ?? "").toLowerCase();
  return selected.filter((s) => s.toLowerCase() !== target);
}

/**
 * Add the subject when absent, remove it when present. Convenience wrapper
 * over {@link addSubject} / {@link removeSubject} with the same guarantees.
 */
export function toggleSubject(
  selected: readonly string[],
  id: string,
  catalog: readonly ConfiguratorSubject[],
): string[] {
  const target = (id ?? "").toLowerCase();
  return selected.some((s) => s.toLowerCase() === target)
    ? removeSubject(selected, id)
    : addSubject(selected, id, catalog);
}

/**
 * The catalog entries NOT yet selected, in catalog order — the left-hand
 * "available subjects" column.
 */
export function availableSubjects(
  catalog: readonly ConfiguratorSubject[],
  selected: readonly string[],
): ConfiguratorSubject[] {
  const chosen = new Set(selected.map((s) => s.toLowerCase()));
  return catalog.filter((s) => !chosen.has(s.id.toLowerCase()));
}

/**
 * The catalog entries that ARE selected, in SELECTION order — the right-hand
 * "your selection" column. Ids with no catalog entry are dropped.
 */
export function selectedSubjects(
  catalog: readonly ConfiguratorSubject[],
  selected: readonly string[],
): ConfiguratorSubject[] {
  const byId = catalogIndex(catalog);
  const out: ConfiguratorSubject[] = [];
  for (const id of selected) {
    const subject = byId.get((id ?? "").toLowerCase());
    if (subject && !out.includes(subject)) out.push(subject);
  }
  return out;
}

/* ------------------------------------------------------------------ quote -- */

/** One priced row of the breakdown. */
export type ConfiguratorLine = {
  id: string;
  code: string | null;
  name: string;
  /** List price for the chosen interval, or `null` when not sold that way. */
  price: number | null;
};

/**
 * The informational price preview. See the module header: this is never an
 * authorization to charge, and it deliberately carries no discount.
 */
export type ConfiguratorQuote = {
  interval: PlanInterval;
  /** How many selected ids resolved to a real catalog entry. */
  count: number;
  /** Per-subject breakdown rows, in selection order. */
  lines: ConfiguratorLine[];
  /**
   * The single per-subject price when every selected subject costs the same
   * on this interval (the normal case — one price per interval platform-wide),
   * otherwise `null` so the UI shows the per-subject rows instead of a
   * misleading single figure.
   */
  perSubject: number | null;
  /** Sum of the priced lines. */
  subtotal: number;
  /**
   * What the visitor would pay. Equal to `subtotal` on the public page: no
   * parent-specific discount can be known before sign-in, so there is nothing
   * honest to subtract here.
   */
  total: number;
  currency: "AZN";
  /** `false` when nothing is selected — the caller renders the empty state. */
  hasSelection: boolean;
  /** `true` when a selected subject has no price for this interval. */
  hasUnpriced: boolean;
  /**
   * How many selected subjects actually HAVE a price on this interval. This is
   * the denominator `perSubject` belongs to — `count` includes unpriced rows,
   * so showing "2 subjects · 3,00 AZN each · total 3,00 AZN" was arithmetic
   * that visibly did not add up (Round 49 review finding).
   */
  pricedCount: number;
  /**
   * `true` when the basket is non-empty but NOTHING in it is sold on this
   * interval. The total would then render 0,00 AZN — i.e. "free" — which is
   * false, and the hand-off must be blocked because the server quote rejects
   * such a basket outright.
   */
  allUnpriced: boolean;
};

/** Round to 2 decimals, killing float artifacts (0.1 + 0.2 style). */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Build the live preview for a selection + interval.
 *
 * Pure: same inputs → same output, so a re-render, an interval change and a
 * server render all agree. Unknown ids are ignored rather than throwing —
 * a stale shared link must degrade, never crash the page.
 */
export function computeQuote(
  catalog: readonly ConfiguratorSubject[],
  selected: readonly string[],
  interval: PlanInterval,
): ConfiguratorQuote {
  const iv: PlanInterval = isPlanInterval(interval) ? interval : DEFAULT_PLAN_INTERVAL;
  const subjects = selectedSubjects(catalog, selected);

  const lines: ConfiguratorLine[] = subjects.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    price: subjectPrice(s, iv),
  }));

  let subtotal = 0;
  let hasUnpriced = false;
  const distinct = new Set<number>();
  for (const line of lines) {
    if (line.price === null) {
      hasUnpriced = true;
      continue;
    }
    subtotal += line.price;
    distinct.add(line.price);
  }
  subtotal = round2(subtotal);

  const pricedCount = lines.filter((l) => l.price !== null).length;

  return {
    interval: iv,
    count: lines.length,
    lines,
    // Only meaningful when every priced line agrees AND nothing is unpriced —
    // otherwise the single figure contradicts `count` on screen, so the UI
    // falls back to the per-subject rows.
    perSubject: !hasUnpriced && distinct.size === 1 ? [...distinct][0]! : null,
    subtotal,
    // No public discount exists (see the module header) — total IS the subtotal.
    total: subtotal,
    currency: "AZN",
    hasSelection: lines.length > 0,
    hasUnpriced,
    pricedCount,
    allUnpriced: lines.length > 0 && pricedCount === 0,
  };
}

/* --------------------------------------------------------------- currency -- */

/** Decimal separator per locale: az/ru use a comma, en uses a point. */
const DECIMAL_SEPARATOR: Record<Locale, string> = {
  az: ",",
  en: ".",
  ru: ",",
};

/**
 * Format an AZN amount for display: `27,00 AZN` (az, the default), `27.00 AZN`
 * (en), `27,00 AZN` (ru).
 *
 * Always exactly two decimals — these are exact list prices read from
 * `subjects_pricing`, never approximations, so no "≈" is used anywhere near
 * this output. Non-finite input renders the em-dash placeholder the rest of
 * the app uses for "no value".
 */
export function formatAzn(amount: number | null | undefined, locale: Locale = "az"): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  const separator = DECIMAL_SEPARATOR[locale] ?? DECIMAL_SEPARATOR.az;
  return `${round2(amount).toFixed(2).replace(".", separator)} AZN`;
}

/* ------------------------------------------------------- hand-off transfer -- */

/** Longest query value accepted before the whole selection is discarded. */
const MAX_PARAM_LENGTH = 1000;

/** A validated hand-off: what the destination page may actually preselect. */
export type ParsedSelection = {
  subjectIds: string[];
  interval: PlanInterval;
};

/** Take the first value when Next.js hands us a repeated query param. */
function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a `?subjects=<uuid,uuid>&interval=<week|month|year>` hand-off
 * against the live catalog.
 *
 * The query string is USER INPUT and is treated as such — nothing is trusted:
 *  - an over-long value discards the whole selection,
 *  - non-UUID-shaped entries are dropped,
 *  - duplicates collapse to one,
 *  - ids absent from the catalog (unknown, archived, or no longer priced) are
 *    dropped SILENTLY — a stale shared link preselects less, never errors,
 *  - the result is capped at {@link MAX_CONFIGURATOR_SUBJECTS},
 *  - an unrecognized interval falls back to {@link DEFAULT_PLAN_INTERVAL}.
 *
 * The returned ids are the CANONICAL catalog ids (not the caller's casing), so
 * downstream comparisons and form posts use the database's own values. This is
 * a UX preselection only: the server re-validates every id and re-prices at
 * purchase time regardless of what arrives here.
 */
export function parseSelectionParams(
  raw: {
    subjects?: string | string[] | undefined;
    interval?: string | string[] | undefined;
  },
  catalog: readonly ConfiguratorSubject[],
): ParsedSelection {
  const rawInterval = firstParam(raw?.interval);
  const interval: PlanInterval = isPlanInterval(rawInterval)
    ? rawInterval
    : DEFAULT_PLAN_INTERVAL;

  const rawSubjects = firstParam(raw?.subjects);
  if (!rawSubjects || rawSubjects.length > MAX_PARAM_LENGTH) {
    return { subjectIds: [], interval };
  }

  const byId = catalogIndex(catalog);
  const seen = new Set<string>();
  const subjectIds: string[] = [];
  for (const part of rawSubjects.split(",")) {
    const candidate = part.trim();
    if (!UUID_RE.test(candidate)) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    const known = byId.get(key);
    if (!known) continue; // unknown or archived → dropped silently
    seen.add(key);
    subjectIds.push(known.id);
    if (subjectIds.length >= MAX_CONFIGURATOR_SUBJECTS) break;
  }

  return { subjectIds, interval };
}

/**
 * Build the hand-off query string for the "continue" CTA:
 * `?subjects=<id,id>&interval=<iv>`, or `""` when nothing is selected.
 *
 * Only ids and the interval travel — never a price, never a discount, never a
 * total. The destination re-validates with {@link parseSelectionParams}.
 */
export function buildSelectionQuery(
  selected: readonly string[],
  interval: PlanInterval,
): string {
  const ids = selected
    .filter((id) => typeof id === "string" && UUID_RE.test(id))
    .slice(0, MAX_CONFIGURATOR_SUBJECTS);
  if (ids.length === 0) return "";
  const iv: PlanInterval = isPlanInterval(interval) ? interval : DEFAULT_PLAN_INTERVAL;
  return `?subjects=${encodeURIComponent(ids.join(","))}&interval=${encodeURIComponent(iv)}`;
}

/**
 * The only destinations the hand-off may target. A literal union rather than
 * `string`: the compiler now enforces the same-origin-relative-path rule that
 * used to be a comment, so no future caller can turn this into an open
 * redirect by passing an absolute URL (Round 49 review finding).
 */
export type SelectionBasePath = "/register" | "/children/new";

/**
 * Full hand-off href: a same-origin RELATIVE path plus the selection query.
 * `basePath` is a server-chosen internal route, never a value read from the
 * URL — and the type above makes that structural rather than conventional.
 */
export function buildSelectionHref(
  basePath: SelectionBasePath,
  selected: readonly string[],
  interval: PlanInterval,
): string {
  return `${basePath}${buildSelectionQuery(selected, interval)}`;
}
