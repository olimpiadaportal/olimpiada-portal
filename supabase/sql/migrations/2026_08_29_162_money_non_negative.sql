-- =============================================================================
-- 2026_08_29_162 — MONEY CANNOT GO NEGATIVE, AND THE DATABASE IS WHAT SAYS SO.
--
-- ASKED FOR before a deployment: make sure no price field in the admin panel can
-- be set below zero.
--
-- THE APP LAYER WAS ALREADY GOOD, AND THAT WAS NOT ENOUGH. The subject-price
-- rail validates in three places — an HTML min, a string-shape parser
-- (parsePriceAmount, which has no optional sign so "-5" fails before any
-- Number() call), and admin_upsert_subject_price re-checking `p_amount <= 0` in
-- the database. It is well built. It is also not a boundary, because:
--
--   subjects_pricing's RLS write policy is
--     for all to authenticated using (public.is_admin()) with check (public.is_admin())
--   (010_rls_policies.sql:672-674), and olympiad_packages' is identical
--   (015_olympiad_preparation.sql:744-745).
--
-- That grants plain table INSERT/UPDATE to any signed-in administrator. So
--     PATCH /rest/v1/subjects_pricing?id=eq.<id>   {"price_amount": -5}
-- with an admin session succeeds today. The RPC and the parser are the PANEL's
-- path, not the only path. An audit of every money column found exactly ONE
-- bounding CHECK constraint in the whole schema (ck_checkout_intent_shape, and
-- it only fires when intent_kind is not null) — every other money column could
-- hold a negative.
--
-- WHAT A NEGATIVE PRICE ACTUALLY DID, so the severity is on the record rather
-- than assumed: it silently converted a paid product into a free one. The
-- free-access rail gates on `if v_due is null or v_due > 0 then raise
-- payment_required` (011:6003, 011:13162, 011:13202) — a negative is not > 0,
-- so it passed and access was granted with no payment. The paid rail is safe in
-- the other direction (checkout_intent_open refuses `v_due <= 0`, 011:12525), so
-- a negative could never open a CHARGE. Bounded harm, wrong behaviour.
--
-- >= 0 IS NOT THE RIGHT RULE EVERYWHERE, so each constraint below states which
-- it uses and why. Getting this uniform would have been worse than the bug:
--   * subjects_pricing  -> > 0. admin_upsert_subject_price already refuses 0
--     (011:4018), so this matches shipped behaviour. A genuinely free subject is
--     delivered through the free-access / giveaway rail, not by pricing it at
--     zero.
--   * olympiad_packages -> >= 0. A zero-priced package is a LIVE concept:
--     purchase_olympiad_if_free (011:5984) exists precisely to deliver one.
--   * subscription_subjects -> >= 0. admin_grant_child_access writes a literal 0
--     for a comped grant (011:5631).
--   * payments -> >= 0. A refund is modelled as a STATUS, not a sign
--     (olympiad_purchases.status carries 'refunded', 015:127). If a refund
--     LEDGER is ever added that writes signed rows, this is the constraint to
--     revisit — deliberately, not by surprise.
--   * subscription_changes.prorated_amount -> >= 0. True today because
--     proration is retired, removals never refund (007:270-276) and reinstate
--     always carries 0 (007:277-281). NAMED HERE because a future credit or
--     refund feature would legitimately want negatives, and would have to drop
--     this constraint on purpose rather than discover it.
--   * percentages -> between 0 and 100, which also catches a fraction written
--     as 0.15 where 15 was meant.
--
-- PREFLIGHTED AGAINST PRODUCTION before this file was written: all twelve
-- checks returned 0 violating rows, so every constraint below validates against
-- existing data. The tables are small enough that a plain ADD CONSTRAINT scan is
-- instant; NOT VALID / VALIDATE would be the right shape on a large table.
--
-- Idempotent: every constraint is added only if absent, so a re-run is a no-op.
--
-- Environment first applied: staging
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 007_subscriptions_payments_coupons.sql — subjects_pricing,
--            payments, checkout_sessions, child_subscriptions,
--            subscription_subjects, subscription_changes, sibling_discounts,
--            coupons, subscription_plans
--          * 015_olympiad_preparation.sql — olympiad_packages, olympiad_purchases
-- Backport status: completed
-- Destructive change: no. Adds constraints only; no row is read, written or
--          deleted. Rollback = drop the constraints.
-- =============================================================================
begin;

do $$
declare
  -- table, constraint name, predicate. Kept as data so the guard logic is
  -- written once and every constraint is added on identical terms.
  v_specs text[][] := array[
    ['subjects_pricing',      'ck_subjects_pricing_amount',   'price_amount > 0'],
    ['olympiad_packages',     'ck_olympiad_packages_price',   'price_amount >= 0'],
    ['olympiad_purchases',    'ck_olympiad_purchases_amount', 'amount >= 0'],
    ['payments',              'ck_payments_amount',           'amount >= 0'],
    ['checkout_sessions',     'ck_checkout_amount_positive',  'amount is null or amount > 0'],
    ['child_subscriptions',   'ck_child_subs_amounts',
      'coalesce(base_amount,0) >= 0 and coalesce(discount_amount,0) >= 0 and coalesce(total_amount,0) >= 0'],
    ['child_subscriptions',   'ck_child_subs_sibling_pct',
      'sibling_discount_percent is null or sibling_discount_percent between 0 and 100'],
    ['subscription_subjects', 'ck_sub_subjects_price',        'price_amount is null or price_amount >= 0'],
    ['subscription_changes',  'ck_sub_changes_amounts',
      'coalesce(prorated_amount,0) >= 0 and coalesce(recurring_before,0) >= 0 and coalesce(recurring_after,0) >= 0 and (discount_percent is null or discount_percent between 0 and 100)'],
    ['sibling_discounts',     'ck_sibling_discounts_pct',
      'discount_percent is null or discount_percent between 0 and 100'],
    ['coupons',               'ck_coupons_value',             'value is null or value >= 0'],
    ['subscription_plans',    'ck_subscription_plans_price',  'price_amount is null or price_amount >= 0']
  ];
  v_tbl   text;
  v_name  text;
  v_pred  text;
  v_added int := 0;
  i       int;
begin
  for i in 1 .. array_length(v_specs, 1) loop
    v_tbl  := v_specs[i][1];
    v_name := v_specs[i][2];
    v_pred := v_specs[i][3];

    -- A table that does not exist here is not an error: coupons and
    -- subscription_plans are dormant/deprecated and could be dropped later.
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = v_tbl
    ) then
      raise notice '162: %  — table absent, skipped', v_tbl;
      continue;
    end if;

    if exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = v_tbl and c.conname = v_name
    ) then
      continue;  -- already present; re-run is a no-op
    end if;

    execute format('alter table public.%I add constraint %I check (%s)',
                   v_tbl, v_name, v_pred);
    v_added := v_added + 1;
  end loop;

  raise notice '162: % money constraint(s) added', v_added;
end;
$$;

-- -----------------------------------------------------------------------------
-- VERIFICATION. Prove the constraints EXIST, and prove one of them actually
-- BITES — a constraint that is present but somehow not enforced would be worse
-- than none, because it would be trusted.
-- -----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_bit     boolean := false;
begin
  select string_agg(want.name, ', ' order by want.name) into v_missing
  from (values
    ('ck_subjects_pricing_amount'), ('ck_olympiad_packages_price'),
    ('ck_olympiad_purchases_amount'), ('ck_payments_amount'),
    ('ck_checkout_amount_positive'), ('ck_child_subs_amounts'),
    ('ck_child_subs_sibling_pct'), ('ck_sub_subjects_price'),
    ('ck_sub_changes_amounts'), ('ck_sibling_discounts_pct')
  ) as want(name)
  where not exists (
    select 1 from pg_constraint where conname = want.name
  );
  if v_missing is not null then
    raise exception '162: constraints missing after apply: %', v_missing;
  end if;

  -- Does the subject-price rule actually refuse a negative? Rolled back either
  -- way; this only asks Postgres whether the rule is live.
  begin
    update public.subjects_pricing set price_amount = -1
     where id = (select id from public.subjects_pricing limit 1);
    -- reaching here means it was ACCEPTED
  exception when check_violation then
    v_bit := true;
  end;
  if not v_bit and exists (select 1 from public.subjects_pricing) then
    raise exception
      '162: a negative subject price was accepted — the constraint is not enforcing';
  end if;
  raise exception 'rollback_probe';  -- never commit the probe's UPDATE
exception when others then
  if sqlerrm <> 'rollback_probe' then
    raise;
  end if;
  raise notice '162: money constraints present, and a negative price is refused';
end;
$$;

commit;
