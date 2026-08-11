-- =============================================================================
-- 2026_08_11_109_per_subject_billing_interval.sql
-- =============================================================================
-- PER-SUBJECT BILLING CYCLES (investor requirement).
--
-- THE PROBLEM
-- -----------
-- `child_subscriptions.interval` is ONE value for the whole plan, and
-- `subscription_subjects` carries no interval, no price and no period at all.
-- Every pricing path -- quote_child_subscription, create_child_subscription,
-- quote_subject_change, apply_subject_change, add/remove_subscription_subject,
-- admin_grant_child_access -- joins `subjects_pricing` on
-- `sp.interval = cs.interval`. "Riyaziyyat weekly + Ingilis dili yearly on one
-- child" is therefore not a UI change; it cannot be expressed by the schema.
--
-- THE MODEL
-- ---------
-- Each subject owns its CYCLE **and its PERIOD**. An interval alone is not
-- enough: a weekly and a yearly subject cannot share one
-- `cs.current_period_end`. So `subscription_subjects` gains `interval`,
-- `pending_interval`, `current_period_start`, `current_period_end`,
-- `price_amount` and `currency` -- all nullable, all backfilled once here, all
-- coalesce-guarded on read, so every existing row and every existing caller
-- keeps working untouched.
--
-- `child_subscriptions` becomes the CONTAINER:
--   * `interval`           -> the DEFAULT cycle for newly added subjects and
--                             the fallback for `ss.interval IS NULL`. It is no
--                             longer the renewal anchor. Stays NOT NULL: the
--                             admin filter, the mobile `billing_interval` field
--                             and admin_grant_child_access all depend on it.
--   * `current_period_end` -> the **MAX** of the subjects' period ends, i.e.
--                             "coverage ends". This is what every existing
--                             lifecycle consumer already means
--                             (recompute_child_access, cancel, admin
--                             expire/extend, uq_child_subscriptions_live), and
--                             it is the reason a lapsing WEEKLY subject can
--                             never expire a paid YEARLY one.
--   * `next_renewal_at`    -> the **MIN**, i.e. "next charge".
--   * base/discount/total  -> the NEXT INVOICE (the subjects renewing at
--                             `next_renewal_at`).
-- For today's single-interval data MAX = MIN = the old value and the amounts
-- are byte-identical, so legacy rows do not move.
--
-- Consequences, deliberate and owner-visible:
--   * PRORATION FOR ADDITIONS IS RETIRED. With per-subject periods there is no
--     shared period left to prorate into -- a newly added subject opens its own
--     full cycle at now() and is charged its full first-cycle price (and
--     receives that full cycle). `subscription_changes` keeps its shape;
--     `remaining_ratio`/`period_days` stay in the payload as 1/null for
--     contract compatibility, and `prorated_amount` on an 'add' is now the FULL
--     first-cycle price.
--   * REMOVALS ARE UNCHANGED: no refund, access to THAT SUBJECT'S own period
--     end.
--   * CHANGING an already-paid subject's cycle is SCHEDULED into
--     `pending_interval` and applies at that subject's renewal -- never a
--     refund, never a surprise charge, one rule in both directions. Selecting
--     the cycle the subject is already paid on CANCELS a schedule instead of
--     storing a no-op, so a mis-click is always undoable.
--
-- WHO APPLIES A SCHEDULED CYCLE
-- -----------------------------
-- `apply_due_plan_changes()` (below, scheduled hourly in 016). It is the only
-- reader of `pending_interval`, and without it the column would be write-only:
-- the parent's choice would be stored and never take effect. It promotes
-- pending -> interval and re-freezes `price_amount` once that subject's paid
-- period ends. It DOES NOT renew: no period is extended and no access is
-- granted, because there is no payment provider yet (every path here still ends
-- at the TODO(real-provider) seam and returns 'charged', false) and a job that
-- silently extended periods would make every plan free and perpetual.
--
-- Backport targets: 007 (columns), 011 (indexes + trigger + RPCs + the rollover
-- function), 013 (new checks 91/92/95), 016 (the hourly rollover schedule). 010
-- needs nothing -- `sub_subjects_select` already scopes by the parent
-- subscription and writes are already admin/service only.
--
-- Safe to rerun: yes (add column if not exists / create or replace / drop
-- trigger if exists + create; the backfill is `where interval is null`).
--
-- This file self-transacts. It is a MIGRATION and must NEVER be `\i`-ed inside
-- a from-zero rebuild proof -- that is exactly the failure CLAUDE.md documents.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) subscription_subjects: the per-subject cycle, period and frozen price.
-- -----------------------------------------------------------------------------
alter table public.subscription_subjects
  add column if not exists interval             public.plan_interval,
  add column if not exists pending_interval     public.plan_interval,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end   timestamptz,
  add column if not exists price_amount         numeric(12,2),
  add column if not exists currency             text not null default 'AZN';

comment on column public.subscription_subjects.interval is
  'This subject''s OWN billing cycle. NULL = inherit child_subscriptions.interval — every row written before migration 109 is backfilled, and NULL stays legal so an older writer cannot break.';
comment on column public.subscription_subjects.pending_interval is
  'Cycle change SCHEDULED for this subject''s next renewal. NULL = none. Never refunds and never charges immediately — one rule for upgrade and downgrade alike.';
comment on column public.subscription_subjects.current_period_start is
  'Start of THIS subject''s own cycle. NULL = inherit the subscription''s (legacy rows).';
comment on column public.subscription_subjects.current_period_end is
  'End of THIS subject''s own cycle — the per-subject access bound and the per-subject renewal date. NULL = inherit the subscription''s (legacy rows), which is why every access gate reads coalesce(ss.current_period_end, cs.current_period_end).';
comment on column public.subscription_subjects.price_amount is
  'List price frozen from subjects_pricing when this cycle opened. NULL = re-read live pricing (legacy rows).';

-- -----------------------------------------------------------------------------
-- 2) child_subscriptions: the container gains the "next charge" date.
-- -----------------------------------------------------------------------------
alter table public.child_subscriptions
  add column if not exists next_renewal_at timestamptz;

comment on column public.child_subscriptions.next_renewal_at is
  'MIN of the live subjects'' period ends — the NEXT charge date. current_period_end is the MAX (coverage ends); the two are equal for every single-interval plan. Written only by trg_sync_subscription_period.';

-- -----------------------------------------------------------------------------
-- 3) One-time backfill. This is what makes the sync trigger NON-CIRCULAR: once
--    every row carries its own interval/period, the trigger never has to read
--    child_subscriptions to resolve a NULL.
-- -----------------------------------------------------------------------------
update public.subscription_subjects ss
   set interval             = cs.interval,
       current_period_start = cs.current_period_start,
       current_period_end   = coalesce(ss.remove_at, cs.current_period_end),
       price_amount         = (
         select sp.price_amount
         from public.subjects_pricing sp
         where sp.subject_id = ss.subject_id
           and sp.interval = cs.interval
           and sp.status = 'active'
         limit 1),
       currency             = coalesce(cs.currency, 'AZN')
  from public.child_subscriptions cs
 where cs.id = ss.child_subscription_id
   and ss.interval is null;

-- -----------------------------------------------------------------------------
-- 4) subscription_changes: a third change type + the cycle it applied to.
-- -----------------------------------------------------------------------------
alter table public.subscription_changes
  add column if not exists interval public.plan_interval;

alter table public.subscription_changes
  drop constraint if exists subscription_changes_change_type_check;
alter table public.subscription_changes
  add constraint subscription_changes_change_type_check
  check (change_type in ('add', 'remove', 'plan_change'));

comment on column public.subscription_changes.interval is
  'The cycle this ledger row applied to. On an ''add'' prorated_amount is now the FULL first-cycle price (migration 109 retired mid-cycle proration — the subject also receives a full cycle), so a disputed charge stays reconstructible.';

-- -----------------------------------------------------------------------------
-- 5) The sync trigger. It is the ONLY writer of child_subscriptions'
--    current_period_end / next_renewal_at / base_amount / discount_amount /
--    total_amount — an RPC that also assigned them would drift from it within
--    one release, which is precisely the bug class 013 check 92 watches for.
-- -----------------------------------------------------------------------------
create or replace function public.fn_sync_subscription_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub  uuid;
  v_max  timestamptz;
  v_min  timestamptz;
  v_base numeric(12,2);
  v_pct  numeric(5,2);
begin
  -- OLD is UNASSIGNED (not null) during an INSERT, so reading it there raises
  -- "record old is not assigned yet" — branch on TG_OP rather than coalescing.
  if tg_op = 'DELETE' then
    v_sub := old.child_subscription_id;
  else
    v_sub := new.child_subscription_id;
  end if;
  if v_sub is null then return null; end if;

  select sibling_discount_percent into v_pct
  from public.child_subscriptions where id = v_sub;
  -- The parent row is gone (cascade delete): nothing to reconcile.
  if not found then return null; end if;

  select max(ss.current_period_end),
         min(ss.current_period_end) filter (where ss.remove_at is null)
    into v_max, v_min
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub;

  -- The NEXT invoice = the subjects whose cycle ends first. A NULL period end
  -- (legacy row that still inherits) falls into the group so the amount never
  -- silently drops a paid subject.
  select coalesce(sum(ss.price_amount), 0) into v_base
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub
    and ss.remove_at is null
    and (v_min is null or ss.current_period_end is not distinct from v_min);

  update public.child_subscriptions cs
     set current_period_end = coalesce(v_max, cs.current_period_end),
         next_renewal_at    = v_min,
         base_amount        = v_base,
         discount_amount    = round(v_base * coalesce(v_pct, 0) / 100.0, 2),
         total_amount       = v_base - round(v_base * coalesce(v_pct, 0) / 100.0, 2),
         updated_at         = now()
   where cs.id = v_sub;

  return null;
end;
$$;

comment on function public.fn_sync_subscription_period() is
  'Migration 109: derives child_subscriptions.current_period_end (MAX = coverage ends), next_renewal_at (MIN = next charge) and base/discount/total_amount (the NEXT invoice) from the per-subject rows. THE ONLY WRITER of those five columns — coalesce keeps a legacy row''s stored period when every subject period is still NULL, so the trigger can never blank a row.';

drop trigger if exists trg_sync_subscription_period on public.subscription_subjects;
create trigger trg_sync_subscription_period
  after insert or update or delete on public.subscription_subjects
  for each row
  execute function public.fn_sync_subscription_period();

-- -----------------------------------------------------------------------------
-- 5b) PRIME the derived columns on rows that already existed.
--
-- Step 3 backfilled subscription_subjects BEFORE this trigger existed, so no
-- pre-existing subscription ever had its five derived columns computed.
-- current_period_end looked correct only by coincidence — the backfill copied
-- cs.current_period_end onto every subject, so MAX equalled the value already
-- stored — while next_renewal_at (the MIN, i.e. the next CHARGE date and the
-- amount shown with it) stayed NULL. Validation check 92 caught exactly this.
--
-- A no-op UPDATE is the right instrument: it re-fires the trigger, so the ONE
-- definition of these columns stays the only writer rather than being restated
-- here where it could drift. Touching only rows that still need it keeps a
-- re-run of this migration cheap.
-- -----------------------------------------------------------------------------
update public.subscription_subjects ss
   -- Self-assignment: the row is unchanged, the AFTER trigger still fires.
   -- (There is no updated_at on this table — added_at is the stable no-op.)
   set added_at = ss.added_at
 where exists (
   select 1 from public.child_subscriptions cs
    where cs.id = ss.child_subscription_id
      and (cs.next_renewal_at is distinct from (
             select min(x.current_period_end)
               from public.subscription_subjects x
              where x.child_subscription_id = cs.id
                and x.remove_at is null)
           or cs.current_period_end is distinct from (
             select max(x.current_period_end)
               from public.subscription_subjects x
              where x.child_subscription_id = cs.id)));

-- -----------------------------------------------------------------------------
-- 6) Indexes for the two new access paths: per-subject period lookups and the
--    expiry/renewal scan.
-- -----------------------------------------------------------------------------
create index if not exists idx_sub_subjects_period
  on public.subscription_subjects (child_subscription_id, current_period_end);
create index if not exists idx_child_subs_next_renewal
  on public.child_subscriptions (next_renewal_at)
  where status in ('trialing', 'active', 'past_due');

-- =============================================================================
-- 7) The per-subject plan RPCs. The six legacy functions become thin wrappers
--    over these, so there is exactly ONE implementation of the pricing math.
-- =============================================================================

-- ---- the single input gate ---------------------------------------------------
-- Everything client-supplied enters here and nowhere else: no other new
-- function parses jsonb. Prices are never accepted — only ids and cycles.
create or replace function public.plan_items_normalize(p_items jsonb)
-- `interval` is a reserved type keyword, so it cannot be a bare RETURNS TABLE
-- column name — the parser reads it as the start of a type. Quoting the
-- DECLARATION is enough: qualified reads (n.interval) still resolve unquoted,
-- so all 31 call sites are untouched.
returns table (subject_id uuid, "interval" public.plan_interval)
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'plan: items must be a json array'
      using errcode = 'check_violation', hint = 'bad_items';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'plan: too many subjects'
      using errcode = 'check_violation', hint = 'too_many_subjects';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(v)
    where jsonb_typeof(e.v) <> 'object'
  ) then
    raise exception 'plan: item must be an object'
      using errcode = 'check_violation', hint = 'bad_items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(v)
    where coalesce(e.v ->> 'subject_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'plan: bad subject id'
      using errcode = 'check_violation', hint = 'bad_subject';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(v)
    where coalesce(e.v ->> 'interval', '') not in ('week', 'month', 'year')
  ) then
    raise exception 'plan: bad interval'
      using errcode = 'check_violation', hint = 'bad_interval';
  end if;

  -- LAST occurrence wins: a UI that appends a changed cycle must not have to
  -- rewrite the array it already sent.
  return query
    select distinct on ((e.v ->> 'subject_id')::uuid)
           (e.v ->> 'subject_id')::uuid,
           (e.v ->> 'interval')::public.plan_interval
    from jsonb_array_elements(p_items) with ordinality as e(v, ord)
    order by (e.v ->> 'subject_id')::uuid, e.ord desc;
end;
$$;

comment on function public.plan_items_normalize(jsonb) is
  'Migration 109: the ONE server-side gate for a client-supplied plan basket. Enforces array shape, <=20 items, UUID-shaped subject_id and the plan_interval whitelist, de-duplicating on subject_id (last wins). Raises check_violation with hints bad_items / bad_subject / bad_interval / too_many_subjects.';

-- ---- read-only quote for a full basket ---------------------------------------
create or replace function public.quote_child_plan(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_rank    int;
  v_pct     numeric(5,2);
  v_missing int;
  v_count   int;
  v_base    numeric(12,2);
  v_disc    numeric(12,2);
  v_total   numeric(12,2);
  v_trial   int;
  v_items   jsonb;
  v_groups  jsonb;
  v_ivs     int;
begin
  select count(*) into v_count from public.plan_items_normalize(p_items);
  if v_count = 0 then raise exception 'quote: no subjects selected'; end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'quote: child has no owning parent'; end if;

  -- Every (subject, ITS OWN cycle) pair must have active pricing. Same message
  -- shape as the single-interval quote so existing mappers keep working.
  select count(*) into v_missing
  from public.plan_items_normalize(p_items) n
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = n.subject_id
      and sp.interval = n.interval
      and sp.status = 'active');
  if v_missing > 0 then raise exception 'quote: missing pricing for % subject(s)', v_missing; end if;

  -- Sibling rank = (this parent's OTHER children already on a live
  -- subscription) + 1. Copied verbatim from quote_child_subscription: a fixed
  -- percent composes trivially across cycle groups.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  select jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id,
           'interval',   n.interval,
           'price',      sp.price_amount,
           'currency',   'AZN'))
    into v_items
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  -- Per-cycle groups, each rounded with EXACTLY today's rule
  -- (discount = round(group_base * pct / 100, 2)).
  with g as (
    select n.interval as iv,
           count(*)::int as cnt,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    group by n.interval)
  select jsonb_object_agg(g.iv, jsonb_build_object(
           'count', g.cnt,
           'base',  g.base,
           'discount', round(g.base * v_pct / 100.0, 2),
           'total', g.base - round(g.base * v_pct / 100.0, 2))),
         coalesce(sum(g.base), 0),
         coalesce(sum(round(g.base * v_pct / 100.0, 2)), 0),
         count(*)::int
    into v_groups, v_base, v_disc, v_ivs
  from g;

  v_total := v_base - v_disc;

  select coalesce(trial_days, 7) into v_trial from public.launch_promo_config where id = 1;
  v_trial := coalesce(v_trial, 7);

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'groups', coalesce(v_groups, '{}'::jsonb),
    'base', v_base, 'discount_percent', v_pct, 'discount', v_disc,
    'total', v_total, 'rank', v_rank, 'trial_days', v_trial, 'currency', 'AZN',
    'mixed', coalesce(v_ivs, 0) > 1);
end;
$$;

comment on function public.quote_child_plan(uuid, jsonb) is
  'Migration 109: read-only price quote for a PER-SUBJECT basket [{subject_id, interval}]. Prices are re-read from subjects_pricing; the sibling discount (2nd 10% / 3rd+ 15%) is applied per cycle group with today''s rounding rule, so a uniform basket returns exactly the number quote_child_subscription always returned.';

-- ---- create the subscription -------------------------------------------------
create or replace function public.create_child_plan(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner    uuid;
  v_q        jsonb;
  v_sub      uuid;
  v_trial    int;
  v_child    text;
  v_auth     uuid;
  v_had_any  boolean;
  v_status   public.subscription_status;
  v_default  public.plan_interval;
  v_trialend timestamptz;
  v_row      record;
begin
  -- Round 48 kill switch (migration 089): no paid write while the payment mode
  -- is off. Defence in depth -- the web/BFF layer checks too, but this is the
  -- layer that cannot be forgotten.
  perform public.assert_payments_enabled();

  select created_by_parent_profile_id, child_unique_id
    into v_owner, v_child
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'create: child has no owning parent'; end if;

  -- Serialize all subscription writes of ONE family: prevents the double-submit
  -- duplicate row and the concurrent sibling-rank race (audit C2 + M14).
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 42));

  if exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
      and status in ('trialing', 'active', 'past_due')
  ) then
    raise exception 'create: child already has a live subscription'
      using errcode = 'unique_violation';
  end if;

  v_q := public.quote_child_plan(p_student_profile_id, p_items);

  -- The DEFAULT cycle for subjects added later = the most common cycle in the
  -- basket; ties resolve year > month > week (the longer commitment is the
  -- safer default to inherit).
  select n.interval into v_default
  from public.plan_items_normalize(p_items) n
  group by n.interval
  order by count(*) desc,
           case n.interval when 'year' then 3 when 'month' then 2 else 1 end desc
  limit 1;

  -- Trial once per child: any prior subscription row (canceled/expired
  -- included) means no new free trial (audit C2).
  v_had_any := exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id);
  if v_had_any then
    v_trial  := 0;
    v_status := 'active';
  else
    v_trial  := (v_q->>'trial_days')::int;
    v_status := 'trialing';
  end if;
  v_trialend := now() + (v_trial || ' days')::interval;

  -- base/discount/total/current_period_end/next_renewal_at are DELIBERATELY not
  -- written here: trg_sync_subscription_period derives all five from the
  -- per-subject rows inserted below.
  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     trial_started_at, trial_ends_at, current_period_start,
     sibling_discount_percent, currency, provider)
  values
    (p_student_profile_id, v_owner, v_default, v_status,
     case when v_status = 'trialing' then now() end,
     case when v_status = 'trialing' then v_trialend end,
     now(),
     (v_q->>'discount_percent')::numeric, 'AZN', 'none')
  returning id into v_sub;

  for v_row in
    select n.subject_id, n.interval, sp.price_amount
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
  loop
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values
      (v_sub, v_row.subject_id, v_row.interval, v_row.price_amount, 'AZN',
       now(),
       case when v_status = 'trialing' then v_trialend
            else now() + case v_row.interval
                           when 'week'  then interval '7 days'
                           when 'month' then interval '1 month'
                           else              interval '1 year'
                         end
       end)
    on conflict do nothing;
  end loop;

  if (v_q->>'discount_percent')::numeric > 0 then
    insert into public.sibling_discounts
      (owner_parent_profile_id, child_subscription_id, child_rank, discount_percent)
    values (v_owner, v_sub, (v_q->>'rank')::int, (v_q->>'discount_percent')::numeric);
  end if;

  -- Allocate the deferred 8-digit login ID now (first plan chosen) if the child
  -- has none, and backfill the credential mapping so child login works.
  if v_child is null then
    v_child := public.allocate_child_unique_id(p_student_profile_id);
    update public.child_credentials
       set child_unique_id = v_child, updated_at = now()
     where student_profile_id = p_student_profile_id;
  end if;

  select auth_user_id into v_auth
  from public.child_credentials where student_profile_id = p_student_profile_id;

  update public.students
     set access_status = case when v_status = 'trialing' then 'trialing' else 'active' end::public.child_access_status
   where profile_id = p_student_profile_id;

  return v_q || jsonb_build_object(
    'subscription_id', v_sub, 'status', v_status::text, 'trial_days', v_trial,
    'interval', v_default::text,
    'new_child_unique_id', v_child, 'auth_user_id', v_auth);
end;
$$;

comment on function public.create_child_plan(uuid, jsonb) is
  'Migration 109: starts a child subscription from a PER-SUBJECT basket. Each subject opens its own period (trial end while trialing, else now() + its own cycle); child_subscriptions.interval stores only the DEFAULT cycle for future adds. The amount columns are left to trg_sync_subscription_period.';

-- ---- diff-and-quote a desired full set ---------------------------------------
create or replace function public.quote_plan_change(
  p_student_profile_id uuid,
  p_items              jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub        public.child_subscriptions%rowtype;
  v_owner      uuid;
  v_rank       int;
  v_pct        numeric(5,2);
  v_cur_base   numeric(12,2);
  v_next_base  numeric(12,2);
  v_added_base numeric(12,2);
  v_due        numeric(12,2) := 0;
  v_items      jsonb;
  v_groups     jsonb;
  v_renewals   jsonb;
  v_removals   jsonb;
  v_changes    jsonb;
  v_ivs        int;
  v_remaining  int;
begin
  select * into v_sub
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'subject_change: no active subscription' using errcode = 'no_data_found';
  end if;
  v_owner := v_sub.owner_parent_profile_id;

  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- CURRENT recurring set = live subjects, each priced on ITS OWN cycle.
  select coalesce(sum(sp.price_amount), 0) into v_cur_base
  from public.subscription_subjects ss
  join public.subjects_pricing sp
    on sp.subject_id = ss.subject_id
   and sp.interval = coalesce(ss.interval, v_sub.interval)
   and sp.status = 'active'
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null;

  -- ADDS = desired subjects not currently covered. Each buys a FULL first cycle
  -- (proration retired — see the file header).
  select coalesce(sum(sp.price_amount), 0) into v_added_base
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
  where not exists (
    select 1 from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.subject_id = n.subject_id
      and ss.remove_at is null);

  -- NEXT recurring set = the desired set, priced on the desired cycles.
  select coalesce(sum(sp.price_amount), 0) into v_next_base
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  select jsonb_agg(jsonb_build_object(
           'subject_id', n.subject_id, 'interval', n.interval,
           'price', sp.price_amount, 'currency', v_sub.currency))
    into v_items
  from public.plan_items_normalize(p_items) n
  join public.subjects_pricing sp
    on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active';

  with g as (
    select n.interval as iv, count(*)::int as cnt,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    group by n.interval)
  select jsonb_object_agg(g.iv, jsonb_build_object(
           'count', g.cnt, 'base', g.base,
           'discount', round(g.base * v_pct / 100.0, 2),
           'total', g.base - round(g.base * v_pct / 100.0, 2))),
         count(*)::int
    into v_groups, v_ivs
  from g;

  -- due_now: the ADDS only, at the sibling rate, rounded per cycle group. A
  -- trial charges nothing (the adds ride the trial like every other subject).
  if v_sub.status <> 'trialing' then
    with g as (
      select n.interval as iv, coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
      from public.plan_items_normalize(p_items) n
      join public.subjects_pricing sp
        on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
      where not exists (
        select 1 from public.subscription_subjects ss
        where ss.child_subscription_id = v_sub.id
          and ss.subject_id = n.subject_id
          and ss.remove_at is null)
      group by n.interval)
    select coalesce(sum(g.base - round(g.base * v_pct / 100.0, 2)), 0) into v_due from g;
  end if;

  -- Per-cycle renewal sentences, built from the DESIRED basket. Reading the
  -- STORED rows here is what told a parent who had just moved a subject to
  -- yearly that they would renew at the WEEKLY amount: p_items already carries
  -- the chosen cycle (and, for an untouched subject, its pending_interval --
  -- both wrappers compose it that way), so the sentence now describes the plan
  -- the parent is about to have instead of the one they are leaving.
  -- An already-covered subject renews at ITS OWN period end; a newly added one
  -- opens a full cycle at now(), which is exactly what apply_plan_change writes.
  with r as (
    select n.interval as iv,
           min(case
                 when ss.subject_id is null
                   then now() + case n.interval
                                  when 'week'  then interval '7 days'
                                  when 'month' then interval '1 month'
                                  else              interval '1 year'
                                end
                 else coalesce(ss.current_period_end, v_sub.current_period_end)
               end) as next_at,
           coalesce(sum(sp.price_amount), 0)::numeric(12,2) as base
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    left join public.subscription_subjects ss
      on ss.child_subscription_id = v_sub.id
     and ss.subject_id = n.subject_id
     and ss.remove_at is null
    group by n.interval)
  select jsonb_agg(jsonb_build_object(
           'interval', r.iv, 'next_at', r.next_at,
           'total', r.base - round(r.base * v_pct / 100.0, 2)))
    into v_renewals from r;

  -- REMOVES = covered but absent from the desired set; each keeps access to ITS
  -- OWN period end (never the subscription's).
  select jsonb_agg(jsonb_build_object(
           'subject_id', ss.subject_id,
           'remove_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
    into v_removals
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null
    and not exists (
      select 1 from public.plan_items_normalize(p_items) n
      where n.subject_id = ss.subject_id);

  -- PLAN CHANGES = covered with a different cycle; scheduled, never charged.
  -- The comparison basis is the EFFECTIVE cycle -- pending_interval when one is
  -- already scheduled -- so re-selecting the ORIGINAL cycle is itself a change
  -- (it CANCELS the schedule). Comparing against ss.interval alone locked in a
  -- parent who mis-clicked 'yearly': the diff came back empty, Save stayed
  -- disabled and nothing could unschedule the change.
  select jsonb_agg(jsonb_build_object(
           'subject_id', ss.subject_id,
           'from', coalesce(ss.pending_interval, ss.interval, v_sub.interval),
           'to', n.interval,
           'effective_at', coalesce(ss.current_period_end, v_sub.current_period_end)))
    into v_changes
  from public.subscription_subjects ss
  join public.plan_items_normalize(p_items) n on n.subject_id = ss.subject_id
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null
    and n.interval is distinct from coalesce(ss.pending_interval, ss.interval, v_sub.interval);

  v_remaining := greatest(0, ceil(
    extract(epoch from (coalesce(v_sub.next_renewal_at, v_sub.current_period_end, now()) - now())) / 86400.0)::int);

  return jsonb_build_object(
    'items',    coalesce(v_items, '[]'::jsonb),
    'groups',   coalesce(v_groups, '{}'::jsonb),
    'renewals', coalesce(v_renewals, '[]'::jsonb),
    'removals_effective', coalesce(v_removals, '[]'::jsonb),
    'plan_changes', coalesce(v_changes, '[]'::jsonb),
    'mixed', coalesce(v_ivs, 0) > 1,
    -- Legacy contract keys: the web/BFF/mobile parsers still read these.
    'subscription_id',        v_sub.id,
    'status',                 v_sub.status,
    'interval',               v_sub.interval,
    'currency',               v_sub.currency,
    'discount_percent',       v_pct,
    'current_recurring_total', v_cur_base - round(v_cur_base * v_pct / 100.0, 2),
    'new_recurring_total',    v_next_base - round(v_next_base * v_pct / 100.0, 2),
    'due_now',                v_due,
    'prorated',               false,
    'proration_waived',       false,
    'added_base',             v_added_base,
    'remaining_ratio',        1,
    'days_remaining',         v_remaining,
    'period_days',            null,
    -- effective_from = the NEXT CHARGE date, which is what next_renewal_at (the
    -- MIN) genuinely means; the per-subject dates a cycle change takes effect on
    -- are in plan_changes[].effective_at.
    'effective_from',         coalesce(v_sub.next_renewal_at, v_sub.current_period_end),
    -- LEGACY SCALAR, superseded by removals_effective[] above. It used to be the
    -- subscription MIN, so removing a YEARLY subject from a plan that also held
    -- a weekly one told the parent access ended in 7 days while the DB granted a
    -- year. It is now the last of the REMOVED subjects' own dates, so an
    -- already-shipped binary can only ever overstate, never cut access short.
    'removals_effective_at',  coalesce(
      (select max((e.v ->> 'remove_at')::timestamptz)
         from jsonb_array_elements(coalesce(v_removals, '[]'::jsonb)) as e(v)),
      v_sub.next_renewal_at, v_sub.current_period_end));
end;
$$;

comment on function public.quote_plan_change(uuid, jsonb) is
  'Migration 109: diffs a DESIRED full per-subject basket against the live subscription into adds / removes / plan_changes and prices it. due_now = the adds'' full first cycles at the sibling rate (proration retired); a cycle change costs nothing now and applies at that subject''s renewal.';

-- ---- apply the diff ----------------------------------------------------------
create or replace function public.apply_plan_change(
  p_student_profile_id uuid,
  p_items              jsonb,
  p_idempotency_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote   jsonb;
  v_sub     public.child_subscriptions%rowtype;
  v_actor   uuid := public.current_profile_id();
  v_pct     numeric(5,2);
  v_before  numeric(12,2);
  v_after   numeric(12,2);
  v_left    int;
  v_prior   jsonb;
  v_adds    int;
  v_changes int;
  v_row     record;
begin
  -- Replay guard: the same batch key returns the original outcome untouched.
  if p_idempotency_key is not null then
    select jsonb_build_object('idempotent', true, 'applied_at', min(created_at))
      into v_prior
    from public.subscription_changes
    where idempotency_key = p_idempotency_key
      and student_profile_id = p_student_profile_id
    having count(*) > 0;
    if v_prior is not null then return v_prior; end if;
  end if;

  -- ONE source of truth for the numbers (preview == charged, audit H7).
  v_quote := public.quote_plan_change(p_student_profile_id, p_items);

  select count(*)::int into v_adds
  from public.plan_items_normalize(p_items) n
  where not exists (
    select 1 from public.subscription_subjects ss
    where ss.child_subscription_id = (v_quote->>'subscription_id')::uuid
      and ss.subject_id = n.subject_id
      and ss.remove_at is null);
  v_changes := jsonb_array_length(v_quote->'plan_changes');

  -- Round 48/51 kill switch: while payments are off a parent may still REMOVE
  -- subjects (never trap someone into paying), but may not ADD one — and a
  -- cycle change is a billing change, so it is blocked too.
  if v_adds > 0 or v_changes > 0 then
    perform public.assert_payments_enabled();
  end if;

  select * into v_sub from public.child_subscriptions
  where id = (v_quote->>'subscription_id')::uuid
  for update;

  v_pct    := (v_quote->>'discount_percent')::numeric;
  v_before := (v_quote->>'current_recurring_total')::numeric;
  v_after  := (v_quote->>'new_recurring_total')::numeric;

  -- ---- removals: keep access to THIS SUBJECT'S own period end --------------
  select count(*) into v_left
  from public.subscription_subjects ss
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null
    and exists (select 1 from public.plan_items_normalize(p_items) n
                 where n.subject_id = ss.subject_id);
  if v_left < 1 and v_adds < 1 then
    raise exception 'subject_change: at least one subject must remain'
      using errcode = 'check_violation', hint = 'last_subject';
  end if;

  for v_row in
    select ss.subject_id,
           coalesce(ss.current_period_end, v_sub.current_period_end, now()) as ends_at,
           coalesce(ss.interval, v_sub.interval) as iv
    from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and not exists (select 1 from public.plan_items_normalize(p_items) n
                       where n.subject_id = ss.subject_id)
  loop
    update public.subscription_subjects
       set remove_at = v_row.ends_at
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'remove',
       v_row.subject_id, v_row.iv, v_row.ends_at, 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- additions: a NEW full cycle anchored at now() -----------------------
  for v_row in
    select n.subject_id, n.interval as iv, sp.price_amount
    from public.plan_items_normalize(p_items) n
    join public.subjects_pricing sp
      on sp.subject_id = n.subject_id and sp.interval = n.interval and sp.status = 'active'
    where not exists (
      select 1 from public.subscription_subjects ss
      where ss.child_subscription_id = v_sub.id
        and ss.subject_id = n.subject_id
        and ss.remove_at is null)
  loop
    -- Un-schedule a pending removal instead of duplicating the row.
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values
      (v_sub.id, v_row.subject_id, v_row.iv, v_row.price_amount, v_sub.currency,
       now(),
       now() + case v_row.iv
                 when 'week'  then interval '7 days'
                 when 'month' then interval '1 month'
                 else              interval '1 year'
               end)
    on conflict (child_subscription_id, subject_id) do update
      set remove_at            = null,
          interval             = excluded.interval,
          pending_interval     = null,
          price_amount         = excluded.price_amount,
          current_period_start = excluded.current_period_start,
          current_period_end   = excluded.current_period_end;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'add',
       v_row.subject_id, v_row.iv, now(),
       round(coalesce(v_row.price_amount, 0) * (1 - v_pct / 100.0), 2),
       v_sub.currency, v_before, v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- ---- cycle changes: SCHEDULED only, never a refund, never a charge -------
  for v_row in
    select ss.subject_id,
           coalesce(ss.pending_interval, ss.interval, v_sub.interval) as from_iv,
           coalesce(ss.interval, v_sub.interval) as cur_iv,
           n.interval as to_iv,
           coalesce(ss.current_period_end, v_sub.current_period_end, now()) as ends_at
    from public.subscription_subjects ss
    join public.plan_items_normalize(p_items) n on n.subject_id = ss.subject_id
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and n.interval is distinct from coalesce(ss.pending_interval, ss.interval, v_sub.interval)
  loop
    -- Choosing the cycle the subject is ALREADY paid on CANCELS a scheduled
    -- change rather than scheduling a no-op, which is the only way back for a
    -- parent who picked the wrong cycle.
    update public.subscription_subjects
       set pending_interval =
             case when v_row.to_iv = v_row.cur_iv then null else v_row.to_iv end
     where child_subscription_id = v_sub.id and subject_id = v_row.subject_id;

    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency, recurring_before,
       recurring_after, discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'plan_change',
       v_row.subject_id, v_row.to_iv, v_row.ends_at, 0, v_sub.currency, v_before,
       v_after, v_pct, 1, null, p_idempotency_key, v_actor)
    on conflict do nothing;
  end loop;

  -- TODO(real-provider): capture (v_quote->>'due_now') through the PSP HERE,
  -- inside this transaction's boundary, then write the resulting payment id
  -- back onto the ledger rows and insert the matching public.payments row.
  -- NEVER accept the amount from a client.

  return v_quote || jsonb_build_object('applied', true, 'charged', false);
end;
$$;

comment on function public.apply_plan_change(uuid, jsonb, text) is
  'Migration 109: applies a DESIRED full per-subject basket atomically — adds open their own now()-anchored cycle, removals are scheduled for THAT subject''s own period end, cycle changes write pending_interval only. quote_plan_change is the single source of the numbers; assert_payments_enabled() gates adds and cycle changes while removals stay legal.';

-- ---- the boundary job: a scheduled cycle actually takes effect --------------
-- Without this, pending_interval is WRITE-ONLY: apply_plan_change stores the
-- parent's choice and nothing in the platform ever moves it into
-- subscription_subjects.interval, so "Riyaziyyat aylıq -> illik" is remembered
-- and never applied. This is the job that applies it, at that subject's own
-- period boundary.
--
-- DELIBERATELY NOT A RENEWAL. There is no payment provider yet (every path here
-- ends at the TODO(real-provider) seam and returns 'charged', false), so this
-- never extends a period, never grants access and never writes a payment --
-- doing so would silently turn every plan into a free perpetual one. It
-- promotes the scheduled cycle and re-freezes the price at the moment the paid
-- period ends, which is precisely the state the future charge has to read.
create or replace function public.apply_due_plan_changes()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   record;
  v_price numeric(12,2);
  v_n     int := 0;
begin
  for v_row in
    select ss.child_subscription_id, ss.subject_id, ss.pending_interval,
           ss.current_period_end, cs.student_profile_id,
           cs.owner_parent_profile_id, cs.currency, cs.sibling_discount_percent
    from public.subscription_subjects ss
    join public.child_subscriptions cs on cs.id = ss.child_subscription_id
    where ss.pending_interval is not null
      and ss.remove_at is null
      and ss.current_period_end is not null
      and ss.current_period_end <= now()
      and cs.status in ('trialing', 'active', 'past_due')
  loop
    select sp.price_amount into v_price
    from public.subjects_pricing sp
    where sp.subject_id = v_row.subject_id
      and sp.interval = v_row.pending_interval
      and sp.status = 'active';
    -- Pricing for the new cycle was archived: LEAVE the schedule in place. Both
    -- alternatives are worse -- dropping it discards the parent's decision, and
    -- promoting it anyway would freeze a NULL price into the next invoice.
    if v_price is null then continue; end if;

    update public.subscription_subjects
       set interval         = v_row.pending_interval,
           pending_interval = null,
           price_amount     = v_price
     where child_subscription_id = v_row.child_subscription_id
       and subject_id = v_row.subject_id;

    -- Ledger row, keyed on the (subject, period end) that fell due, so a second
    -- run inside the same boundary is a no-op instead of a duplicate.
    insert into public.subscription_changes
      (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
       subject_id, interval, effective_at, prorated_amount, currency,
       discount_percent, remaining_ratio, period_days, idempotency_key,
       created_by_profile_id)
    values
      (v_row.child_subscription_id, v_row.student_profile_id,
       v_row.owner_parent_profile_id, 'plan_change', v_row.subject_id,
       v_row.pending_interval, v_row.current_period_end, 0, v_row.currency,
       coalesce(v_row.sibling_discount_percent, 0), 1, null,
       'planroll:' || v_row.child_subscription_id::text || ':'
         || v_row.subject_id::text || ':' || v_row.current_period_end::text,
       null)
    on conflict do nothing;

    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

comment on function public.apply_due_plan_changes() is
  'Migration 109: promotes each subject''s SCHEDULED cycle (pending_interval -> interval, price re-frozen) once its own paid period ends. Scheduled hourly in 016. It never extends a period or grants access -- renewal/charging is the unimplemented provider seam -- so its only effect is that a parent''s cycle choice is no longer stored and forgotten.';

revoke all on function public.apply_due_plan_changes() from public, anon, authenticated;
grant execute on function public.apply_due_plan_changes() to service_role;

-- =============================================================================
-- 8) Legacy wrappers. Their signatures are pinned by 013 checks 20/46/78/84,
--    called by admin_grant_child_access and by already-shipped mobile binaries,
--    so they keep their exact shapes and delegate to the four RPCs above.
-- =============================================================================
create or replace function public.quote_child_subscription(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_items jsonb;
begin
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'quote: no subjects selected';
  end if;
  select jsonb_agg(jsonb_build_object('subject_id', s.sid, 'interval', p_interval))
    into v_items from unnest(p_subject_ids) s(sid);
  return public.quote_child_plan(p_student_profile_id, v_items);
end;
$$;

create or replace function public.create_child_subscription(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_items jsonb;
begin
  -- Round 48 kill switch: create_child_plan asserts too, but this wrapper is a
  -- paid entry point in its own right and must not depend on its callee for a
  -- money gate.
  perform public.assert_payments_enabled();
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'create: no subjects selected';
  end if;
  select jsonb_agg(jsonb_build_object('subject_id', s.sid, 'interval', p_interval))
    into v_items from unnest(p_subject_ids) s(sid);
  return public.create_child_plan(p_student_profile_id, v_items);
end;
$$;

create or replace function public.quote_subject_change(
  p_student_profile_id uuid,
  p_add                uuid[] default '{}',
  p_remove             uuid[] default '{}'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   public.child_subscriptions%rowtype;
  v_items jsonb;
begin
  select * into v_sub
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'subject_change: no active subscription' using errcode = 'no_data_found';
  end if;

  -- Compose the DESIRED full set from the live coverage + the add/remove diff,
  -- keeping every kept subject on ITS OWN cycle so a mixed plan is not
  -- flattened by an old caller.
  select jsonb_agg(jsonb_build_object('subject_id', x.sid, 'interval', x.iv))
    into v_items
  from (
    select ss.subject_id as sid,
           coalesce(ss.pending_interval, ss.interval, v_sub.interval) as iv
    from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and not (ss.subject_id = any (coalesce(p_remove, '{}')))
    union
    select s.sid, v_sub.interval
    from unnest(coalesce(p_add, '{}')) s(sid)
  ) x;

  return public.quote_plan_change(p_student_profile_id, coalesce(v_items, '[]'::jsonb));
end;
$$;

create or replace function public.apply_subject_change(
  p_student_profile_id uuid,
  p_add                uuid[] default '{}',
  p_remove             uuid[] default '{}',
  p_idempotency_key    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   public.child_subscriptions%rowtype;
  v_items jsonb;
begin
  -- Round 48 kill switch: adds are paid, removals stay legal.
  if coalesce(array_length(p_add, 1), 0) > 0 then
    perform public.assert_payments_enabled();
  end if;

  select * into v_sub
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'subject_change: no active subscription' using errcode = 'no_data_found';
  end if;

  select jsonb_agg(jsonb_build_object('subject_id', x.sid, 'interval', x.iv))
    into v_items
  from (
    select ss.subject_id as sid,
           coalesce(ss.pending_interval, ss.interval, v_sub.interval) as iv
    from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and not (ss.subject_id = any (coalesce(p_remove, '{}')))
    union
    select s.sid, v_sub.interval
    from unnest(coalesce(p_add, '{}')) s(sid)
  ) x;

  return public.apply_plan_change(
    p_student_profile_id, coalesce(v_items, '[]'::jsonb), p_idempotency_key);
end;
$$;

-- add/remove_subscription_subject stay for the historical single-subject path;
-- their pricing join now resolves the SUBJECT'S own cycle so they cannot
-- corrupt a mixed plan. They no longer write the amount columns (the trigger
-- owns them).
create or replace function public.add_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      uuid;
  v_owner    uuid;
  v_interval public.plan_interval;
  v_rank     int;
  v_pct      numeric(5,2);
  v_price    numeric(12,2);
  v_end      timestamptz;
begin
  perform public.assert_payments_enabled();
  select id, interval, owner_parent_profile_id, current_period_end
    into v_sub, v_interval, v_owner, v_end
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'add_subject: no active subscription'; end if;

  select sp.price_amount into v_price
  from public.subjects_pricing sp
  where sp.subject_id = p_subject_id and sp.interval = v_interval and sp.status = 'active';
  if v_price is null then
    raise exception 'add_subject: no active pricing for subject %', p_subject_id;
  end if;

  insert into public.subscription_subjects
    (child_subscription_id, subject_id, interval, price_amount, currency,
     current_period_start, current_period_end)
  values
    (v_sub, p_subject_id, v_interval, v_price, 'AZN', now(),
     now() + case v_interval
               when 'week'  then interval '7 days'
               when 'month' then interval '1 month'
               else              interval '1 year'
             end)
  on conflict (child_subscription_id, subject_id) do update
    set remove_at = null, price_amount = excluded.price_amount;

  -- Audit H7: recompute the sibling rank NOW (same formula as the quote RPC) so
  -- the previewed and the stored totals always match.
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- The percent moves first, then one touch of the subject rows re-fires
  -- trg_sync_subscription_period so base/discount/total are re-derived from the
  -- new percent by their single writer.
  update public.child_subscriptions
     set sibling_discount_percent = v_pct, updated_at = now()
   where id = v_sub;
  update public.subscription_subjects
     set currency = currency
   where child_subscription_id = v_sub;

  return (select jsonb_build_object(
            'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
            'discount', cs.discount_amount, 'total', cs.total_amount,
            'currency', cs.currency, 'subscription_id', cs.id)
          from public.child_subscriptions cs where cs.id = v_sub);
end;
$$;

create or replace function public.remove_subscription_subject(
  p_student_profile_id uuid,
  p_subject_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   uuid;
  v_owner uuid;
  v_rank  int;
  v_pct   numeric(5,2);
  v_count int;
begin
  select id, owner_parent_profile_id into v_sub, v_owner
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'remove_subject: no active subscription'; end if;

  select count(*) into v_count
  from public.subscription_subjects where child_subscription_id = v_sub;
  if v_count <= 1 then
    raise exception 'remove_subject: at least one subject must remain';
  end if;

  delete from public.subscription_subjects
  where child_subscription_id = v_sub and subject_id = p_subject_id;

  -- Audit H7: live sibling rank (see add_subscription_subject).
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- Percent first, then one no-op touch of the subject rows so
  -- trg_sync_subscription_period (their single writer) re-derives the amounts
  -- from the NEW percent — the delete above fired it with the old one.
  update public.child_subscriptions
     set sibling_discount_percent = v_pct, updated_at = now()
   where id = v_sub;
  update public.subscription_subjects
     set currency = currency
   where child_subscription_id = v_sub;

  return (select jsonb_build_object(
            'base', cs.base_amount, 'discount_percent', cs.sibling_discount_percent,
            'discount', cs.discount_amount, 'total', cs.total_amount,
            'currency', cs.currency, 'subscription_id', cs.id)
          from public.child_subscriptions cs where cs.id = v_sub);
end;
$$;

-- =============================================================================
-- 9) Per-subject ACCESS GATES. With per-subject cycles the SUBSCRIPTION
--    outlives its shortest-cycle subject (cs.current_period_end is the MAX), so
--    gating on the subscription date alone would keep serving a LAPSED weekly
--    subject. coalesce() means a legacy row with a NULL period behaves exactly
--    as it does today.
--
--    The three attempt engines are 200-800 line functions whose only change is
--    this one predicate, so the migration PATCHES the stored definition instead
--    of restating them (011 carries the inline edit for a from-zero build). The
--    anchor is asserted, so a silent no-op is impossible.
-- =============================================================================
do $gates$
declare
  v_fn     text;
  v_def    text;
  v_anchor constant text :=
    '        and cs.current_period_end is not null' || chr(10) ||
    '        and cs.current_period_end > now()';
  v_fixed  constant text :=
    '        and cs.current_period_end is not null' || chr(10) ||
    '        and cs.current_period_end > now()' || chr(10) ||
    '        and coalesce(ss.current_period_end, cs.current_period_end) > now()';
begin
  foreach v_fn in array array[
    'public.start_practice_attempt(uuid,int)',
    'public.start_topic_test_attempt(uuid,uuid[],uuid[])',
    'public.start_daily_round_attempt(uuid,text)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception 'gate patch: % not found', v_fn;
    end if;
    v_def := replace(pg_get_functiondef(v_fn::regprocedure), chr(13), '');
    if position('coalesce(ss.current_period_end' in v_def) > 0 then
      continue;  -- already patched (rerun)
    end if;
    if position(v_anchor in v_def) = 0 then
      raise exception 'gate patch: access-gate anchor not found in %', v_fn;
    end if;
    execute replace(v_def, v_anchor, v_fixed);
  end loop;
end
$gates$;

-- =============================================================================
-- 10) Grants for the new RPCs (service_role only — every caller authorizes the
--     parent first and reaches these through the admin client).
-- =============================================================================
revoke all on function public.plan_items_normalize(jsonb) from public, anon, authenticated;
grant execute on function public.plan_items_normalize(jsonb) to service_role;
revoke all on function public.quote_child_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_child_plan(uuid, jsonb) to service_role;
revoke all on function public.create_child_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_child_plan(uuid, jsonb) to service_role;
revoke all on function public.quote_plan_change(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_plan_change(uuid, jsonb) to service_role;
revoke all on function public.apply_plan_change(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change(uuid, jsonb, text) to service_role;

-- =============================================================================
-- 11) Admin lifecycle: extend / expire / activate now fan out PER SUBJECT and
--     let trg_sync_subscription_period derive child_subscriptions.* from the
--     result. The is_admin guard, the transition validation, the audit write
--     and the invalid_transition / duplicate_live_subscription hints are
--     untouched (013 check 77 greps for them).
-- =============================================================================
create or replace function public.admin_manage_child_subscription(
  p_subscription_id uuid,
  p_action          text,
  p_days            int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := public.current_profile_id();
  v_sub      public.child_subscriptions%rowtype;
  v_from     text;
  v_to       text;
  v_end      timestamptz;
  v_student  uuid;
  v_touched  int;
begin
  -- Administrator only (subscription/payment modules are Admin-only; content
  -- managers must never reach this).
  if not public.is_admin() then
    raise exception 'subscription: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('activate', 'cancel', 'expire', 'extend') then
    raise exception 'subscription: bad action' using errcode = 'check_violation',
      hint = 'unknown_action';
  end if;

  select * into v_sub from public.child_subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'subscription: not found' using errcode = 'no_data_found';
  end if;
  v_from    := v_sub.status::text;
  v_student := v_sub.student_profile_id;
  v_to      := v_from;
  v_end     := v_sub.current_period_end;

  if p_action = 'activate' then
    if v_from not in ('incomplete', 'past_due') then
      raise exception 'subscription: cannot activate from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'active';
    -- Open a period PER SUBJECT on its own cycle, where there is none / it
    -- already lapsed.
    update public.subscription_subjects ss
       set current_period_start = coalesce(ss.current_period_start, now()),
           current_period_end   = now() + case coalesce(ss.interval, v_sub.interval)
                                            when 'week'  then interval '7 days'
                                            when 'month' then interval '30 days'
                                            else              interval '365 days'
                                          end
     where ss.child_subscription_id = p_subscription_id
       and (ss.current_period_end is null or ss.current_period_end <= now());
    get diagnostics v_touched = row_count;
    update public.child_subscriptions
       set status = 'active',
           current_period_start = coalesce(current_period_start, now()),
           updated_at = now()
     where id = p_subscription_id;
    -- A subscription with no subject rows has nothing for the trigger to
    -- derive from; keep the historical direct write for that degenerate case.
    if v_touched = 0 and (v_end is null or v_end <= now()) then
      update public.child_subscriptions
         set current_period_end = now() + case v_sub.interval
                                            when 'week'  then interval '7 days'
                                            when 'month' then interval '30 days'
                                            else              interval '365 days'
                                          end
       where id = p_subscription_id;
    end if;

  elsif p_action = 'cancel' then
    if v_from not in ('trialing', 'active', 'past_due') then
      raise exception 'subscription: cannot cancel from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'canceled';
    -- Canceled keeps access until the period end (web parity).
    update public.child_subscriptions
       set status = 'canceled', updated_at = now()
     where id = p_subscription_id;

  elsif p_action = 'expire' then
    if v_from not in ('trialing', 'active', 'past_due', 'canceled') then
      raise exception 'subscription: cannot expire from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    v_to := 'expired';
    update public.subscription_subjects
       set current_period_end = now()
     where child_subscription_id = p_subscription_id;
    get diagnostics v_touched = row_count;
    update public.child_subscriptions
       set status = 'expired', updated_at = now()
     where id = p_subscription_id;
    if v_touched = 0 then
      update public.child_subscriptions
         set current_period_end = now() where id = p_subscription_id;
    end if;

  else -- extend
    if v_from not in ('trialing', 'active', 'past_due', 'canceled') then
      raise exception 'subscription: cannot extend from %', v_from
        using errcode = 'check_violation', hint = 'invalid_transition';
    end if;
    if p_days is null or p_days < 1 or p_days > 730 then
      raise exception 'subscription: days must be 1..730' using errcode = 'check_violation',
        hint = 'bad_days';
    end if;
    -- Extend from NOW when the subject's period already lapsed, else from its
    -- end — per subject, so a yearly subject is not pulled back to a weekly's
    -- date and vice versa.
    update public.subscription_subjects ss
       set current_period_end =
             greatest(coalesce(ss.current_period_end, now()), now())
             + make_interval(days => p_days)
     where ss.child_subscription_id = p_subscription_id;
    get diagnostics v_touched = row_count;
    if v_touched = 0 then
      update public.child_subscriptions
         set current_period_end =
               greatest(coalesce(v_sub.current_period_end, now()), now())
               + make_interval(days => p_days),
             updated_at = now()
       where id = p_subscription_id;
    end if;
  end if;

  -- Coverage end after the fan-out (the trigger already wrote it).
  select current_period_end into v_end
  from public.child_subscriptions where id = p_subscription_id;

  -- Reconcile the child's cached access flag for THIS student (same rules as
  -- recompute_child_access(), applied to one row so the UI is instantly right).
  update public.students s
     set access_status = case
           when exists (
             select 1 from public.child_subscriptions cs
             where cs.student_profile_id = s.profile_id
               and (cs.status in ('trialing','active','past_due')
                    or (cs.status = 'canceled' and cs.current_period_end > now()))
               and (cs.current_period_end is null or cs.current_period_end > now())
           ) then (
             case when exists (
               select 1 from public.child_subscriptions cs
               where cs.student_profile_id = s.profile_id and cs.status = 'trialing'
                 and (cs.current_period_end is null or cs.current_period_end > now())
             ) then 'trialing'::public.child_access_status
             else 'active'::public.child_access_status end)
           else 'expired'::public.child_access_status
         end
   where s.profile_id = v_student;

  -- Self-auditing (same mechanism as admin_upsert_subject_price).
  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, metadata_json, severity, success)
  values
    (v_actor, 'admin.subscription.' || p_action, 'child_subscriptions', p_subscription_id,
     jsonb_build_object(
       'from_status', v_from,
       'to_status', v_to,
       'days', p_days,
       'period_end', v_end,
       'student_profile_id', v_student),
     (case when p_action in ('expire', 'cancel') then 'warning' else 'info' end)::public.audit_severity,
     true);

  return jsonb_build_object(
    'id', p_subscription_id,
    'from_status', v_from,
    'status', v_to,
    'current_period_end', v_end);
exception
  when unique_violation then
    -- uq_child_subscriptions_live: this child already has another live sub.
    raise exception 'subscription: child already has a live subscription'
      using errcode = 'unique_violation', hint = 'duplicate_live_subscription';
end;
$$;

-- =============================================================================
-- 12) admin_grant_child_access: signature and semantics deliberately unchanged
--     (ONE interval for a comp grant, amounts 0). It now stamps that interval,
--     a zero price and the grant window onto each subscription_subjects row.
-- =============================================================================
create or replace function public.admin_grant_child_access(
  p_student_profile_id uuid,
  p_interval           public.plan_interval,
  p_subject_ids        uuid[],
  p_days               int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_days    int;
  v_missing int;
  v_sub     uuid;
  v_sid     uuid;
  v_ids     jsonb;
  v_end     timestamptz;
begin
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'admin_grant: no subjects selected';
  end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'admin_grant: child has no owning parent';
  end if;

  v_days := coalesce(p_days,
                     case p_interval when 'week' then 7 when 'month' then 30 else 365 end);
  if v_days < 1 or v_days > 730 then
    raise exception 'admin_grant: days out of range (1..730)';
  end if;

  select count(*) into v_missing
  from unnest(p_subject_ids) s(sid)
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = s.sid and sp.interval = p_interval and sp.status = 'active'
  );
  if v_missing > 0 then
    raise exception 'admin_grant: missing active pricing for % subject(s)', v_missing;
  end if;

  if exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
      and status in ('trialing', 'active', 'past_due')
  ) then
    raise exception 'admin_grant: child already has a live subscription';
  end if;

  v_end := now() + (v_days || ' days')::interval;

  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     current_period_start, sibling_discount_percent, currency, provider)
  values
    (p_student_profile_id, v_owner, p_interval, 'active',
     now(), 0, 'AZN', 'admin_grant')
  returning id into v_sub;

  foreach v_sid in array p_subject_ids loop
    insert into public.subscription_subjects
      (child_subscription_id, subject_id, interval, price_amount, currency,
       current_period_start, current_period_end)
    values (v_sub, v_sid, p_interval, 0, 'AZN', now(), v_end)
    on conflict do nothing;
  end loop;

  v_ids := public.activate_child_login_id(p_student_profile_id);

  update public.students set access_status = 'active'
   where profile_id = p_student_profile_id;

  return jsonb_build_object(
    'subscription_id', v_sub, 'status', 'active', 'days', v_days,
    'current_period_end', to_jsonb(v_end))
    || v_ids;
end;
$$;

-- =============================================================================
-- 13) Pre-expiry scanner: scan the SUBJECT periods, not the subscription's.
--     One notice per (subscription, period end) so a uniform plan still gets a
--     single message while a weekly subject can never silence a yearly one's.
-- =============================================================================
create or replace function public.notify_expiring_subscriptions()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row record; v_days int; v_name text; v_n int := 0;
begin
  for v_row in
    select cs.id, cs.owner_parent_profile_id, ss.current_period_end as period_end,
           s.first_name, s.last_name
    from public.child_subscriptions cs
    join public.subscription_subjects ss on ss.child_subscription_id = cs.id
    join public.students s on s.profile_id = cs.student_profile_id
    where cs.status in ('trialing', 'active')
      and ss.remove_at is null
      and ss.current_period_end is not null
      and ss.current_period_end > now()
      and ss.current_period_end <= now() + interval '3 days'
      and cs.owner_parent_profile_id is not null
    group by cs.id, cs.owner_parent_profile_id, ss.current_period_end,
             s.first_name, s.last_name
  loop
    v_days := greatest(1, ceil(extract(epoch from (v_row.period_end - now())) / 86400.0)::int);
    v_name := coalesce(nullif(btrim(coalesce(v_row.first_name, '') || ' ' || coalesce(v_row.last_name, '')), ''), 'övladınız');
    perform public.create_notification(
      v_row.owner_parent_profile_id, 'subject_expiring', 'Abunə bitmək üzrədir',
      v_name || ' üçün abunə ' || v_days::text || ' gün sonra bitir.',
      jsonb_build_object('child_name', v_name, 'days', v_days, 'subscription_id', v_row.id),
      array['in_app'],
      'subexp:' || v_row.id::text || ':' || v_row.period_end::text,
      3, '/subscription', 'billing', null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

-- =============================================================================
-- 13b) Schedule the cycle-change rollover. 016 carries the same block for a
--      from-zero build; this one exists because a migration lands on databases
--      where 016 already ran, and an unscheduled apply_due_plan_changes() is
--      indistinguishable from the write-only bug it fixes. Guarded exactly like
--      016: a database without pg_cron skips with a NOTICE and still commits.
-- =============================================================================
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'olympiq_apply_due_plan_changes';
    perform cron.schedule(
      'olympiq_apply_due_plan_changes',
      '7 * * * *',
      'select public.apply_due_plan_changes();');
    raise notice 'pg_cron job olympiq_apply_due_plan_changes scheduled (hourly).';
  else
    raise notice 'pg_cron absent — olympiq_apply_due_plan_changes NOT scheduled; run 016 once the extension is enabled.';
  end if;
end
$cron$;

-- =============================================================================
-- 14) Verification.
-- =============================================================================
do $verify$
declare
  v_bad  int;
  v_armed int;
begin
  -- pending_interval must have a reader. Shipping the writer alone is the exact
  -- defect this migration was reviewed for: the cycle saves, survives a refresh
  -- and then never applies.
  if to_regprocedure('public.apply_due_plan_changes()') is null then
    raise exception 'migration 109: apply_due_plan_changes() is missing — pending_interval would be write-only';
  end if;

  -- A live subscription whose parent period is known must not leave a subject
  -- row without its own period — that row would inherit through coalesce and
  -- silently outlive its cycle.
  select count(*) into v_bad
  from public.subscription_subjects ss
  join public.child_subscriptions cs on cs.id = ss.child_subscription_id
  where cs.status in ('trialing', 'active', 'past_due')
    and cs.current_period_end is not null
    and ss.current_period_end is null;
  if v_bad > 0 then
    raise exception 'migration 109: % live subject row(s) still have no period end', v_bad;
  end if;

  select count(*) into v_armed
  from pg_trigger
  where tgname = 'trg_sync_subscription_period'
    and tgrelid = 'public.subscription_subjects'::regclass
    and not tgisinternal;
  if v_armed = 0 then
    raise exception 'migration 109: trg_sync_subscription_period is not armed';
  end if;

  if to_regprocedure('public.quote_child_subscription(uuid,public.plan_interval,uuid[])') is null
     or to_regprocedure('public.create_child_subscription(uuid,public.plan_interval,uuid[])') is null
     or to_regprocedure('public.quote_subject_change(uuid,uuid[],uuid[])') is null
     or to_regprocedure('public.apply_subject_change(uuid,uuid[],uuid[],text)') is null then
    raise exception 'migration 109: a legacy wrapper signature was lost';
  end if;
end
$verify$;

commit;
