-- =============================================================================
-- 2026_07_04_025_payment_modes_phone_admin_grant.sql
-- Round 11 — payment-mode system (real / demo / giveaway, mutually exclusive),
-- parent phone number, and admin free-access grant.
--
-- 1) profiles.phone           : mandatory at parent registration (app-enforced);
--                               stored in E.164 (+994501234567). Column itself is
--                               nullable (children/admins/legacy rows have none).
-- 2) Payment-mode flags       : NEW feature flags `demo_payments` and
--                               `giveaway_period` (both OFF by default) next to
--                               the existing `payments` (= real/automatic) flag.
-- 3) Giveaway settings        : `giveaway.duration_days` (admin-editable number)
--                               and `giveaway.started_at` (stamped by the DB when
--                               the flag flips ON; NOT admin-editable). The
--                               giveaway window = started_at + duration_days;
--                               access checks treat an elapsed window as inactive
--                               even if the flag was never switched off.
-- 4) Exclusivity trigger      : enabling any ONE of payments / demo_payments /
--                               giveaway_period disables the other two at the
--                               DATABASE layer (UI/service enforcement is only a
--                               mirror). All three may be off together.
-- 5) activate_child_login_id  : allocates the deferred 8-digit login ID WITHOUT a
--                               subscription (giveaway add-child path).
-- 6) admin_grant_child_access : admin "payment bypass" — comped ACTIVE
--                               subscription (total 0, provider 'admin_grant'),
--                               allocates the login ID, flips access to 'active'.
--
-- Backports: profiles.phone → 002; trigger + RPCs → 011; seeds → 012;
-- validation checks #33–#35 → 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) profiles.phone — E.164, validated app-side AND by a DB check constraint.
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists phone text;

do $$ begin
  alter table public.profiles
    add constraint chk_profiles_phone_e164
    check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$');
exception when duplicate_object then null; end $$;

comment on column public.profiles.phone is
  'Parent contact phone in E.164 (+<country><number>). Required at parent registration (app-enforced); null for children/admin/legacy rows.';

-- -----------------------------------------------------------------------------
-- 2) + 3) Seeds: payment-mode flags + giveaway settings.
--    giveaway.started_at starts as an empty string ("no giveaway ever started").
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled) values
  ('demo_payments',   false),
  ('giveaway_period', false)
on conflict (key) do nothing;

insert into public.system_settings (key, value_json) values
  ('giveaway.duration_days', '7'::jsonb),
  ('giveaway.started_at',    '""'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 4) Mutual-exclusivity trigger on feature_flags.
--    SECURITY DEFINER so the cross-row/cross-table writes succeed regardless of
--    which authorized caller (admin session under RLS, or service role) flipped
--    the flag. Fires only when a trio flag transitions to enabled; the inner
--    UPDATE sets enabled=false on siblings, which does NOT re-satisfy the WHEN
--    clause — no recursion. Enabling giveaway_period (re)stamps
--    giveaway.started_at = now() so the countdown window restarts.
-- -----------------------------------------------------------------------------
create or replace function public.fn_payment_mode_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only act on a real OFF→ON transition (an idempotent re-save of an already
  -- enabled flag must not restart the giveaway clock).
  if tg_op = 'UPDATE' and old.enabled = true then
    return new;
  end if;

  update public.feature_flags
     set enabled = false, updated_at = now()
   where key in ('payments', 'demo_payments', 'giveaway_period')
     and key <> new.key
     and enabled;

  if new.key = 'giveaway_period' then
    update public.system_settings
       set value_json = to_jsonb(now()), updated_at = now()
     where key = 'giveaway.started_at';
  end if;

  return new;
end;
$$;

comment on function public.fn_payment_mode_exclusivity() is
  'DB-layer guarantee that payments / demo_payments / giveaway_period are never enabled together; stamps giveaway.started_at when the giveaway flips on.';

drop trigger if exists trg_payment_mode_exclusivity on public.feature_flags;
create trigger trg_payment_mode_exclusivity
  after insert or update of enabled on public.feature_flags
  for each row
  when (new.enabled = true and new.key in ('payments', 'demo_payments', 'giveaway_period'))
  execute function public.fn_payment_mode_exclusivity();

-- -----------------------------------------------------------------------------
-- 5) activate_child_login_id — allocate the deferred 8-digit ID WITHOUT creating
--    a subscription. Used by the giveaway add-child flow (access during the
--    giveaway comes from the server-side giveaway override, not from a
--    subscription row, so it reverts automatically when the window ends).
--    Mirrors the allocation block inside create_child_subscription.
-- -----------------------------------------------------------------------------
create or replace function public.activate_child_login_id(
  p_student_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_child text;
  v_auth  uuid;
begin
  select created_by_parent_profile_id, child_unique_id
    into v_owner, v_child
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'activate_login_id: child has no owning parent';
  end if;

  if v_child is null then
    v_child := public.allocate_child_unique_id(p_student_profile_id);
    update public.child_credentials
       set child_unique_id = v_child, updated_at = now()
     where student_profile_id = p_student_profile_id;
  end if;

  select auth_user_id into v_auth
  from public.child_credentials where student_profile_id = p_student_profile_id;

  return jsonb_build_object('new_child_unique_id', v_child, 'auth_user_id', v_auth);
end;
$$;

comment on function public.activate_child_login_id(uuid) is
  'Allocate the deferred 8-digit child login ID without a subscription (giveaway add-child path). service_role EXECUTE only; caller authorizes parent ownership first.';

revoke all on function public.activate_child_login_id(uuid) from public, anon, authenticated;
grant execute on function public.activate_child_login_id(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 6) admin_grant_child_access — Administrator payment bypass (Round 11 item 7).
--    Creates a COMPED subscription: status 'active', provider 'admin_grant',
--    all amounts 0 (nothing was charged — pricing is validated to exist so the
--    granted subjects are real, but no money figures are fabricated). Period =
--    now → now + p_days (default: week 7 / month 30 / year 365). Allocates the
--    8-digit login ID exactly like create_child_subscription. NO sibling
--    discount row (nothing paid). service_role EXECUTE only — the admin-panel
--    server action calls it AFTER requireAdmin() and writes the audit row.
-- -----------------------------------------------------------------------------
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
begin
  if p_subject_ids is null or array_length(p_subject_ids, 1) is null then
    raise exception 'admin_grant: no subjects selected';
  end if;

  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then
    raise exception 'admin_grant: child has no owning parent';
  end if;

  -- Grant length: explicit days (1..730) or the interval's natural length.
  v_days := coalesce(p_days,
                     case p_interval when 'week' then 7 when 'month' then 30 else 365 end);
  if v_days < 1 or v_days > 730 then
    raise exception 'admin_grant: days out of range (1..730)';
  end if;

  -- Every granted subject must be a real, actively priced subject for the
  -- interval (prevents granting retired/unknown subject ids).
  select count(*) into v_missing
  from unnest(p_subject_ids) s(sid)
  where not exists (
    select 1 from public.subjects_pricing sp
    where sp.subject_id = s.sid and sp.interval = p_interval and sp.status = 'active'
  );
  if v_missing > 0 then
    raise exception 'admin_grant: missing active pricing for % subject(s)', v_missing;
  end if;

  -- Refuse a second live plan (same invariant the parent flow relies on).
  if exists (
    select 1 from public.child_subscriptions
    where student_profile_id = p_student_profile_id
      and status in ('trialing', 'active', 'past_due')
  ) then
    raise exception 'admin_grant: child already has a live subscription';
  end if;

  insert into public.child_subscriptions
    (student_profile_id, owner_parent_profile_id, interval, status,
     current_period_start, current_period_end,
     base_amount, sibling_discount_percent, discount_amount, total_amount,
     currency, provider)
  values
    (p_student_profile_id, v_owner, p_interval, 'active',
     now(), now() + (v_days || ' days')::interval,
     0, 0, 0, 0, 'AZN', 'admin_grant')
  returning id into v_sub;

  foreach v_sid in array p_subject_ids loop
    insert into public.subscription_subjects (child_subscription_id, subject_id)
    values (v_sub, v_sid) on conflict do nothing;
  end loop;

  -- Allocate the login ID if this child never had a plan before.
  v_ids := public.activate_child_login_id(p_student_profile_id);

  update public.students set access_status = 'active'
   where profile_id = p_student_profile_id;

  return jsonb_build_object(
    'subscription_id', v_sub, 'status', 'active', 'days', v_days,
    'current_period_end', to_jsonb(now() + (v_days || ' days')::interval))
    || v_ids;
end;
$$;

comment on function public.admin_grant_child_access(uuid, public.plan_interval, uuid[], int) is
  'Administrator payment bypass: comped ACTIVE child subscription (amounts 0, provider admin_grant), allocates the 8-digit login ID, flips access_status to active. service_role EXECUTE only; admin-panel action guards + audits.';

revoke all on function public.admin_grant_child_access(uuid, public.plan_interval, uuid[], int) from public, anon, authenticated;
grant execute on function public.admin_grant_child_access(uuid, public.plan_interval, uuid[], int) to service_role;

commit;

-- =============================================================================
-- End of 2026_07_04_025_payment_modes_phone_admin_grant.sql
-- =============================================================================
