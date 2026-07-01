-- Migration: 2026_06_28_015_deferred_child_id_and_subject_edits.sql
-- Purpose: Batch H — Add-Child flow + Subjects UX.
--   (1) DEFER the 8-digit ID: the child is now created WITHOUT a login ID and stays
--       access_status='inactive'. The collision-safe 8-digit ID is allocated only
--       AFTER a plan is chosen (i.e. on subscribe success). create_child_account no
--       longer calls allocate_child_unique_id and now accepts an optional p_grade_id
--       (structured grade) so the Add-Child form can use a real grades dropdown.
--   (2) child_credentials.child_unique_id is made NULLable (the credential row is
--       written at create time before any ID exists); it is backfilled on allocation.
--   (3) create_child_subscription now allocates the ID on first subscription for a
--       child that still has none, backfills child_credentials, and returns
--       new_child_unique_id + auth_user_id so the server action can set the canonical
--       synthetic auth email (c<8digits>@children.invalid).
--   (4) add_subscription_subject / remove_subscription_subject let a parent edit the
--       subjects covered by an existing child subscription (re-priced server-side at
--       next-cycle pricing; never client-set amounts).
-- Environment first applied: development/staging
-- Related root SQL file(s): 002 (child_credentials.child_unique_id nullable),
--   011 (create_child_account / create_child_subscription / subject-edit fns), 013.
-- Backport status: completed (canonical 002 + 011; validation 013 stays all-PASS).
-- Destructive change: no (additive params/functions; column constraint relaxed).
-- Rollback notes: this loosens a NOT NULL and changes function signatures; to roll
--   back, restore the prior create_child_account / create_child_subscription bodies
--   and re-add NOT NULL after backfilling any NULL child_credentials.child_unique_id.
-- Security: all functions SECURITY DEFINER, service_role EXECUTE only (parent server
--   actions authorize the parent + child first, then run as service_role).
-- =============================================================================

-- (2) Relax NOT NULL — the credential row exists before the ID is allocated.
alter table public.child_credentials
  alter column child_unique_id drop not null;

-- -----------------------------------------------------------------------------
-- (1) create_child_account : create the child WITHOUT a login ID.
--   - new optional p_grade_id (structured grade, FK grades) written to students.grade_id
--   - DOES NOT allocate the 8-digit ID (students.child_unique_id stays NULL,
--     child_credentials.child_unique_id stays NULL); access_status stays 'inactive'.
--   The ID is allocated later by create_child_subscription (after a plan is chosen).
-- (drop first: the parameter list changes the function signature)
-- -----------------------------------------------------------------------------
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text);
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text, uuid);
create or replace function public.create_child_account(
  p_parent_profile_id uuid,
  p_auth_user_id      uuid,
  p_first_name        text,
  p_last_name         text,
  p_city              text default null,
  p_school_name       text default null,
  p_class_grade       text default null,
  p_grade_id          uuid default null
)
returns table (new_student_profile_id uuid, new_child_unique_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id      uuid;
  v_student_role_id uuid;
begin
  -- The creator must be a registered parent (parents row exists).
  if not exists (select 1 from public.parents pa where pa.profile_id = p_parent_profile_id) then
    raise exception 'create_child_account: % is not a registered parent', p_parent_profile_id
      using errcode = 'check_violation';
  end if;

  -- The child Auth user must already exist with an auto-created profile.
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = p_auth_user_id;
  if v_profile_id is null then
    raise exception 'create_child_account: no profile for auth user %', p_auth_user_id
      using errcode = 'no_data_found';
  end if;

  -- Idempotency guard: never double-provision a profile already made a student.
  if exists (select 1 from public.students s where s.profile_id = v_profile_id) then
    raise exception 'create_child_account: profile % is already a student', v_profile_id
      using errcode = 'unique_violation';
  end if;

  -- Validate the optional structured grade.
  if p_grade_id is not null
     and not exists (select 1 from public.grades g where g.id = p_grade_id) then
    raise exception 'create_child_account: grade % does not exist', p_grade_id
      using errcode = 'foreign_key_violation';
  end if;

  -- 1) Promote the auto-created profile into an active child profile.
  --    Children have no contact email (synthetic auth email is not contact info).
  update public.profiles
     set display_name = nullif(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), ''),
         email        = null,
         status       = 'active',
         updated_at   = now()
   where id = v_profile_id;

  -- 2) Create the student row WITHOUT a login ID (no paid access yet).
  --    child_unique_id stays NULL until a plan is chosen (subscribe step).
  insert into public.students (profile_id, created_by_parent_profile_id, grade_id,
                               first_name, last_name, city, school_name, class_grade,
                               access_status)
  values (v_profile_id, p_parent_profile_id, p_grade_id,
          p_first_name, p_last_name, p_city, p_school_name, p_class_grade,
          'inactive');

  -- 3) Assign the Student role.
  select r.id into v_student_role_id from public.roles r where r.code = 'student';
  if v_student_role_id is null then
    raise exception 'create_child_account: student role missing (seed 012)';
  end if;
  insert into public.profile_roles (profile_id, role_id, assigned_by)
  values (v_profile_id, v_student_role_id, p_parent_profile_id)
  on conflict do nothing;

  -- 4) Record the credential mapping WITHOUT a child_unique_id (backfilled on
  --    allocation). Password lives ONLY in Supabase Auth.
  insert into public.child_credentials (student_profile_id, child_unique_id, auth_user_id,
                                        password_set_by_parent_profile_id, password_set_at)
  values (v_profile_id, null, p_auth_user_id, p_parent_profile_id, now());

  -- 5) Auto-link the child to the creating parent (active link = parent access).
  insert into public.parent_student_links (parent_profile_id, student_profile_id, status,
                                           verified_at, created_by)
  values (p_parent_profile_id, v_profile_id, 'active', now(), p_parent_profile_id)
  on conflict (parent_profile_id, student_profile_id)
    do update set status = 'active', verified_at = now();

  -- Return the new student profile id; the login ID is NULL until a plan is chosen.
  return query select v_profile_id, null::text;
end;
$$;

comment on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid) is
  'Atomic parent-created child provisioning WITHOUT a login ID (allocated later on subscribe). service_role EXECUTE only. Run AFTER admin.createUser (pending email).';

revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- (3) create_child_subscription : create the trial AND allocate the 8-digit ID on
--   the first subscription for a child that still has none. Returns the (possibly
--   newly allocated) child_unique_id + the child's auth_user_id so the calling
--   server action can set the canonical synthetic auth email.
-- -----------------------------------------------------------------------------
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
declare
  v_owner   uuid;
  v_q       jsonb;
  v_sub     uuid;
  v_sid     uuid;
  v_trial   int;
  v_child   text;
  v_auth    uuid;
begin
  select created_by_parent_profile_id, child_unique_id
    into v_owner, v_child
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'create: child has no owning parent'; end if;

  v_q := public.quote_child_subscription(p_student_profile_id, p_interval, p_subject_ids);
  v_trial := (v_q->>'trial_days')::int;

  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     trial_started_at, trial_ends_at, current_period_start, current_period_end,
     base_amount, sibling_discount_percent, discount_amount, total_amount, currency, provider)
  values
    (p_student_profile_id, v_owner, p_interval, 'trialing',
     now(), now() + (v_trial || ' days')::interval, now(), now() + (v_trial || ' days')::interval,
     (v_q->>'base')::numeric, (v_q->>'discount_percent')::numeric,
     (v_q->>'discount')::numeric, (v_q->>'total')::numeric, 'AZN', 'none')
  returning id into v_sub;

  foreach v_sid in array p_subject_ids loop
    insert into public.subscription_subjects (child_subscription_id, subject_id)
    values (v_sub, v_sid) on conflict do nothing;
  end loop;

  if (v_q->>'discount_percent')::numeric > 0 then
    insert into public.sibling_discounts
      (owner_parent_profile_id, child_subscription_id, child_rank, discount_percent)
    values (v_owner, v_sub, (v_q->>'rank')::int, (v_q->>'discount_percent')::numeric);
  end if;

  -- Allocate the 8-digit login ID now (first plan chosen) if the child has none,
  -- and backfill the credential mapping so child login works.
  if v_child is null then
    v_child := public.allocate_child_unique_id(p_student_profile_id);
    update public.child_credentials
       set child_unique_id = v_child, updated_at = now()
     where student_profile_id = p_student_profile_id;
  end if;

  select auth_user_id into v_auth
  from public.child_credentials where student_profile_id = p_student_profile_id;

  update public.students set access_status = 'trialing' where profile_id = p_student_profile_id;

  return v_q || jsonb_build_object(
    'subscription_id', v_sub, 'status', 'trialing',
    'new_child_unique_id', v_child, 'auth_user_id', v_auth);
end;
$$;

revoke all on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) from public, anon, authenticated;
grant execute on function public.create_child_subscription(uuid, public.plan_interval, uuid[]) to service_role;

-- -----------------------------------------------------------------------------
-- (4) add_subscription_subject : parent adds a subject to a child's current live
--   subscription. The subject is re-priced server-side (active pricing for the
--   subscription's interval) and added to the covered set; the subscription totals
--   are recomputed (sibling rank is the child's existing rank, kept stable). No
--   client-supplied amounts. Returns the updated quote-style totals.
-- -----------------------------------------------------------------------------
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
  v_interval public.plan_interval;
  v_pct      numeric(5,2);
  v_subjects uuid[];
  v_base     numeric(12,2);
  v_amt      numeric(12,2);
  v_total    numeric(12,2);
begin
  -- Find the child's current live subscription.
  select id, interval, sibling_discount_percent
    into v_sub, v_interval, v_pct
  from public.child_subscriptions
  where student_profile_id = p_student_profile_id
    and status in ('trialing', 'active', 'past_due')
  order by created_at desc
  limit 1;
  if v_sub is null then raise exception 'add_subject: no active subscription'; end if;

  -- The subject must have active pricing for this interval.
  if not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = p_subject_id and sp.interval = v_interval and sp.status = 'active'
  ) then
    raise exception 'add_subject: no active pricing for subject %', p_subject_id;
  end if;

  insert into public.subscription_subjects (child_subscription_id, subject_id)
  values (v_sub, p_subject_id) on conflict do nothing;

  -- Recompute totals from the full covered subject set at the kept sibling rate.
  select array_agg(subject_id) into v_subjects
  from public.subscription_subjects where child_subscription_id = v_sub;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (v_subjects) and sp.interval = v_interval and sp.status = 'active';

  v_amt   := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  update public.child_subscriptions
     set base_amount = v_base, discount_amount = v_amt, total_amount = v_total, updated_at = now()
   where id = v_sub;

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'currency', 'AZN', 'subscription_id', v_sub);
end;
$$;

-- -----------------------------------------------------------------------------
-- remove_subscription_subject : parent removes a subject from the live subscription
--   (at least one subject must remain). Totals are recomputed server-side.
-- -----------------------------------------------------------------------------
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
  v_sub      uuid;
  v_interval public.plan_interval;
  v_pct      numeric(5,2);
  v_count    int;
  v_subjects uuid[];
  v_base     numeric(12,2);
  v_amt      numeric(12,2);
  v_total    numeric(12,2);
begin
  select id, interval, sibling_discount_percent
    into v_sub, v_interval, v_pct
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

  select array_agg(subject_id) into v_subjects
  from public.subscription_subjects where child_subscription_id = v_sub;

  select coalesce(sum(sp.price_amount), 0) into v_base
  from public.subjects_pricing sp
  where sp.subject_id = any (v_subjects) and sp.interval = v_interval and sp.status = 'active';

  v_amt   := round(v_base * v_pct / 100.0, 2);
  v_total := v_base - v_amt;

  update public.child_subscriptions
     set base_amount = v_base, discount_amount = v_amt, total_amount = v_total, updated_at = now()
   where id = v_sub;

  return jsonb_build_object(
    'base', v_base, 'discount_percent', v_pct, 'discount', v_amt,
    'total', v_total, 'currency', 'AZN', 'subscription_id', v_sub);
end;
$$;

revoke all on function public.add_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_subscription_subject(uuid, uuid) to service_role;
revoke all on function public.remove_subscription_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_subscription_subject(uuid, uuid) to service_role;

-- =============================================================================
-- End of 2026_06_28_015_deferred_child_id_and_subject_edits.sql
-- =============================================================================
