-- ============================================================================
-- Migration: 2026_07_20_078_subject_change_proration.sql
-- Round 32 (owner-approved billing model): mid-cycle subject changes.
--
-- PROBLEM (before this): add_subscription_subject overwrote the subscription's
-- amounts with the FULL period price of the new bundle, changed no dates and
-- created no charge, while the UI showed that recurring rate inside a payment
-- dialog. With a real provider that path would either bill a whole month for a
-- few remaining days, or grant access for free.
--
-- MODEL (industry standard — Stripe/Recurly/Chargebee):
--   ADD    -> access immediately, charge a PRORATED top-up for the days left in
--             the current period, recurring rate rises from now on.
--   REMOVE -> NO refund. Access is KEPT until the current period ends
--             (subscription_subjects.remove_at), and the recurring rate drops
--             for the NEXT renewal.
--   One shared renewal date per child (current_period_end) — never per subject.
--
-- Product rules (owner-approved):
--   * trialing        -> no proration (nothing is charged during a trial)
--   * weekly interval -> no proration (3 AZN/week makes part-week math noise)
--   * < MIN_CHARGE    -> waived to 0 (no micro-charges)
--   * the sibling discount in force AT CHANGE TIME applies to the top-up too
--
-- quote_subject_change() is the SINGLE source of the math; apply_subject_change()
-- calls it, so the previewed price can never drift from the applied one (this is
-- the audit-H7 lesson). Amounts are never accepted from the client.
--
-- Backported into canonical 007 (column + ledger), 010 (RLS), 011 (RPCs).
-- 013 check #78.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Scheduled removals: the subject stays usable until remove_at (= the
--    current period end) and is excluded from the NEXT recurring total.
--    INVARIANT: remove_at is ALWAYS set to current_period_end, so access ends
--    exactly when the paid period does.
--    TODO(real-provider): the renewal job must DELETE rows whose remove_at has
--    passed before invoicing the next period, and the subject-access joins in
--    the attempt RPCs should then also honour (remove_at is null or remove_at >
--    now()). Redundant today because the subscription itself expires at the
--    same instant.
-- ----------------------------------------------------------------------------
alter table public.subscription_subjects
  add column if not exists remove_at timestamptz;

comment on column public.subscription_subjects.remove_at is
  'Scheduled removal (migration 078): access is kept until this timestamp (= the period end); the subject is excluded from the next recurring total. NULL = active.';

-- ----------------------------------------------------------------------------
-- 2) Immutable change ledger. Proration is a state machine, not a formula:
--    several changes inside one period must each be reconstructible, both for
--    the next renewal amount and for disputes.
-- ----------------------------------------------------------------------------
create table if not exists public.subscription_changes (
  id                      uuid primary key default gen_random_uuid(),
  child_subscription_id   uuid not null references public.child_subscriptions (id) on delete cascade,
  student_profile_id      uuid not null references public.students (profile_id) on delete cascade,
  owner_parent_profile_id uuid references public.profiles (id) on delete set null,
  change_type             text not null check (change_type in ('add', 'remove')),
  subject_id              uuid not null references public.subjects (id) on delete restrict,
  -- add  -> now() (immediate access); remove -> the period end it takes effect on
  effective_at            timestamptz not null,
  prorated_amount         numeric(12,2) not null default 0,
  currency                text not null default 'AZN',
  recurring_before        numeric(12,2),
  recurring_after         numeric(12,2),
  discount_percent        numeric(5,2) not null default 0,
  remaining_ratio         numeric(8,6),
  period_days             numeric(10,4),
  idempotency_key         text,
  -- Real-provider baseline: filled in when an actual charge is captured.
  -- TODO(real-provider): set provider/provider_payment_id from the PSP result
  -- and mirror the amount into public.payments once a provider is wired.
  provider                text not null default 'none',
  provider_payment_id     text,
  created_by_profile_id   uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now()
);
create index if not exists idx_sub_changes_sub
  on public.subscription_changes (child_subscription_id, created_at desc);
create index if not exists idx_sub_changes_student
  on public.subscription_changes (student_profile_id, created_at desc);
-- Replay guard: the same batch key can never apply the same subject twice.
create unique index if not exists uq_sub_changes_idem
  on public.subscription_changes (child_subscription_id, idempotency_key, subject_id, change_type)
  where idempotency_key is not null;

alter table public.subscription_changes enable row level security;
-- Read: the owning parent, the child, a linked parent, or an admin. No client
-- writes at all — rows are only ever created by the DEFINER apply RPC.
drop policy if exists "sub_changes_select" on public.subscription_changes;
create policy "sub_changes_select" on public.subscription_changes for select to authenticated
  using (
    owner_parent_profile_id = public.current_profile_id()
    or student_profile_id = public.current_profile_id()
    or public.is_parent_linked_to_student(student_profile_id)
    or public.is_admin()
    or public.has_permission('subscriptions.manage')
  );

-- ----------------------------------------------------------------------------
-- 3) quote_subject_change — the ONLY place the money math lives.
--    Returns what the parent will pay NOW and what they will pay from the next
--    renewal, plus the inputs that produced it (so the UI can explain itself).
-- ----------------------------------------------------------------------------
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
  v_min_charge  constant numeric(12,2) := 0.50;  -- waive micro-charges
  v_sub         public.child_subscriptions%rowtype;
  v_owner       uuid;
  v_pct         numeric(5,2);
  v_rank        int;
  v_add         uuid[] := coalesce(p_add, '{}');
  v_remove      uuid[] := coalesce(p_remove, '{}');
  v_cur_base    numeric(12,2);
  v_next_base   numeric(12,2);
  v_added_base  numeric(12,2);
  v_cur_total   numeric(12,2);
  v_next_total  numeric(12,2);
  v_ratio       numeric(8,6) := 0;
  v_period_days numeric(10,4);
  v_prorate     boolean := false;
  v_due         numeric(12,2) := 0;
  v_remaining   int;
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

  -- Sibling discount as of NOW (same formula as quote_child_subscription).
  select count(distinct cs.student_profile_id) + 1 into v_rank
  from public.child_subscriptions cs
  where cs.owner_parent_profile_id = v_owner
    and cs.student_profile_id <> p_student_profile_id
    and cs.status in ('trialing', 'active', 'past_due');
  v_pct := case when v_rank <= 1 then 0 when v_rank = 2 then 10 else 15 end;

  -- CURRENT recurring set = subjects not already scheduled for removal.
  select coalesce(sum(sp.price_amount), 0) into v_cur_base
  from public.subscription_subjects ss
  join public.subjects_pricing sp
    on sp.subject_id = ss.subject_id
   and sp.interval = v_sub.interval
   and sp.status = 'active'
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null;

  -- Only genuinely NEW subjects are billable (ignore ones already on the plan).
  select coalesce(sum(sp.price_amount), 0) into v_added_base
  from public.subjects_pricing sp
  where sp.subject_id = any (v_add)
    and sp.interval = v_sub.interval
    and sp.status = 'active'
    and not exists (
      select 1 from public.subscription_subjects ss
      where ss.child_subscription_id = v_sub.id
        and ss.subject_id = sp.subject_id
        and ss.remove_at is null);

  -- NEXT recurring set = current + additions - removals.
  select coalesce(sum(sp.price_amount), 0) into v_next_base
  from public.subjects_pricing sp
  where sp.interval = v_sub.interval
    and sp.status = 'active'
    and (
      sp.subject_id = any (v_add)
      or exists (
        select 1 from public.subscription_subjects ss
        where ss.child_subscription_id = v_sub.id
          and ss.subject_id = sp.subject_id
          and ss.remove_at is null)
    )
    and not (sp.subject_id = any (v_remove));

  v_cur_total  := v_cur_base  - round(v_cur_base  * v_pct / 100.0, 2);
  v_next_total := v_next_base - round(v_next_base * v_pct / 100.0, 2);

  -- Elapsed/remaining share of the CURRENT period (exact, from the DB clock).
  if v_sub.current_period_end is not null
     and v_sub.current_period_start is not null
     and v_sub.current_period_end > v_sub.current_period_start then
    v_period_days := round(
      extract(epoch from (v_sub.current_period_end - v_sub.current_period_start)) / 86400.0, 4);
    v_ratio := greatest(0, least(1, round(
      extract(epoch from (v_sub.current_period_end - now()))
      / nullif(extract(epoch from (v_sub.current_period_end - v_sub.current_period_start)), 0), 6)));
  end if;

  -- Prorate only for a paid, non-weekly period that still has time left.
  v_prorate := v_sub.status <> 'trialing'
               and v_sub.interval <> 'week'
               and v_ratio > 0
               and v_added_base > 0;

  if v_prorate then
    v_due := round(v_added_base * (1 - v_pct / 100.0) * v_ratio, 2);
    if v_due < v_min_charge then v_due := 0; end if;  -- waived
  end if;

  v_remaining := greatest(0, ceil(
    extract(epoch from (coalesce(v_sub.current_period_end, now()) - now())) / 86400.0)::int);

  return jsonb_build_object(
    'subscription_id',        v_sub.id,
    'status',                 v_sub.status,
    'interval',               v_sub.interval,
    'currency',               v_sub.currency,
    'discount_percent',       v_pct,
    'current_recurring_total', v_cur_total,
    'new_recurring_total',    v_next_total,
    'due_now',                v_due,
    'prorated',               v_prorate and v_due > 0,
    'proration_waived',       v_prorate and v_due = 0,
    'added_base',             v_added_base,
    'remaining_ratio',        v_ratio,
    'days_remaining',         v_remaining,
    'period_days',            v_period_days,
    -- The new recurring rate (and any removal) takes effect at the renewal.
    'effective_from',         v_sub.current_period_end,
    'removals_effective_at',  v_sub.current_period_end);
end;
$$;
revoke all on function public.quote_subject_change(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.quote_subject_change(uuid, uuid[], uuid[]) to service_role;

-- ----------------------------------------------------------------------------
-- 4) apply_subject_change — atomic: adds get immediate access + a prorated
--    top-up, removals are SCHEDULED for the period end, the recurring rate is
--    recomputed, and every change is written to the ledger.
-- ----------------------------------------------------------------------------
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
  v_quote     jsonb;
  v_sub       public.child_subscriptions%rowtype;
  v_add       uuid[] := coalesce(p_add, '{}');
  v_remove    uuid[] := coalesce(p_remove, '{}');
  v_actor     uuid := public.current_profile_id();
  v_subject   uuid;
  v_price     numeric(12,2);
  v_pct       numeric(5,2);
  v_ratio     numeric(8,6);
  v_share     numeric(12,2);
  v_due       numeric(12,2);
  v_before    numeric(12,2);
  v_after     numeric(12,2);
  v_base      numeric(12,2);
  v_left      int;
  v_prior     jsonb;
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
  v_quote := public.quote_subject_change(p_student_profile_id, v_add, v_remove);

  select * into v_sub from public.child_subscriptions
  where id = (v_quote->>'subscription_id')::uuid
  for update;

  v_pct   := (v_quote->>'discount_percent')::numeric;
  v_ratio := (v_quote->>'remaining_ratio')::numeric;
  v_due   := (v_quote->>'due_now')::numeric;
  v_before := (v_quote->>'current_recurring_total')::numeric;
  v_after  := (v_quote->>'new_recurring_total')::numeric;

  -- ---- removals: keep access to the period end, drop from the next cycle ----
  if array_length(v_remove, 1) is not null then
    -- At least one subject must survive into the next period.
    select count(*) into v_left
    from public.subscription_subjects ss
    where ss.child_subscription_id = v_sub.id
      and ss.remove_at is null
      and not (ss.subject_id = any (v_remove));
    if v_left < 1 and array_length(v_add, 1) is null then
      raise exception 'subject_change: at least one subject must remain'
        using errcode = 'check_violation', hint = 'last_subject';
    end if;

    update public.subscription_subjects ss
       set remove_at = v_sub.current_period_end
     where ss.child_subscription_id = v_sub.id
       and ss.subject_id = any (v_remove)
       and ss.remove_at is null;

    foreach v_subject in array v_remove loop
      insert into public.subscription_changes
        (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
         subject_id, effective_at, prorated_amount, currency, recurring_before, recurring_after,
         discount_percent, remaining_ratio, period_days, idempotency_key, created_by_profile_id)
      values
        (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'remove',
         v_subject, coalesce(v_sub.current_period_end, now()), 0, v_sub.currency, v_before, v_after,
         v_pct, v_ratio, (v_quote->>'period_days')::numeric, p_idempotency_key, v_actor)
      on conflict do nothing;
    end loop;
  end if;

  -- ---- additions: immediate access + prorated top-up -----------------------
  if array_length(v_add, 1) is not null then
    foreach v_subject in array v_add loop
      -- Un-schedule a pending removal instead of duplicating the row.
      update public.subscription_subjects
         set remove_at = null
       where child_subscription_id = v_sub.id and subject_id = v_subject;

      insert into public.subscription_subjects (child_subscription_id, subject_id)
      values (v_sub.id, v_subject)
      on conflict do nothing;

      select sp.price_amount into v_price
      from public.subjects_pricing sp
      where sp.subject_id = v_subject and sp.interval = v_sub.interval and sp.status = 'active';

      -- Per-subject share of the same proration the quote returned. Waived
      -- (v_due = 0) means every share is 0 too, so the ledger always sums to
      -- exactly what was charged.
      v_share := 0;
      if v_due > 0 and coalesce(v_price, 0) > 0 then
        v_share := round(v_price * (1 - v_pct / 100.0) * v_ratio, 2);
      end if;

      insert into public.subscription_changes
        (child_subscription_id, student_profile_id, owner_parent_profile_id, change_type,
         subject_id, effective_at, prorated_amount, currency, recurring_before, recurring_after,
         discount_percent, remaining_ratio, period_days, idempotency_key, created_by_profile_id)
      values
        (v_sub.id, p_student_profile_id, v_sub.owner_parent_profile_id, 'add',
         v_subject, now(), v_share, v_sub.currency, v_before, v_after,
         v_pct, v_ratio, (v_quote->>'period_days')::numeric, p_idempotency_key, v_actor)
      on conflict do nothing;
    end loop;
  end if;

  -- ---- recurring rate = subjects that survive into the next period ---------
  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subscription_subjects ss
  join public.subjects_pricing sp
    on sp.subject_id = ss.subject_id
   and sp.interval = v_sub.interval
   and sp.status = 'active'
  where ss.child_subscription_id = v_sub.id
    and ss.remove_at is null;

  update public.child_subscriptions
     set base_amount = v_base,
         sibling_discount_percent = v_pct,
         discount_amount = round(v_base * v_pct / 100.0, 2),
         total_amount = v_base - round(v_base * v_pct / 100.0, 2),
         updated_at = now()
   where id = v_sub.id;

  -- TODO(real-provider): capture (v_quote->>'due_now') through the PSP HERE,
  -- inside this transaction's boundary, then write the resulting payment id
  -- back onto the ledger rows (provider / provider_payment_id) and insert the
  -- matching public.payments row. Until a provider exists nothing is charged —
  -- the amount is recorded on the ledger only. NEVER accept the amount from a
  -- client; it must always come from quote_subject_change().

  return v_quote || jsonb_build_object('applied', true, 'charged', false);
end;
$$;
revoke all on function public.apply_subject_change(uuid, uuid[], uuid[], text) from public, anon, authenticated;
grant execute on function public.apply_subject_change(uuid, uuid[], uuid[], text) to service_role;

-- ---- self-verify -----------------------------------------------------------
do $$
begin
  if to_regprocedure('public.quote_subject_change(uuid,uuid[],uuid[])') is null
     or to_regprocedure('public.apply_subject_change(uuid,uuid[],uuid[],text)') is null then
    raise exception 'proration RPCs missing';
  end if;
  if has_function_privilege('authenticated','public.apply_subject_change(uuid,uuid[],uuid[],text)','EXECUTE')
     or has_function_privilege('anon','public.quote_subject_change(uuid,uuid[],uuid[])','EXECUTE') then
    raise exception 'proration RPCs must be service-role only';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='subscription_subjects'
                    and column_name='remove_at') then
    raise exception 'subscription_subjects.remove_at missing';
  end if;
  if to_regclass('public.subscription_changes') is null then
    raise exception 'subscription_changes ledger missing';
  end if;
  raise notice 'subject-change proration self-verify PASS.';
end $$;

commit;
