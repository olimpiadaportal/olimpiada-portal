-- ============================================================================
-- Migration: 2026_07_19_074_notification_producers.sql
-- Round 29 (owner ask): wire the seeded-but-dormant notification templates that
-- do NOT require a payment provider, and add industry-standard operational
-- alerts to administrators.
--
-- Producers added (all service-role only; all call the DEFINER create_notification;
-- all wrapped so a notify failure NEVER breaks the underlying business action):
--   * personal_best + streak_milestone — a sibling trigger on test_attempts
--     '→ graded', firing AFTER award_attempt_points (name order: trg_award_* <
--     trg_notify_progress_*), so it reads the streak the award writer just set.
--   * subject_expiring — a daily cron scanner over child_subscriptions whose
--     current_period_end falls within the next 3 days (parent-directed).
--   * giveaway_ending — a daily cron scanner that warns all parents in the last
--     2 days of an active giveaway window.
--   * ADMIN operational alerts — new-parent / new-purchase / new-subscription
--     INSERT triggers notify every administrator (the platform had NO admin-
--     facing notifications before). Delivered into the same notifications table
--     the admin bell reads (self-scoped RLS already allows it).
--
-- Idempotency keys make every producer at-most-once (cron re-runs and repeated
-- same-day attempts never double-send). subject_charge_failed stays UNWIRED by
-- design — it needs the real payment provider (tracked in the payment backlog).
--
-- Backported into canonical 011 (functions/triggers) + 016 (the two cron jobs).
-- 013 check #74.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) notify_admins — enumerate administrators and create one notification each
--    with a per-admin idempotency key (so an event notifies each admin once).
-- ----------------------------------------------------------------------------
create or replace function public.notify_admins(
  p_type       text,
  p_title      text,
  p_body       text,
  p_data       jsonb,
  p_key_base   text,
  p_action_url text,
  p_category   text default 'admin',
  p_priority   int default 3
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_admin uuid; v_n int := 0;
begin
  for v_admin in
    select pr.profile_id
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    where r.code = 'administrator'
  loop
    perform public.create_notification(
      v_admin, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb),
      array['in_app'], p_key_base || ':' || v_admin::text, p_priority,
      p_action_url, p_category, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.notify_admins(text,text,text,jsonb,text,text,text,int) from public, anon, authenticated;
grant execute on function public.notify_admins(text,text,text,jsonb,text,text,text,int) to service_role;

-- ----------------------------------------------------------------------------
-- 2) Admin operational alerts (INSERT triggers). action_url values are
--    ADMIN-PANEL routes — these notifications only ever reach administrators
--    and are only rendered by the admin bell.
-- ----------------------------------------------------------------------------
create or replace function public.notify_admin_new_parent_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  begin
    select coalesce(nullif(btrim(p.display_name), ''), 'Yeni valideyn')
      into v_name from public.profiles p where p.id = new.profile_id;
    perform public.notify_admins(
      'admin_new_parent', 'Yeni valideyn qeydiyyatı',
      v_name || ' platformada qeydiyyatdan keçdi.',
      jsonb_build_object('parent_profile_id', new.profile_id),
      'admin:newparent:' || new.profile_id::text, '/accounts', 'admin', 3);
  exception when others then raise warning 'notify_admin_new_parent failed: %', sqlerrm;
  end;
  return new;
end; $$;
drop trigger if exists trg_notify_admin_new_parent on public.parents;
create trigger trg_notify_admin_new_parent
  after insert on public.parents
  for each row execute function public.notify_admin_new_parent_tg();

create or replace function public.notify_admin_new_purchase_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.notify_admins(
      'admin_new_purchase', 'Yeni olimpiada alışı',
      'Yeni olimpiada paketi alışı: ' || trim_scale(new.amount)::text || ' ' || coalesce(new.currency, 'AZN') || '.',
      jsonb_build_object('purchase_id', new.id, 'package_id', new.olympiad_package_id,
                         'amount', new.amount, 'currency', new.currency),
      'admin:purchase:' || new.id::text, '/olympiad', 'admin', 3);
  exception when others then raise warning 'notify_admin_new_purchase failed: %', sqlerrm;
  end;
  return new;
end; $$;
drop trigger if exists trg_notify_admin_new_purchase on public.olympiad_purchases;
create trigger trg_notify_admin_new_purchase
  after insert on public.olympiad_purchases
  for each row execute function public.notify_admin_new_purchase_tg();

create or replace function public.notify_admin_new_subscription_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.notify_admins(
      'admin_new_subscription', 'Yeni abunə',
      'Bir uşaq üçün yeni abunə başladıldı (' || new.status || ').',
      jsonb_build_object('subscription_id', new.id, 'student_profile_id', new.student_profile_id,
                         'status', new.status),
      'admin:sub:' || new.id::text, '/accounts', 'admin', 3);
  exception when others then raise warning 'notify_admin_new_subscription failed: %', sqlerrm;
  end;
  return new;
end; $$;
drop trigger if exists trg_notify_admin_new_subscription on public.child_subscriptions;
create trigger trg_notify_admin_new_subscription
  after insert on public.child_subscriptions
  for each row when (new.status in ('trialing','active'))
  execute function public.notify_admin_new_subscription_tg();

-- ----------------------------------------------------------------------------
-- 3) Student progress milestones — personal_best (rated attempts only) +
--    streak_milestone. Fires AFTER award_attempt_points on the same
--    '→ graded' transition, so students.current_streak is already updated.
-- ----------------------------------------------------------------------------
create or replace function public.notify_progress_milestones_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_streak int; v_last date; v_prev numeric; v_this numeric;
begin
  begin
    -- streak milestone (any graded attempt that advanced the streak today)
    select current_streak, last_active_date into v_streak, v_last
      from public.students where profile_id = new.student_profile_id;
    if v_streak in (3, 7, 14, 30, 60, 100) then
      perform public.create_notification(
        new.student_profile_id, 'streak_milestone', 'Seriya davam edir 🔥',
        v_streak::text || ' günlük seriya! Davam et.',
        jsonb_build_object('days', v_streak),
        array['in_app'],
        'streak:' || new.student_profile_id::text || ':' || v_streak::text || ':' || coalesce(v_last::text, 'x'),
        4, '/child/leaderboard', 'progress', null);
    end if;

    -- personal best (RATED daily rounds only; genuine improvement over a prior
    -- best — never on the first-ever scoring attempt where prev = 0).
    if new.is_rated then
      select coalesce(max(points), 0) into v_prev
        from public.student_points_ledger
        where student_profile_id = new.student_profile_id and attempt_id <> new.id;
      select coalesce(points, 0) into v_this
        from public.student_points_ledger where attempt_id = new.id;
      if v_this > v_prev and v_prev > 0 then
        perform public.create_notification(
          new.student_profile_id, 'personal_best', 'Yeni rekord!',
          'Yeni şəxsi rekordun: ' || trim_scale(v_this)::text || ' xal 🎉',
          jsonb_build_object('points', v_this),
          array['in_app'],
          'pb:' || new.student_profile_id::text || ':' || new.id::text,
          4, '/child/leaderboard', 'progress', null);
      end if;
    end if;
  exception when others then raise warning 'notify_progress_milestones failed: %', sqlerrm;
  end;
  return new;
end; $$;
drop trigger if exists trg_notify_progress_milestones on public.test_attempts;
create trigger trg_notify_progress_milestones
  after update of status on public.test_attempts
  for each row
  when (new.status = 'graded' and old.status is distinct from new.status)
  execute function public.notify_progress_milestones_tg();

-- ----------------------------------------------------------------------------
-- 4) subject_expiring scanner — parents whose child subscription lapses within
--    3 days. Idempotency keyed by (subscription, period_end) → once per period.
-- ----------------------------------------------------------------------------
create or replace function public.notify_expiring_subscriptions()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row record; v_days int; v_name text; v_n int := 0;
begin
  for v_row in
    select cs.id, cs.owner_parent_profile_id, cs.current_period_end,
           s.first_name, s.last_name
    from public.child_subscriptions cs
    join public.students s on s.profile_id = cs.student_profile_id
    where cs.status in ('trialing', 'active')
      and cs.current_period_end is not null
      and cs.current_period_end > now()
      and cs.current_period_end <= now() + interval '3 days'
      and cs.owner_parent_profile_id is not null
  loop
    v_days := greatest(1, ceil(extract(epoch from (v_row.current_period_end - now())) / 86400.0)::int);
    v_name := coalesce(nullif(btrim(coalesce(v_row.first_name, '') || ' ' || coalesce(v_row.last_name, '')), ''), 'övladınız');
    perform public.create_notification(
      v_row.owner_parent_profile_id, 'subject_expiring', 'Abunə bitmək üzrədir',
      v_name || ' üçün abunə ' || v_days::text || ' gün sonra bitir.',
      jsonb_build_object('child_name', v_name, 'days', v_days, 'subscription_id', v_row.id),
      array['in_app'],
      'subexp:' || v_row.id::text || ':' || v_row.current_period_end::text,
      3, '/subscription', 'billing', null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
revoke all on function public.notify_expiring_subscriptions() from public, anon, authenticated;
grant execute on function public.notify_expiring_subscriptions() to service_role;

-- ----------------------------------------------------------------------------
-- 5) giveaway_ending scanner — warn all parents in the last 2 days of an active
--    giveaway. Idempotency keyed by (parent, window end) → once per window.
-- ----------------------------------------------------------------------------
create or replace function public.notify_giveaway_ending()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_start timestamptz; v_dur int; v_end timestamptz; v_days int; v_parent uuid; v_n int := 0;
begin
  if not public.is_giveaway_active() then return 0; end if;
  select nullif(value_json #>> '{}', '')::timestamptz into v_start
    from public.system_settings where key = 'giveaway.started_at';
  select nullif(value_json #>> '{}', '')::int into v_dur
    from public.system_settings where key = 'giveaway.duration_days';
  if v_start is null or coalesce(v_dur, 0) <= 0 then return 0; end if;
  v_end := v_start + make_interval(days => v_dur);
  -- only the final 2 days of the window
  if now() < v_end - interval '2 days' or now() >= v_end then return 0; end if;
  v_days := greatest(1, ceil(extract(epoch from (v_end - now())) / 86400.0)::int);
  for v_parent in select profile_id from public.parents loop
    perform public.create_notification(
      v_parent, 'giveaway_ending', 'Kampaniya bitir',
      'Pulsuz kampaniya ' || v_days::text || ' gün sonra başa çatır.',
      jsonb_build_object('ends_at', v_end, 'days', v_days),
      array['in_app'],
      'gvw:' || v_parent::text || ':' || v_end::text,
      4, '/services', 'announcement', null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
revoke all on function public.notify_giveaway_ending() from public, anon, authenticated;
grant execute on function public.notify_giveaway_ending() to service_role;

-- ----------------------------------------------------------------------------
-- 6) Schedule the two scanners (guarded — self-skips where pg_cron is absent).
-- ----------------------------------------------------------------------------
do $$
declare v_has_cron boolean;
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron extension not available here (%).', sqlerrm;
  end;
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if v_has_cron then
    perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_notify_expiring_subscriptions';
    perform cron.schedule('olympiq_notify_expiring_subscriptions', '0 4 * * *',
                          'select public.notify_expiring_subscriptions();');
    perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_notify_giveaway_ending';
    perform cron.schedule('olympiq_notify_giveaway_ending', '30 4 * * *',
                          'select public.notify_giveaway_ending();');
    raise notice 'notification scanner cron jobs scheduled.';
  else
    raise notice 'pg_cron absent — notification scanners NOT scheduled (skipped safely).';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Self-verify (existence/definition only — no side-effecting sends here).
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.notify_admins(text,text,text,jsonb,text,text,text,int)') is null
     or to_regprocedure('public.notify_expiring_subscriptions()') is null
     or to_regprocedure('public.notify_giveaway_ending()') is null then
    raise exception 'a notification producer function is missing';
  end if;
  if has_function_privilege('anon','public.notify_admins(text,text,text,jsonb,text,text,text,int)','EXECUTE')
     or has_function_privilege('authenticated','public.notify_expiring_subscriptions()','EXECUTE') then
    raise exception 'a producer is reachable by anon/authenticated (must be service-role only)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_notify_progress_milestones'
                   and tgrelid = 'public.test_attempts'::regclass) then
    raise exception 'progress-milestones trigger not attached';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_notify_admin_new_parent'
                   and tgrelid = 'public.parents'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'trg_notify_admin_new_purchase'
                   and tgrelid = 'public.olympiad_purchases'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'trg_notify_admin_new_subscription'
                   and tgrelid = 'public.child_subscriptions'::regclass) then
    raise exception 'an admin-alert trigger is not attached';
  end if;
  raise notice 'notification producers self-verify PASS.';
end $$;

commit;
