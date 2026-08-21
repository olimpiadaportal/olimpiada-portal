// PER-SUBJECT PLAN BASKETS — the pure half (no DB, no server-only imports, so
// it is unit-testable and can never drag the service-role client into a client
// bundle).
//
// One subject, one cycle. The client sends ids and cycles ONLY — never a price
// — and every amount is re-read from subjects_pricing by the RPCs.
//
// WHY THIS MODULE EXISTS AS ITS OWN FILE (owner decision, 2026-08-17):
// proration and the single shared renewal date per child are RETIRED. Migration
// 118 dropped `quote_subject_change` / `apply_subject_change`, the two SQL
// wrappers that composed a basket from an add/remove diff and were the last
// reachable route into the old model. A caller that sends only subject ids must
// still work (already-shipped mobile binaries, the legacy web form), so the
// SERVER now composes that basket itself — here, once, with the rule spelled
// out in `derivePlanItems`. Keeping it in one pure function is the point: the
// dropped SQL was a SECOND implementation of the same rule, and a second
// implementation of a billing rule mis-bills silently the day it drifts.
import { isUuid } from "@/lib/uuid";

/** One basket entry as it arrives from a form post or a BFF body. */
export type PlanItemInput = { subjectId: string; interval: string };

/** The normalized entry the RPCs take (snake_case, like the jsonb they parse). */
export type NormalizedPlanItem = { subject_id: string; interval: string };

export const PLAN_ITEM_INTERVALS = ["week", "month", "year"] as const;

/** Hard cap on basket size, mirroring the DB's own `plan_items_normalize`. */
export const MAX_PLAN_ITEMS = 20;

/**
 * Server-side gate for a client-supplied basket, mirroring the DB's own
 * `plan_items_normalize`: UUID-shaped ids, the interval ENUM whitelist, the
 * hard cap, and one entry per subject (last wins). Rejecting here means a bad
 * payload never reaches the RPC — the segmented control in the browser is UX,
 * this is the rule.
 *
 * Returns `null` when the basket is unusable, so callers map it to the same
 * generic `sub.err.invalid` key every other malformed input gets.
 */
export function validatePlanItems(
  raw: readonly PlanItemInput[] | undefined,
  max: number = MAX_PLAN_ITEMS,
): NormalizedPlanItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > max) return null;
  const bySubject = new Map<string, string>();
  for (const item of raw) {
    const id = typeof item?.subjectId === "string" ? item.subjectId : "";
    const interval = typeof item?.interval === "string" ? item.interval : "";
    if (!isUuid(id)) return null;
    if (!(PLAN_ITEM_INTERVALS as readonly string[]).includes(interval)) return null;
    bySubject.set(id, interval);
  }
  if (bySubject.size === 0 || bySubject.size > max) return null;
  return [...bySubject.entries()].map(([subject_id, interval]) => ({
    subject_id,
    interval,
  }));
}

/** Expand the legacy `(interval, subjectIds)` shape into a uniform basket. */
export function uniformPlanItems(
  interval: string,
  subjectIds: readonly string[],
): PlanItemInput[] {
  return subjectIds.map((subjectId) => ({ subjectId, interval }));
}

/** One row of `subscription_subjects` as the derivation needs it. */
export type LivePlanRow = {
  subject_id: string;
  interval: string | null;
  pending_interval: string | null;
  remove_at: string | null;
  /**
   * THIS subject's own coverage end. Optional because the derivation above
   * never needed it; `isReinstatement` does — whether an un-cancel is free or a
   * genuine repurchase depends entirely on whether that date has passed.
   */
  current_period_end?: string | null;
};

/** The child's live subscription reduced to what a basket derivation needs. */
export type LivePlan = {
  subscriptionId: string;
  /** The subscription's default cycle — what a newly added subject inherits. */
  interval: string | null;
  /**
   * Coverage that is NOT scheduled for removal. A row with `remove_at` keeps
   * access to its own period end but is no longer part of the go-forward plan,
   * so re-selecting it is an ADD (which is what clears `remove_at`).
   */
  activeRows: LivePlanRow[];
  /**
   * EVERY coverage row, including those scheduled for removal.
   *
   * Membership and CYCLE are different questions and must read different sets.
   * A row with `remove_at` is out of the go-forward plan (so `activeRows` is
   * right for "what is covered"), but it is still PAID on a cycle of its own —
   * so it is the only correct source for "what cycle is this subject on".
   *
   * Resolving the cycle from `activeRows` looked harmless and was not: a
   * removal-scheduled subject is absent there, so re-selecting it fell through
   * to the subscription default, and `apply_plan_change` writes
   * `interval = excluded.interval` on conflict. A yearly subject re-added on a
   * monthly-default subscription would have been silently switched to monthly —
   * a cycle change, and a price change, that the parent never asked for.
   */
  allRows: LivePlanRow[];
  /**
   * The SUBSCRIPTION's own period end — the fallback coverage date for a legacy
   * row whose `current_period_end` is NULL, exactly as the DB classifier reads
   * it (`coalesce(ss.current_period_end, cs.current_period_end)`).
   */
  periodEnd?: string | null;
};

/**
 * Is choosing this subject again an UN-CANCEL rather than a purchase?
 *
 * Mirrors the DB's `plan_change_states` (migration 120), which is the
 * authority: a row SCHEDULED for removal whose coverage has NOT lapsed is a
 * REINSTATEMENT — `remove_at` is cleared, the cycle, the price and the period
 * are untouched and NOTHING is charged, because the parent already paid for
 * that coverage and a removal never refunds. Once the period HAS lapsed the
 * same click is a genuinely new subscription and is charged in full.
 *
 * Resolution order matches the SQL: the row's own period end, then the
 * subscription's. `remove_at` is the last resort — it was itself written as
 * `coalesce(ss.current_period_end, cs.current_period_end, now())`, so it is the
 * best available proxy on a surface (the mobile editor) that never loaded the
 * period columns, and it degrades to "lapsed" in exactly the case the SQL does.
 *
 * This is a UI-side classification: it decides what the editor SAYS and whether
 * a payment sheet opens. Every amount still comes from the server quote.
 */
export function isReinstatement(
  row:
    | Pick<LivePlanRow, "remove_at">
    | (Pick<LivePlanRow, "remove_at"> & { current_period_end?: string | null })
    | undefined,
  subscriptionPeriodEnd: string | null = null,
  nowMs: number = Date.now(),
): boolean {
  if (!row?.remove_at) return false;
  const endsAt =
    ("current_period_end" in row ? row.current_period_end : null) ??
    subscriptionPeriodEnd ??
    row.remove_at;
  const at = Date.parse(endsAt);
  return Number.isFinite(at) && at > nowMs;
}

/**
 * The cycle a subject is EFFECTIVELY on: a SCHEDULED change first, then the
 * cycle it is actually paid on, then the subscription's default.
 *
 * The order is load-bearing in both directions. Reading `interval` first makes
 * an unrelated add/remove silently CANCEL a cycle change the parent scheduled
 * (the basket would re-assert the old cycle, and re-selecting the current cycle
 * is exactly how a schedule is cancelled). Ignoring the subscription default
 * strands legacy rows, whose `interval` is legitimately NULL since 007.
 */
export function effectivePlanInterval(
  row: LivePlanRow | undefined,
  subscriptionInterval: string | null,
): string | null {
  return row?.pending_interval ?? row?.interval ?? subscriptionInterval;
}

/**
 * Turn a DESIRED subject-id set into a full per-subject basket against the live
 * plan: every subject the parent KEEPS stays on its own effective cycle, and a
 * NEWLY ADDED subject opens on the subscription's default cycle.
 *
 * Duplicates collapse to the FIRST occurrence, so re-listing an already covered
 * subject can never move it onto the default cycle.
 *
 * Nothing is invented: when no cycle can be resolved the entry carries an empty
 * interval, `validatePlanItems` rejects the basket and the caller returns the
 * generic invalid-input key. Guessing a cycle here would be guessing a price.
 */
export function derivePlanItems(
  desiredSubjectIds: readonly string[],
  live: LivePlan,
): PlanItemInput[] {
  // allRows, NOT activeRows: a subject scheduled for removal keeps its own paid
  // cycle, and re-selecting it must restore THAT cycle rather than the
  // subscription default. See the `allRows` note on LivePlan.
  const byId = new Map(live.allRows.map((r) => [r.subject_id, r]));
  const seen = new Set<string>();
  const items: PlanItemInput[] = [];
  for (const subjectId of desiredSubjectIds) {
    if (seen.has(subjectId)) continue;
    seen.add(subjectId);
    items.push({
      subjectId,
      interval: effectivePlanInterval(byId.get(subjectId), live.interval) ?? "",
    });
  }
  return items;
}

/**
 * The DESIRED set implied by the legacy `(add, remove)` diff shape: the live
 * go-forward coverage minus the removals, plus the additions. This is exactly
 * what the dropped `quote_subject_change` / `apply_subject_change` wrappers
 * composed in SQL, kept in ONE place so the two shapes cannot disagree.
 */
export function desiredFromAddRemove(
  live: LivePlan,
  add: readonly string[],
  remove: readonly string[],
): string[] {
  const removing = new Set(remove);
  return [
    ...live.activeRows.map((r) => r.subject_id).filter((id) => !removing.has(id)),
    ...add,
  ];
}

/**
 * Is a FROZEN checkout basket the same purchase as the one being asked for?
 *
 * Migration 126. When a parent clicks "continue to payment" twice, the second
 * click re-signs the pending order the first one opened instead of minting a
 * parallel `checkout_sessions` row — but only if it is genuinely the same
 * purchase. Two orders are two transactions to the acquirer, and its duplicate
 * protection is per-ORDER, so re-using is the safer half; re-using the WRONG
 * one would take money for a basket the parent is no longer looking at, and the
 * intent is frozen, so the stored basket is what would be delivered.
 *
 * Compared as a SET of (subject, cycle) pairs: the order the checkboxes were
 * ticked in is not part of what is being bought. `stored` comes back from the
 * database as `unknown` (it is jsonb), so every field is re-established here
 * rather than assumed, and anything unreadable answers FALSE — which opens a
 * fresh intent, the safe direction.
 */
export function storedBasketMatches(
  stored: unknown,
  items: readonly PlanItemInput[],
): boolean {
  if (!Array.isArray(stored)) return false;
  if (stored.length === 0 || stored.length !== items.length) return false;
  const key = (subjectId: string, interval: string) => `${subjectId}:${interval}`;
  const want = new Set(items.map((i) => key(i.subjectId, i.interval)));
  // A duplicate pair on either side collapses in its Set, so the length check
  // above is what keeps [A,A] from matching [A,B]: the sets would both be size
  // one and every membership test would pass.
  if (want.size !== items.length) return false;
  for (const raw of stored) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const subjectId = typeof row.subject_id === "string" ? row.subject_id : "";
    const interval = typeof row.interval === "string" ? row.interval : "";
    if (!subjectId || !interval) return false;
    if (!want.delete(key(subjectId, interval))) return false;
  }
  return want.size === 0;
}
