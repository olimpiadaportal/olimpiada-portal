-- =============================================================================
-- 2026_08_19_123_azericard_order_uniqueness.sql
-- =============================================================================
-- Migration: 2026_08_19_123_azericard_order_uniqueness.sql
-- Purpose: Make a merchant ORDER id unique in the database, and give a protocol
--          test its own checkout kind, ahead of the first AzeriCard/ABB test
--          transaction on the bank's sandbox terminal.
--
--          TWO CHANGES, both small, both load-bearing.
--
--          A1 — UNIQUE (provider, provider_session_id) on checkout_sessions.
--          The gateway specification says the LAST SIX DIGITS of ORDER are used
--          as the system trace audit number and "must be unique per terminal per
--          day". We mint ORDER as YYYYMMDD (UTC) + six CSPRNG digits, so the day
--          part makes the requirement a per-day one by construction and the six
--          digits are the part that must not collide.
--
--          Six random digits are NOT enough on their own: at a thousand orders
--          in a day the birthday bound puts the chance of at least one collision
--          near 39%. A collision is not a cosmetic problem — two payments would
--          share an order id, the TRTYPE 90 status query for one would answer
--          about the other, and the callback handler would attribute money to
--          the wrong checkout. Application-side "check then insert" cannot fix
--          it either; two concurrent requests both see the gap. So the index is
--          the fix: the mint loop inserts, catches SQLSTATE 23505, and mints
--          again. Uniqueness becomes a certainty instead of a probability.
--
--          It is PARTIAL (provider_session_id is not null) so the many rows a
--          future provider might write without a session id are unaffected, and
--          it is keyed on (provider, provider_session_id) rather than the id
--          alone so two providers can never collide with each other's id space.
--
--          A2 — 'protocol_test' joins the checkout_sessions.kind whitelist.
--          The bank asked us to run a transaction on the test terminal and
--          report back. That row is neither a 'subscription' nor an 'olympiad',
--          and recording it as one would put a subscription nobody can explain
--          into every future reconciliation report. Its own value costs one
--          CHECK constraint and keeps the ledger honest.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--          No entitlement table, no grant path, no column for card data, no
--          token/recurring column. docs/STORE_PAYMENTS_COMPLIANCE.md §4.1
--          requires access to be governed by a provider-agnostic `entitlements`
--          table with ABB as ONE producer of rows; that table is its own piece
--          of work and must not be improvised here. The payment layer shipping
--          alongside this migration records money and grants nothing.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 007_subscriptions_payments_coupons.sql — the checkout_sessions
--                    kind CHECK gains 'protocol_test' (kept INLINE so a
--                    from-zero build produces the same auto-generated
--                    constraint name, checkout_sessions_kind_check, that this
--                    migration writes on a live database — same reasoning as
--                    migration 120 for subscription_changes.change_type);
--          * 011_indexes_constraints_functions_triggers.sql — NEW unique index
--                    uq_checkout_provider_session;
--          * 013_validation_queries.sql — NEW check 110.
--          010 is deliberately untouched: checkout_sessions already has its
--          owner-read / admin-write policies and the service role bypasses RLS
--          for the callback writes. An index is not a policy and a widened
--          CHECK is not a new access path.
-- Backport status: pending
-- Destructive change: NO. One partial unique index is created and one CHECK is
--          replaced by a strictly wider one. No row is rewritten, no object is
--          dropped, and nothing that validated before validates less now.
--          checkout_sessions is empty in every environment today (nothing has
--          ever written it), so the index cannot fail on existing duplicates;
--          the guard below reports them instead of failing obscurely if that
--          ever stops being true.
-- Rollback notes:
--          drop index if exists public.uq_checkout_provider_session;
--          alter table public.checkout_sessions
--            drop constraint if exists checkout_sessions_kind_check;
--          alter table public.checkout_sessions
--            add constraint checkout_sessions_kind_check
--            check (kind in ('subscription', 'olympiad'));
--          Rolling back the CHECK requires that no 'protocol_test' row exists.
--
-- SELF-TRANSACTING (begin; ... commit;) like every migration in this series, so
-- a mid-way failure leaves nothing half-applied. Per CLAUDE.md this file is
-- therefore NEVER sourced inside a from-zero rebuild.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A1. ORDER uniqueness (backport -> 011)
-- -----------------------------------------------------------------------------
-- Fail LOUDLY and specifically if duplicates already exist, rather than letting
-- CREATE UNIQUE INDEX report a generic violation that names one pair.
do $$
declare
  v_dupes bigint;
begin
  select count(*) into v_dupes
    from (
      select provider, provider_session_id
        from public.checkout_sessions
       where provider_session_id is not null
       group by provider, provider_session_id
      having count(*) > 1
    ) d;
  if v_dupes > 0 then
    raise exception
      'checkout_sessions has % duplicated (provider, provider_session_id) groups; '
      'resolve them before applying 123', v_dupes
      using hint = 'azericard_order_duplicates';
  end if;
end $$;

create unique index if not exists uq_checkout_provider_session
  on public.checkout_sessions (provider, provider_session_id)
  where provider_session_id is not null;

comment on index public.uq_checkout_provider_session is
  'A merchant order id is unique per provider. The AzeriCard ORDER mint inserts '
  'and retries on 23505; without this index the "unique per terminal per day" '
  'rule in the gateway spec would be a probability, not a guarantee.';

-- -----------------------------------------------------------------------------
-- A2. 'protocol_test' checkout kind (backport -> 007)
-- -----------------------------------------------------------------------------
-- Dropped and re-added rather than widened in place: a CHECK cannot be altered.
-- The constraint keeps its auto-generated name so a from-zero build from 007
-- and a live database patched by this file end up with the SAME object name,
-- which is what 013 check 110 asserts.
alter table public.checkout_sessions
  drop constraint if exists checkout_sessions_kind_check;

alter table public.checkout_sessions
  add constraint checkout_sessions_kind_check
  check (kind in ('subscription', 'olympiad', 'protocol_test'));

comment on column public.checkout_sessions.kind is
  'subscription | olympiad | protocol_test. protocol_test is an acquirer '
  'integration test on the bank sandbox terminal — never a real sale, and never '
  'a reason to grant access.';

commit;

-- =============================================================================
-- End of 2026_08_19_123_azericard_order_uniqueness.sql
-- =============================================================================
