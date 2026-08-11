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
// PER-SUBJECT PLANS (migration 109)
// ---------------------------------
// Since each subject carries its OWN billing cycle, the authoritative pair is
//   starting a plan   → `create_child_plan` (quote: `quote_child_plan`)
//   changing a plan   → `apply_plan_change` (quote: `quote_plan_change`)
// and the single-interval RPCs above are wrappers over them. The `PlanItem`
// half of this module mirrors that shape. The query string now carries a cycle
// per subject (`?plan=<uuid>:week,<uuid>:year`) — still ids and cycles only,
// still never a price, and still re-validated against the live catalog on
// arrival.
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

/* ------------------------------------------------------------ per-subject -- */

/** One selected subject together with the cycle chosen FOR IT. */
export type PlanItem = { subjectId: string; interval: PlanInterval };

/** A whole basket: subjects in selection order, each on its own cycle. */
export type PlanSelection = readonly PlanItem[];

/** The cycles a subject is actually sold on, in display order. */
function soldIntervals(subject: ConfiguratorSubject): PlanInterval[] {
  return PLAN_INTERVALS.filter((iv) => subjectPrice(subject, iv) !== null);
}

/**
 * Pick the cycle to use for a subject when the requested one is not sold:
 * prefer the platform default, else the first cycle the subject IS sold on,
 * else keep the request so the card can render its "not sold" state instead of
 * silently switching to something the visitor did not choose.
 */
function resolveInterval(
  subject: ConfiguratorSubject,
  requested: PlanInterval,
): PlanInterval {
  if (subjectPrice(subject, requested) !== null) return requested;
  if (subjectPrice(subject, DEFAULT_PLAN_INTERVAL) !== null) return DEFAULT_PLAN_INTERVAL;
  return soldIntervals(subject)[0] ?? requested;
}

/**
 * Clean an arbitrary plan against the live catalog, with the same guarantees
 * {@link addSubject} gives a flat selection: unknown / archived ids dropped,
 * one entry per subject (LAST occurrence wins, so an appended cycle change
 * replaces the earlier one), capped at {@link MAX_CONFIGURATOR_SUBJECTS}, and
 * every interval either sold or resolved by {@link resolveInterval}.
 */
export function normalizePlan(
  plan: PlanSelection,
  catalog: readonly ConfiguratorSubject[],
): PlanItem[] {
  const byId = catalogIndex(catalog);
  const bySubject = new Map<string, PlanItem>();
  for (const item of plan ?? []) {
    const known = byId.get((item?.subjectId ?? "").toLowerCase());
    if (!known) continue;
    const requested = isPlanInterval(item.interval)
      ? item.interval
      : DEFAULT_PLAN_INTERVAL;
    bySubject.set(known.id, {
      subjectId: known.id,
      interval: resolveInterval(known, requested),
    });
  }
  return [...bySubject.values()].slice(0, MAX_CONFIGURATOR_SUBJECTS);
}

/**
 * Add one subject on a cycle. Unknown ids and already-selected subjects are
 * ignored (no duplicates, ever) and the cap is respected. Returns a NEW array.
 */
export function addPlanSubject(
  plan: PlanSelection,
  id: string,
  catalog: readonly ConfiguratorSubject[],
  interval?: PlanInterval,
): PlanItem[] {
  const known = catalogIndex(catalog).get((id ?? "").toLowerCase());
  if (!known) return [...plan];
  const target = known.id.toLowerCase();
  if (plan.some((p) => p.subjectId.toLowerCase() === target)) return [...plan];
  if (plan.length >= MAX_CONFIGURATOR_SUBJECTS) return [...plan];
  return [
    ...plan,
    {
      subjectId: known.id,
      interval: resolveInterval(
        known,
        isPlanInterval(interval) ? interval : DEFAULT_PLAN_INTERVAL,
      ),
    },
  ];
}

/** Remove one subject. Removing an absent subject is a no-op. NEW array. */
export function removePlanSubject(plan: PlanSelection, id: string): PlanItem[] {
  const target = (id ?? "").toLowerCase();
  return plan.filter((p) => p.subjectId.toLowerCase() !== target);
}

/**
 * Change the cycle of EXACTLY ONE entry.
 *
 * This is the investor's isolation rule made structural: every other entry is
 * returned by reference, so "changing one subject's plan never changes
 * another's" is not a convention a future refactor can quietly break — it is
 * asserted by identity in the unit tests.
 */
export function setPlanInterval(
  plan: PlanSelection,
  id: string,
  interval: PlanInterval,
): PlanItem[] {
  const target = (id ?? "").toLowerCase();
  const iv: PlanInterval = isPlanInterval(interval) ? interval : DEFAULT_PLAN_INTERVAL;
  return plan.map((p) =>
    p.subjectId.toLowerCase() === target && p.interval !== iv
      ? { subjectId: p.subjectId, interval: iv }
      : p,
  );
}

/** One priced row of a per-subject breakdown. */
export type PlanQuoteLine = ConfiguratorLine & { interval: PlanInterval };

/** The rows sharing one cycle, plus their subtotal. */
export type PlanQuoteGroup = {
  count: number;
  subtotal: number;
  lines: PlanQuoteLine[];
};

/**
 * The per-subject price preview. Same informational status as
 * {@link ConfiguratorQuote} — never an authorization to charge.
 *
 * There is deliberately no `total` field: with mixed cycles no single periodic
 * figure is honest, and the one number that IS honest — what checkout charges
 * right now — is `dueToday`, which carries no period suffix anywhere in the UI.
 * `perSubject` is gone for the same reason (it only meant something under one
 * global interval).
 */
export type PlanQuote = {
  lines: PlanQuoteLine[];
  groups: Record<PlanInterval, PlanQuoteGroup>;
  /** The cycles actually in use, in display order. */
  usedIntervals: PlanInterval[];
  /** `true` only with MORE THAN ONE distinct cycle in the basket. */
  mixed: boolean;
  /** Sum of the priced lines, each at its own cycle's price. */
  dueToday: number;
  currency: "AZN";
  hasSelection: boolean;
  hasUnpriced: boolean;
  pricedCount: number;
  allUnpriced: boolean;
};

function emptyGroups(): Record<PlanInterval, PlanQuoteGroup> {
  return {
    week: { count: 0, subtotal: 0, lines: [] },
    month: { count: 0, subtotal: 0, lines: [] },
    year: { count: 0, subtotal: 0, lines: [] },
  };
}

/**
 * Build the live preview for a per-subject plan. Pure, like
 * {@link computeQuote}: unknown ids are ignored rather than throwing, so a
 * stale shared link degrades instead of crashing the page.
 */
export function computePlanQuote(
  catalog: readonly ConfiguratorSubject[],
  plan: PlanSelection,
): PlanQuote {
  const byId = catalogIndex(catalog);
  const lines: PlanQuoteLine[] = [];
  for (const item of plan ?? []) {
    const subject = byId.get((item?.subjectId ?? "").toLowerCase());
    if (!subject) continue;
    const iv: PlanInterval = isPlanInterval(item.interval)
      ? item.interval
      : DEFAULT_PLAN_INTERVAL;
    lines.push({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      interval: iv,
      price: subjectPrice(subject, iv),
    });
  }

  const groups = emptyGroups();
  let dueToday = 0;
  let hasUnpriced = false;
  for (const line of lines) {
    const group = groups[line.interval];
    group.count += 1;
    group.lines.push(line);
    if (line.price === null) {
      hasUnpriced = true;
      continue;
    }
    group.subtotal = round2(group.subtotal + line.price);
    dueToday += line.price;
  }
  dueToday = round2(dueToday);

  const usedIntervals = PLAN_INTERVALS.filter((iv) => groups[iv].count > 0);
  const pricedCount = lines.filter((l) => l.price !== null).length;

  return {
    lines,
    groups,
    usedIntervals,
    mixed: usedIntervals.length > 1,
    dueToday,
    currency: "AZN",
    hasSelection: lines.length > 0,
    hasUnpriced,
    pricedCount,
    allUnpriced: lines.length > 0 && pricedCount === 0,
  };
}

/** A validated per-subject hand-off. */
export type ParsedPlan = {
  plan: PlanItem[];
  /**
   * The legacy single interval, still returned so a caller that has not moved
   * to per-subject cycles (or a page that only needs a sensible default for the
   * NEXT subject added) keeps working.
   */
  interval: PlanInterval;
};

/**
 * Validate a `?plan=<uuid>:week,<uuid>:year` hand-off against the live catalog,
 * falling back to the legacy `?subjects=…&interval=…` pair when `plan` is
 * absent — every bookmarked link, shared link and register→add-child hand-off
 * built before per-subject cycles keeps preselecting.
 *
 * Hardened exactly like {@link parseSelectionParams}: an over-long value
 * discards the whole selection, non-UUID entries and ids missing from the
 * catalog are dropped silently, duplicates collapse (last wins), the result is
 * capped, and an unrecognized cycle falls back to {@link DEFAULT_PLAN_INTERVAL}.
 * This is a UX preselection only — the server re-validates and re-prices.
 */
export function parsePlanParams(
  raw: {
    plan?: string | string[] | undefined;
    subjects?: string | string[] | undefined;
    interval?: string | string[] | undefined;
  },
  catalog: readonly ConfiguratorSubject[],
): ParsedPlan {
  const legacy = parseSelectionParams(raw ?? {}, catalog);
  const rawPlan = firstParam(raw?.plan);
  if (!rawPlan || rawPlan.length > MAX_PARAM_LENGTH) {
    return {
      plan: normalizePlan(
        legacy.subjectIds.map((id) => ({ subjectId: id, interval: legacy.interval })),
        catalog,
      ),
      interval: legacy.interval,
    };
  }

  const items: PlanItem[] = [];
  for (const part of rawPlan.split(",")) {
    const [rawId, rawIv] = part.trim().split(":");
    const candidate = (rawId ?? "").trim();
    if (!UUID_RE.test(candidate)) continue;
    items.push({
      subjectId: candidate,
      interval: isPlanInterval(rawIv) ? rawIv : DEFAULT_PLAN_INTERVAL,
    });
  }
  return { plan: normalizePlan(items, catalog), interval: legacy.interval };
}

/**
 * Build the per-subject hand-off query: `?plan=<id>:<iv>,<id>:<iv>`, or `""`
 * when nothing is selected. Ids and cycles only — never a price.
 */
export function buildPlanQuery(plan: PlanSelection): string {
  const parts = (plan ?? [])
    .filter(
      (p) =>
        p &&
        typeof p.subjectId === "string" &&
        UUID_RE.test(p.subjectId) &&
        isPlanInterval(p.interval),
    )
    .slice(0, MAX_CONFIGURATOR_SUBJECTS)
    .map((p) => `${p.subjectId}:${p.interval}`);
  if (parts.length === 0) return "";
  return `?plan=${encodeURIComponent(parts.join(","))}`;
}

/** Full per-subject hand-off href: a same-origin RELATIVE path + the query. */
export function buildPlanHref(basePath: SelectionBasePath, plan: PlanSelection): string {
  return `${basePath}${buildPlanQuery(plan)}`;
}
