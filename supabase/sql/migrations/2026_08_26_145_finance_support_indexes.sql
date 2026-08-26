-- =============================================================================
-- 2026_08_26_145 — INDEXES FOR THE ADMIN FINANCE / SUPPORT VIEW.
--
-- Seven indexes the read-only finance view needs and the schema does not have.
--
-- HONEST SCALE NOTE, so nobody reads urgency into this: production currently
-- holds single-digit payment rows. Every query below is fast today on a
-- sequential scan. These are added because indexes are cheap to add now and
-- expensive to add during an incident, and because they belong in canonical
-- `011` as a reviewed change rather than as a rescue later.
--
-- That the gap is a real class, not a hypothetical: `/subscriptions` already
-- orders by `child_subscriptions.updated_at` with no index on that column.
--
-- NOT ADDED, deliberately:
--   * `payments.provider_ref` — already covered by `uq_payments_provider_ref`.
--   * anything on `entitlements` — 011 explicitly forbids a dedup index there,
--     because a child may legitimately hold two live grants from two rails.
--
-- Plain, not CONCURRENTLY: the repo sources migration files with `\i`, and
-- CONCURRENTLY cannot run inside a transaction block.
--
-- Self-transacting. Backported verbatim into canonical 011's index block.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- payments — the view's primary object, and the least indexed table in it.
-- Only two indexes exist today (profile_id, status), neither composite with
-- time, and the finance list is time-ordered in every branch.
-- -----------------------------------------------------------------------------
create index if not exists idx_payments_created
  on public.payments (created_at desc);

-- A bare status index is a five-value enum the planner will usually decline;
-- paired with time it serves "recent failures", which is a real support query.
create index if not exists idx_payments_status_created
  on public.payments (status, created_at desc);

-- idx_payments_profile exists but is not composite with time, so the family
-- timeline sorts in memory without this.
create index if not exists idx_payments_profile_created
  on public.payments (profile_id, created_at desc);

-- Both of these are FOREIGN KEYS WITH NO INDEX. Postgres does not create one
-- automatically, and an unindexed FK also makes every DELETE on the parent row
-- scan this table.
create index if not exists idx_payments_checkout_session
  on public.payments (checkout_session_id)
  where checkout_session_id is not null;

create index if not exists idx_payments_olympiad_purchase
  on public.payments (olympiad_purchase_id)
  where olympiad_purchase_id is not null;

-- -----------------------------------------------------------------------------
-- checkout_sessions — idx_checkout_owner exists but is not composite with time.
-- The three partial indexes already on this table (child filter,
-- paid-unredeemed, needs-review) are exact matches for the attention strip and
-- are deliberately REUSED, not duplicated.
-- -----------------------------------------------------------------------------
create index if not exists idx_checkout_owner_created
  on public.checkout_sessions (owner_parent_profile_id, created_at desc);

-- -----------------------------------------------------------------------------
-- payment_events — the only usable index today is uq_payment_event, which is
-- keyed on (provider, event_id). That serves an exact event lookup and nothing
-- else.
--
-- The order detail must ALSO find rows whose event_id cannot be derived from
-- the order string: the `note:<order>:<md5>` chain and the `rrn:` / `intref:`
-- claim rows. Those carry the order inside the payload instead, so the
-- expression index is what makes that query an index hit rather than a scan of
-- every event ever recorded.
-- -----------------------------------------------------------------------------
create index if not exists idx_payment_events_order
  on public.payment_events (provider, (payload_json ->> 'order'));

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  v_missing text[] := '{}'::text[];
  v_name    text;
begin
  foreach v_name in array array[
    'idx_payments_created',
    'idx_payments_status_created',
    'idx_payments_profile_created',
    'idx_payments_checkout_session',
    'idx_payments_olympiad_purchase',
    'idx_checkout_owner_created',
    'idx_payment_events_order'
  ] loop
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = v_name
    ) then
      v_missing := v_missing || v_name;
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception '145: missing indexes: %', array_to_string(v_missing, ', ');
  end if;

  -- The two uniqueness guarantees the finance reads depend on must still exist:
  -- an order string has to resolve to at most one session and one payment, or
  -- the order detail page would silently show one of several.
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and indexname='uq_payments_provider_ref') then
    raise exception '145: uq_payments_provider_ref is missing';
  end if;
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and indexname='uq_checkout_provider_session') then
    raise exception '145: uq_checkout_provider_session is missing';
  end if;

  raise notice '145: seven finance indexes present; order uniqueness intact';
end $$;

commit;
