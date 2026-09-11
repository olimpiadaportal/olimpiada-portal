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
//   'off'      → identical to 'real' on screen. NOTHING in the app reports
//                that payments are off: that is a platform state, it reached
//                the UI through this flag, and Apple rejected the build for it
//                (2.1.0, 2026-08-26). `paymentsOff` survives only to compute
//                `freeFlow`; no screen may branch on it.
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

/**
 * One option per SUBJECT out of the flat subjects_pricing rows; the amounts in
 * those rows are deliberately dropped here.
 *
 * THIS ORDER IS CACHE STABILITY, NOT DISPLAY ORDER (2026-09-10), and the
 * distinction is the whole point. It used to sort on `subjects.name` with a
 * bare `localeCompare()`, which was wrong twice over: `subjects.name` is the
 * frozen bulk-import key that migration 171 stopped following a rename — the
 * screen prints `subjectLabel()`, i.e. the per-locale `subject_translations`
 * name — and a locale-less `localeCompare()` collates in Hermes's default,
 * while this product's default reader is Azerbaijani (q before l, x before i).
 *
 * Nor can the fix live here. This runs inside a react-query `queryFn` under a
 * key that carries NO locale (`QK.pricing`, and the analytics tab's twin), and
 * `setLocale()` only mutates the zustand store — it never touches the query
 * cache. Any locale-aware order decided here would freeze at the language of
 * the FIRST fetch and outlive every later language switch.
 *
 * So it sorts on `id`: locale-independent, cache-safe and openly arbitrary —
 * `fetchSubjectsPricing` orders nothing, so an unsorted list would shuffle
 * between fetches. Reading order is chosen where the reader's language lives,
 * by `ManageSubjectsEditor` and the analytics tab, both through
 * `sortSubjectsByLabel(t, locale, …)`. Web twin: `web-app/src/lib/pricing.ts`.
 */
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
  return Array.from(map.values()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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

export type AccessPill = { key: string; tone: "ok" | "bad" | "muted" };

/**
 * The child card's access pill, decided from every rail that can grant access.
 *
 * WHY A SECOND SOURCE. `students.access_status` is written by the SUBSCRIPTION
 * rail alone — the subscription writers and the hourly reconciliation job, all
 * of which read `child_subscriptions`. An entitlement-only grant writes exactly
 * one row, into `public.entitlements`, and touches nothing else: an Apple
 * purchase (grantEntitlement → entitlement_grant), an admin comp
 * (admin_grant_entitlement), a school licence. So a child whose parent paid
 * thirty seconds ago was still `inactive` here, and the FIRST screen a parent
 * lands on labelled them "Giriş yoxdur" / "No access" in the muted tone. Pulling
 * to refresh could not help — the column it re-read had never changed.
 *
 * Nothing about that is iOS-specific, which is why this takes a plain boolean
 * and no platform flag: the same blind spot covers a comp and a school licence
 * on Android.
 *
 * THE THIRD GRANT IS THE FREE TRIAL, and it is invisible to BOTH of the above.
 * activate_free_trial (migration 140) writes no `access_status` and no
 * `child_subscriptions` row, and the entitlement rows it DOES write are
 * deliberately excluded from child_entitled_subjects — that exclusion is what
 * stops a 24-hour trial suppressing the purchase offer the trial exists to
 * convert, so it stays. What was left was a child reading `inactive` here while
 * their arena and Tests tabs were unlocked and a rated round was running: the
 * parent's FIRST screen said "Giriş yoxdur" over a child who was mid-round.
 * `onTrial` therefore arrives from its own read — child_free_trial(uuid), the
 * caller-scoped twin of the entitlement RPC — whose `active` is DERIVED from
 * ends_at, so no job has to run for the pill and the arena to agree.
 *
 * It reuses `access.trialing`, the word the subscription rail already uses for
 * exactly this state, rather than minting a second vocabulary for "temporary".
 *
 * FAIL OPEN. `entitled === false` is the entitlement reader's own safe fallback
 * (that is what it returns when the RPC hiccups) and `onTrial === false` is the
 * trial reader's; both reproduce the previous behaviour EXACTLY — a failed read
 * can only cost the upgrade. Neither can invent access, and neither blanks the
 * pill.
 *
 * A status that ALREADY reads as access keeps its own wording: a family with a
 * live subscription is not relabelled "access is active" merely because the
 * entitlement mirror knows about them too. An entitlement outranks a trial for
 * the same reason — a family holding both bought something, and that is the
 * truer thing to say about what they hold.
 */
export function accessPill(
  status: string | null | undefined,
  entitled: boolean,
  onTrial = false,
): AccessPill {
  const tone = accessTone(status);
  if (tone !== "ok" && entitled) return { key: "mob.sub.accessActive", tone: "ok" };
  if (tone !== "ok" && onTrial) return { key: "access.trialing", tone: "ok" };
  return { key: accessStatusKey(status), tone };
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
