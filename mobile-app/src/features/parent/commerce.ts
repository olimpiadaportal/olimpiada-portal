// PURE parent-commerce helpers (no React imports). The commerce POSTURE is
// presentation only: the mode comes from get_mobile_config() and every money
// mutation is re-validated by the BFF/server — nothing here grants anything.
//
//   'real'     → mobile is READ-ONLY for money: no subscribe/purchase CTAs,
//                a neutral "managed from the family's web account" note.
//   'demo'     → flows run end-to-end behind the cosmetic demo-payment sheet.
//   'giveaway' → subscription flows are free (no payment step); olympiad
//                packages are ALWAYS purchases (web Round 13.1 parity).
//   'off'      → gate.paymentsOff notice.
import type { PaymentMode } from "@/lib/mobileConfig";
import type { SubjectPricingRow } from "@/lib/data";
import type { Locale } from "@/i18n";
import { formatLongDate } from "@/lib/formatDate";

export type CommercePosture = {
  mode: PaymentMode;
  /** Parent free-access window is live (server-resolved RPC). */
  freeAccess: boolean;
  /** Subscription flows are free: giveaway mode OR free access (never in 'off'). */
  freeFlow: boolean;
  /** Money mutations run via the cosmetic demo sheet. */
  demoPay: boolean;
  /** Read-only: subscriptions/purchases happen on the family's web account. */
  webOnly: boolean;
  paymentsOff: boolean;
};

export function resolvePosture(
  mode: PaymentMode,
  freeAccessActive: boolean,
): CommercePosture {
  const paymentsOff = mode === "off";
  const freeFlow = !paymentsOff && (mode === "giveaway" || freeAccessActive);
  return {
    mode,
    freeAccess: freeAccessActive,
    freeFlow,
    demoPay: mode === "demo",
    webOnly: mode === "real",
    paymentsOff,
  };
}

// ---- subjects & pricing --------------------------------------------------------

export type SubjectOption = {
  id: string;
  /** subjects.code — drives the locale-aware label (subj.<code>) in the UI. */
  code: string | null;
  name: string;
  /** interval → per-subject price (from subjects_pricing). */
  prices: Record<string, number>;
};

export const INTERVALS = ["week", "month", "year"] as const;
export type Interval = (typeof INTERVALS)[number];

export function isInterval(v: unknown): v is Interval {
  return v === "week" || v === "month" || v === "year";
}

export const INTERVAL_NAME_KEY: Record<Interval, string> = {
  week: "pricing.weekly",
  month: "pricing.monthly",
  year: "pricing.yearly",
};

export const INTERVAL_PER_KEY: Record<Interval, string> = {
  week: "billing.perWeek",
  month: "billing.perMonth",
  year: "billing.perYear",
};

export const INTERVAL_NOTE_KEY: Record<Interval, string> = {
  week: "pricing.plan.weekly.note",
  month: "pricing.plan.monthly.note",
  year: "pricing.plan.yearly.note",
};

/** Group flat subjects_pricing rows into one option per subject (name-sorted). */
export function groupPricing(rows: SubjectPricingRow[]): SubjectOption[] {
  const map = new Map<string, SubjectOption>();
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    let s = map.get(row.subject_id);
    if (!s) {
      s = {
        id: row.subject_id,
        code: row.subject?.code ?? null,
        name: row.subject?.name ?? "—",
        prices: {},
      };
      map.set(row.subject_id, s);
    }
    s.prices[row.interval] = amount;
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Client-side ESTIMATE (subjects × per-interval price) shown until the
 *  authoritative server quote arrives. Never submitted anywhere. */
export function estimateTotal(
  subjects: SubjectOption[],
  selectedIds: ReadonlySet<string>,
  interval: string,
): number {
  let sum = 0;
  for (const s of subjects) {
    if (selectedIds.has(s.id)) sum += s.prices[interval] ?? 0;
  }
  return sum;
}

// ---- per-subject plans (migration 109) ------------------------------------------
// Each subject carries its OWN billing cycle. The mobile parent surfaces DISPLAY
// a mixed plan faithfully and PRESERVE each subject's cycle when the subject set
// changes; choosing a different cycle for an existing subject is a web action
// (see MOBILE_APP_MASTER_PLAN — the web is the purchasing rail).

export type PlanItem = { subjectId: string; interval: Interval };

/** Drop unknown subjects, de-duplicate (last wins), cap, and fall back to a
 *  cycle the subject is actually sold on. Mirrors the web helper of the same
 *  name so both clients normalize a basket identically. */
export function normalizePlan(
  plan: readonly PlanItem[],
  subjects: SubjectOption[],
  max = 20,
): PlanItem[] {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const out = new Map<string, PlanItem>();
  for (const item of plan ?? []) {
    const known = byId.get(item?.subjectId ?? "");
    if (!known) continue;
    const wanted = isInterval(item.interval) ? item.interval : "month";
    const sold =
      typeof known.prices[wanted] === "number"
        ? wanted
        : (INTERVALS.find((iv) => typeof known.prices[iv] === "number") ?? wanted);
    out.set(known.id, { subjectId: known.id, interval: sold });
  }
  return [...out.values()].slice(0, max);
}

/** Change ONE entry's cycle; every other entry is returned by reference so a
 *  cycle change can never disturb another subject. */
export function setPlanInterval(
  plan: readonly PlanItem[],
  subjectId: string,
  interval: Interval,
): PlanItem[] {
  return plan.map((p) =>
    p.subjectId === subjectId && p.interval !== interval ? { ...p, interval } : p,
  );
}

/** Client-side ESTIMATE for a per-subject basket: each subject at ITS OWN
 *  cycle's price. Deliberately NOT labelled per period — with mixed cycles no
 *  single periodic figure is honest. */
export function estimatePlanTotal(
  subjects: SubjectOption[],
  plan: readonly PlanItem[],
): number {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  let sum = 0;
  for (const item of plan) {
    sum += byId.get(item.subjectId)?.prices[item.interval] ?? 0;
  }
  return sum;
}

/** i18n key for a cycle's group heading in the grouped summary. */
export function groupLabelKey(iv: Interval): string {
  return iv === "week"
    ? "plan.group.weekly"
    : iv === "year"
      ? "plan.group.yearly"
      : "plan.group.monthly";
}

/** i18n key for a cycle's renewal sentence. */
export function renewalLineKey(iv: Interval): string {
  return iv === "week"
    ? "plan.renewalLine.weekly"
    : iv === "year"
      ? "plan.renewalLine.yearly"
      : "plan.renewalLine.monthly";
}

// ---- server quote (BFF /children/:id/quote) --------------------------------------

export type QuoteGroup = {
  count: number;
  base: number;
  discount: number;
  total: number;
};

export type Quote = {
  base: number;
  discountPercent: number;
  discount: number;
  total: number;
  trialDays: number;
  currency: string;
  // Migration 109 — additive, so a response from an older server (or an older
  // binary reading a newer one) still parses.
  items?: { subjectId: string; interval: Interval; price: number | null }[];
  groups?: Partial<Record<Interval, QuoteGroup>>;
  mixed?: boolean;
};

/** Defensive parse of the BFF quote payload (snake_case web contract). */
export function parseQuote(raw: unknown): Quote | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const base = num(o.base);
  const total = num(o.total);
  if (base === null || total === null) return null;
  // Migration 109 extras: absent or malformed → undefined, never a throw. The
  // legacy fields above are parsed exactly as before.
  let items: Quote["items"];
  if (Array.isArray(o.items)) {
    items = [];
    for (const raw of o.items) {
      const row = (raw ?? {}) as Record<string, unknown>;
      if (typeof row.subject_id !== "string" || !isInterval(row.interval)) continue;
      items.push({
        subjectId: row.subject_id,
        interval: row.interval,
        price: num(row.price),
      });
    }
  }
  let groups: Quote["groups"];
  if (o.groups && typeof o.groups === "object" && !Array.isArray(o.groups)) {
    groups = {};
    for (const [key, raw] of Object.entries(o.groups as Record<string, unknown>)) {
      if (!isInterval(key)) continue;
      const row = (raw ?? {}) as Record<string, unknown>;
      groups[key] = {
        count: num(row.count) ?? 0,
        base: num(row.base) ?? 0,
        discount: num(row.discount) ?? 0,
        total: num(row.total) ?? 0,
      };
    }
  }
  return {
    base,
    discountPercent: num(o.discount_percent ?? o.discountPercent) ?? 0,
    discount: num(o.discount) ?? 0,
    total,
    trialDays: num(o.trial_days ?? o.trialDays) ?? 0,
    currency: typeof o.currency === "string" && o.currency ? o.currency : "AZN",
    items,
    groups,
    mixed: o.mixed === true,
  };
}

/** The allocated 8-digit login ID out of a subscribe/activate BFF payload. */
export function extractChildUniqueId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const v = o.child_unique_id ?? o.childUniqueId;
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ---- statuses ---------------------------------------------------------------------

const ACCESS_STATUSES = ["inactive", "trialing", "active", "locked", "expired"] as const;

/** i18n key for a child's access pill (unknown values degrade to inactive). */
export function accessStatusKey(status: string | null | undefined): string {
  const s = ACCESS_STATUSES.find((x) => x === status) ?? "inactive";
  return `access.${s}`;
}

/** Positive/negative/neutral tone for the access pill colouring. */
export function accessTone(status: string | null | undefined): "ok" | "bad" | "muted" {
  if (status === "active" || status === "trialing") return "ok";
  if (status === "locked" || status === "expired") return "bad";
  return "muted";
}

const SUB_STATUSES = ["trialing", "active", "past_due", "canceled", "expired"] as const;

export function subStatusKey(status: string | null | undefined): string {
  const s = SUB_STATUSES.find((x) => x === status) ?? "none";
  return `subscription.status.${s}`;
}

export function isCancellable(status: string | null | undefined): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

// ---- formatting ----------------------------------------------------------------

/** Web pricingConfigurator DECIMAL_SEPARATOR twin: az/ru write decimals with
 *  a comma, en with a dot. */
const DECIMAL_SEPARATOR: Record<Locale, string> = {
  az: ",",
  en: ".",
  ru: ",",
};

/** Bare numeric amount (no currency) — web formatAzn parity: ALWAYS exactly
 *  two decimals, with the locale's decimal separator (comma for az/ru, dot
 *  for en). Used to fill {total}-shaped i18n template slots that carry
 *  currency in a separate {currency} placeholder (subjedit.nextBillingLine
 *  and friends). */
export function fmtAmount(amount: number | null | undefined, locale: Locale = "az"): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  const separator = DECIMAL_SEPARATOR[locale] ?? DECIMAL_SEPARATOR.az;
  return n.toFixed(2).replace(".", separator);
}

/** "27,00 AZN" (az/ru) / "27.00 AZN" (en) — web formatAzn's shape with the
 *  server-provided currency code (AZN fallback). */
export function fmtMoney(
  amount: number | null | undefined,
  currency?: string | null,
  locale: Locale = "az",
): string {
  return `${fmtAmount(amount, locale)} ${currency && currency.length > 0 ? currency : "AZN"}`;
}

/** Locale long date (+ optional time) in the product's home timezone
 *  (Asia/Baku). Thin wrapper over the Hermes-safe formatLongDate (Round 42:
 *  az month names are missing from Hermes ICU — "2026 M08 6") so every
 *  caller (ManageSubjectsEditor {date} fills, subscription tab period end,
 *  olympiad event dates) inherits the manual-month fallback. */
export function fmtDate(iso: string | null | undefined, locale: Locale, withTime = false): string {
  return formatLongDate(iso, locale, withTime);
}

/** Billing dates (proration effective/renewal dates) are DATE-ONLY in the
 *  product's home timezone — never device-local (pricing.tsx pkgDate twin). */
export function fmtBakuDate(iso: string | null | undefined, locale: Locale): string {
  return formatLongDate(iso, locale);
}

/** "1234 5678" display grouping for the 8-digit login ID. */
export function groupChildId(id: string): string {
  return id.length > 4 ? `${id.slice(0, 4)} ${id.slice(4)}` : id;
}
