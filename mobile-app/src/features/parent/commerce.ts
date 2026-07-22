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

// ---- server quote (BFF /children/:id/quote) --------------------------------------

export type Quote = {
  base: number;
  discountPercent: number;
  discount: number;
  total: number;
  trialDays: number;
  currency: string;
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
  return {
    base,
    discountPercent: num(o.discount_percent ?? o.discountPercent) ?? 0,
    discount: num(o.discount) ?? 0,
    total,
    trialDays: num(o.trial_days ?? o.trialDays) ?? 0,
    currency: typeof o.currency === "string" && o.currency ? o.currency : "AZN",
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

/** Bare numeric amount (no currency) — trims float noise but keeps honest
 *  cents when present. Used to fill {total}-shaped i18n template slots that
 *  carry currency in a separate {currency} placeholder (subjedit.thenRate
 *  and friends). */
export function fmtAmount(amount: number | null | undefined): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function fmtMoney(amount: number | null | undefined, currency?: string | null): string {
  return `${fmtAmount(amount)} ${currency && currency.length > 0 ? currency : "AZN"}`;
}

const INTL_LOCALE: Record<Locale, string> = { az: "az-AZ", en: "en-GB", ru: "ru-RU" };

/** Locale date (+ optional time); falls back to the ISO date part. */
export function fmtDate(iso: string | null | undefined, locale: Locale, withTime = false): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      day: "numeric",
      month: "long",
      year: "numeric",
      ...(withTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
    }).format(new Date(ts));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Billing dates (proration effective/renewal dates) are DATE-ONLY in the
 *  product's home timezone — never device-local (pricing.tsx pkgDate twin). */
export function fmtBakuDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      timeZone: "Asia/Baku",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(ts));
  } catch {
    return iso.slice(0, 10);
  }
}

/** "1234 5678" display grouping for the 8-digit login ID. */
export function groupChildId(id: string): string {
  return id.length > 4 ? `${id.slice(0, 4)} ${id.slice(4)}` : id;
}
