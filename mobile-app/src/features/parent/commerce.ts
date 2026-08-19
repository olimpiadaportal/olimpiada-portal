// PURE parent-commerce helpers (no React imports). The commerce POSTURE is
// presentation only: the mode comes from get_mobile_config() and every money
// mutation is re-validated by the BFF/server — nothing here grants anything.
//
// The app is PURCHASE-SILENT (docs/STORE_PAYMENTS_COMPLIANCE.md): there is no
// checkout, no amount and no buy CTA in any mode, for either role. The posture
// therefore only decides WHICH read-only notice a money surface shows and
// whether the free-activation path is offered.
//
//   'real'     → read-only: status only, nothing is bought here.
//   'giveaway' → subscription access is free (activation, no payment step).
//   'off'      → gate.paymentsOff notice.
//
// The DEMO mode is GONE (owner, 2026-08-18): the platform keeps only free and
// real payments, so no cosmetic payment sheet exists anywhere.
import type { PaymentMode } from "@/lib/mobileConfig";
import type { SubjectPricingRow } from "@/lib/data";
import type { Locale } from "@/i18n";
import { formatLongDate } from "@/lib/formatDate";

export type CommercePosture = {
  mode: PaymentMode;
  /** Parent free-access window is live (server-resolved RPC). */
  freeAccess: boolean;
  /** Subscription access is free: giveaway mode OR free access (never in 'off'). */
  freeFlow: boolean;
  /** Read-only: nothing is subscribed to or purchased inside the app. */
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
    webOnly: mode === "real",
    paymentsOff,
  };
}

// ---- subjects ------------------------------------------------------------------

/** A subject a subscription can cover. It carries NO price: the app never
 *  holds an amount it could render by accident (store compliance). The
 *  subjects_pricing read behind it survives only because "has active pricing"
 *  is how the platform says a subject is sold at all. */
export type SubjectOption = {
  id: string;
  /** subjects.code — drives the locale-aware label (subj.<code>) in the UI. */
  code: string | null;
  name: string;
};

export type Interval = "week" | "month" | "year";

export function isInterval(v: unknown): v is Interval {
  return v === "week" || v === "month" || v === "year";
}

/** i18n key for a cycle's NAME. The per-period price keys it used to sit
 *  beside (billing.perWeek/…) are gone with the amounts. */
export const INTERVAL_NAME_KEY: Record<Interval, string> = {
  week: "pricing.weekly",
  month: "pricing.monthly",
  year: "pricing.yearly",
};

/** One option per SUBJECT out of the flat subjects_pricing rows (name-sorted);
 *  the amounts in those rows are deliberately dropped here. */
export function groupPricing(rows: SubjectPricingRow[]): SubjectOption[] {
  const map = new Map<string, SubjectOption>();
  for (const row of rows) {
    if (!Number.isFinite(Number(row.amount))) continue;
    if (map.has(row.subject_id)) continue;
    map.set(row.subject_id, {
      id: row.subject_id,
      code: row.subject?.code ?? null,
      name: row.subject?.name ?? "—",
    });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** The allocated 8-digit login ID out of an activate/edit BFF payload. */
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
// There is no money formatter here any more (owner, 2026-08-18): the app is
// purchase-silent, so it renders no amount at all and fmtAmount/fmtMoney had
// no callers left. Do not reintroduce one without an owner decision — a helper
// that can print "27,00 AZN" is how a price finds its way back onto a screen.

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
