-- =============================================================================
-- 2026_08_25_139 — A TRIAL IS ITS OWN RAIL.
--
-- Owner decision, 2026-08-25, taken because the code asked for one. The comment
-- above `entitlement_source` in canonical 001 reads:
--
--     "There is deliberately no 'trial', 'promo' or 'giveaway_window' value: a
--      trial is an abb_web grant with a short period ... extending it is an
--      owner decision, because every value is a rail somebody has to reconcile
--      money for."
--
-- The 1-day pre-purchase Free Trial breaks that premise. It moves NO money, so:
--
--   * `abb_web` would be false — it names the ABB card rail, and a settlement
--     report keyed on source would show revenue that never arrived.
--   * `manual` means "somebody comped this". Filing a trial there re-creates
--     exactly the conflation migration 137 removed ONE DAY AGO, when the first
--     real card payment was found filed as a comp.
--
-- So the honest answer is a seventh rail, and the reconciliation burden the
-- original comment worried about is nil: a trial is reconciled against nothing,
-- because nothing was charged.
--
-- WHY THIS FILE CONTAINS ONE STATEMENT AND NOTHING ELSE.
-- `alter type ... add value` is legal inside a transaction, but the new label
-- CANNOT BE USED until that transaction commits — and "used" includes a CHECK
-- constraint, an index predicate, a `do $$` block, and any `language sql`
-- function body (those are parse-analysed at CREATE time; plpgsql is not).
-- Migration 127 hit this exact wall. Every migration here self-transacts, so a
-- verify block in this file would fail on the value it just added. The value is
-- verified by the SELECT printed at the bottom, run after commit; migration 140
-- is what may finally use it.
-- =============================================================================
begin;

alter type public.entitlement_source add value if not exists 'trial';

comment on type public.entitlement_source is
  'WHICH RAIL produced an entitlement — the producer, never the commercial flavour. '
  '(migration 124; docs/STORE_PAYMENTS_COMPLIANCE.md §4.1, extended by migration 139.) '
  'abb_web = the ABB/AzeriCard web rail. apple_iap / google_play = store rails, dormant. '
  'giveaway = a platform-wide free campaign. manual = somebody comped this. '
  'school_license = a bulk institutional grant. '
  'trial = the one-time pre-purchase free trial: no money, no reconciliation, and '
  'deliberately NOT manual so a comp and a trial can never be confused in a report. '
  'The giveaway remains a COMPUTED window that owns no rows; only the six rails plus '
  'trial ever appear here.';

commit;

-- -----------------------------------------------------------------------------
-- VERIFY AFTER COMMIT (cannot live inside the transaction above):
--
--   select enumlabel from pg_enum
--    where enumtypid = 'public.entitlement_source'::regtype
--    order by enumsortorder;
--
-- Expect: abb_web, apple_iap, google_play, giveaway, manual, school_license, trial
-- -----------------------------------------------------------------------------
