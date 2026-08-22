-- =============================================================================
-- 2026_08_22_134 — THE GIVEAWAY LIFECYCLE: one clock, three warnings, and an
--                  ending that returns the platform to normal by itself.
--
-- The owner's specification, implemented on the model the platform already has:
-- a giveaway is BLANKET FREE ACCESS, never a set of zero-amount subscription
-- records. `has_subject_access()` already returns true for any subject while a
-- campaign runs and writes nothing, so an existing paid subscription is
-- untouched -- no period moves, no metadata is rewritten, nothing is cancelled
-- (spec §2 and §7). This migration fixes the parts that were missing or wrong.
--
--   1 — ONE SOURCE OF TRUTH FOR "IS IT RUNNING" (spec §8).
--       `is_giveaway_active()` parsed `giveaway.duration_days` more loosely than
--       `current_payment_mode()` did, so the two could disagree about the same
--       campaign -- one granting access while the other resolved a different
--       payment mode. It now DELEGATES. No recursion: current_payment_mode()
--       does its own parsing and has never called this function.
--
--   2 — THREE WARNINGS, NOT ONE (spec §5, §10).
--       notify_giveaway_ending fired inside a 2-day window and keyed idempotency
--       on `gvw:<parent>:<window end>` -- no rung in the key -- so the daily job
--       produced exactly ONE notice per parent per campaign and every later day
--       was silently discarded by `on conflict do nothing`. That is the same
--       defect migration 130 fixed for subscription lapses, in the same shape.
--       Now 3 / 2 / 1 whole calendar days, the rung in the key, and priority
--       escalating 3 -> 2 -> 1.
--
--       PRIORITY 1 ON THE FINAL RUNG reaches an inbox that has been muted, and
--       (since migration 133) also survives the `notifications` master switch.
--       Both exemptions are deliberate: this is the last warning before a family
--       loses access, and there is no fourth.
--
--   3 — THE LAPSE REMINDERS GO QUIET DURING A CAMPAIGN.
--       They told parents access would stop on a date when it would not, and to
--       act when every payment rail was refusing them (gate.giveawayFree).
--
--   4 — THE CAMPAIGN ENDS BY ITSELF (spec §6). Migration 133 added
--       `restore_payments_after_giveaway()`; this schedules it hourly, so the
--       window elapsing returns the platform to selling with no manual step.
--
-- THE COPY IS AZERBAIJANI, like every other DB-emitted notice: the notifications
-- table stores literal title/body and `profiles.preferred_locale` is never
-- written, so branching on it would ship one language under three names.
--
-- ONE DELIBERATE DEVIATION FROM THE SPEC'S SUGGESTED WORDING: the final rung
-- does not say "review the available subscription plans". These rows render
-- inside the purchase-silent mobile binaries, where a notification that directs
-- a user toward a purchase surface is Apple 3.1.1(a) steering
-- (docs/STORE_PAYMENTS_COMPLIANCE.md §5). It states the same fact -- that
-- premium sections need a subscription once the campaign ends -- without
-- instructing anyone to go and buy.
--
-- Self-transacting. Backported into canonical 011 (functions) and 016 (the job).
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 — one clock.
-- -----------------------------------------------------------------------------
create or replace function public.is_giveaway_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- MIGRATION 134: delegate, so a campaign can never be "running" for access and
  -- "not running" for the payment mode. current_payment_mode() parses the flag,
  -- the start and the duration itself and does NOT call this function, so this
  -- is a one-way dependency and cannot recurse.
  select public.current_payment_mode() = 'giveaway';
$$;

revoke all on function public.is_giveaway_active() from public, anon;
grant execute on function public.is_giveaway_active() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2 — three warnings, each landing exactly once.
-- -----------------------------------------------------------------------------
create or replace function public.notify_giveaway_ending()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start  timestamptz;
  v_dur    int;
  v_end    timestamptz;
  v_days   int;
  v_parent uuid;
  v_title  text;
  v_body   text;
  v_prio   int;
  v_sent   uuid;
  v_n      int := 0;
begin
  if not public.is_giveaway_active() then return 0; end if;

  select nullif(value_json #>> '{}', '')::timestamptz into v_start
    from public.system_settings where key = 'giveaway.started_at';
  select nullif(value_json #>> '{}', '')::int into v_dur
    from public.system_settings where key = 'giveaway.duration_days';
  if v_start is null or coalesce(v_dur, 0) <= 0 then return 0; end if;
  v_end := v_start + make_interval(days => v_dur);

  -- WHOLE CALENDAR DAYS, like migration 130. An epoch-based rung depends on what
  -- time the cron happens to fire and can skip a step entirely.
  v_days := v_end::date - now()::date;
  if v_days not in (3, 2, 1) then return 0; end if;

  if v_days = 3 then
    v_prio  := 3;
    v_title := 'Pulsuz giriş 3 gün sonra bitir';
    v_body  := 'Kampaniya dövrü başa çatmaq üzrədir. 3 gün sonra platforma adi abunə sisteminə qayıdır.';
  elsif v_days = 2 then
    v_prio  := 2;
    v_title := 'Pulsuz giriş 2 gün sonra bitir';
    v_body  := 'Tam pulsuz girişə cəmi 2 gün qalıb. Kampaniya bitdikdən sonra premium bölmələr üçün abunəlik tələb olunacaq.';
  else
    v_prio  := 1;
    v_title := 'Son xəbərdarlıq: pulsuz giriş sabah bitir';
    v_body  := 'Kampaniya sabah başa çatır. Pulsuz giriş dövrü bitdikdə platforma abunə sisteminə qayıdır və premium bölmələr üçün abunəlik tələb olunur.';
  end if;

  for v_parent in select profile_id from public.parents
  loop
    -- THE RUNG IS IN THE KEY. Without it the second and third warnings collide
    -- with the first on `on conflict (idempotency_key) do nothing` and are
    -- thrown away in silence -- which is exactly what the old key did. The
    -- window END stays in the key too, so a LATER campaign starts a fresh series
    -- rather than being permanently muted by the previous one (spec §10).
    select public.create_notification(
      v_parent, 'giveaway_ending', v_title, v_body,
      jsonb_build_object('ends_at', v_end, 'days', v_days),
      array['in_app'],
      'gvw:' || v_parent::text || ':' || v_end::text || ':d' || v_days::text,
      v_prio, '/services', 'announcement', null) into v_sent;
    -- Count what was SENT, not what was considered: create_notification returns
    -- NULL on a deduped write, and a counter that ignores that reports a full
    -- run every day while sending nothing.
    if v_sent is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.notify_giveaway_ending() from public, anon, authenticated;
grant execute on function public.notify_giveaway_ending() to service_role;

-- -----------------------------------------------------------------------------
-- 3 — the lapse reminders stay quiet while the platform is free.
-- -----------------------------------------------------------------------------
create or replace function public.notify_expiring_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      record;
  v_name     text;
  v_subjects text;
  v_when     text;
  v_title    text;
  v_body     text;
  v_prio     int;
  v_sent     uuid;
  v_n        int := 0;
begin
  -- MIGRATION 134 -- SILENT DURING A CAMPAIGN. These warnings say "access stops
  -- on <date>, and nothing renews it automatically". During a giveaway BOTH
  -- halves are false: access is not stopping, and every payment rail refuses a
  -- plan change anyway (gate.giveawayFree), so the parent is told to act and
  -- then prevented from acting. The campaign has its own three-rung warning
  -- chain -- notify_giveaway_ending -- which is the one that is true right now.
  if public.is_giveaway_active() then
    return 0;
  end if;

  for v_row in
    select cs.id,
           cs.owner_parent_profile_id,
           cs.student_profile_id,
           ss.current_period_end::date                                     as end_date,
           (ss.current_period_end::date - now()::date)                     as days_left,
           s.first_name,
           s.last_name,
           string_agg(distinct coalesce(nullif(btrim(subj.name), ''), '—'), ', ')
             as subject_names
    from public.child_subscriptions cs
    join public.subscription_subjects ss on ss.child_subscription_id = cs.id
    join public.students s              on s.profile_id = cs.student_profile_id
    left join public.subjects subj      on subj.id = ss.subject_id
    where cs.status in ('trialing', 'active')
      -- A subject the parent has ALREADY chosen to drop is not lapsing, it is
      -- ending on purpose. Warning about it would be nagging.
      and ss.remove_at is null
      and ss.current_period_end is not null
      -- WHOLE CALENDAR DAYS. See the header: an epoch-based rung depends on what
      -- time the cron happens to fire and can skip a step entirely.
      and (ss.current_period_end::date - now()::date) in (3, 2, 1)
      and cs.owner_parent_profile_id is not null
    group by cs.id, cs.owner_parent_profile_id, cs.student_profile_id,
             ss.current_period_end::date, s.first_name, s.last_name
  loop
    v_name := coalesce(
      nullif(btrim(coalesce(v_row.first_name, '') || ' ' || coalesce(v_row.last_name, '')), ''),
      'övladınız');
    v_subjects := coalesce(nullif(btrim(v_row.subject_names), ''), 'abunəlik');
    v_when := to_char(v_row.end_date, 'DD.MM.YYYY');

    -- Three rungs, three sentences. Each states WHAT ends, WHEN, and that
    -- nothing renews it automatically. None names a price, a place or an action.
    if v_row.days_left = 3 then
      v_prio  := 3;
      v_title := 'Abunə 3 gün sonra bitir';
      v_body  := v_name || ' üçün ' || v_subjects || ' abunəliyi ' || v_when ||
                 ' tarixində başa çatır. Abunəlik avtomatik yenilənmir.';
    elsif v_row.days_left = 2 then
      v_prio  := 2;
      v_title := 'Abunə 2 gün sonra bitir';
      v_body  := v_name || ' üçün ' || v_subjects || ' abunəliyi ' || v_when ||
                 ' tarixində başa çatır. Abunəlik avtomatik yenilənmir; uzadılmasa, giriş həmin tarixdə dayanacaq.';
    else
      -- The last one a parent will get. Priority 1 reaches an inbox that has
      -- been muted, because there is no fourth chance and nothing charges a card.
      v_prio  := 1;
      v_title := 'Son xəbərdarlıq: abunə sabah bitir';
      v_body  := v_name || ' üçün ' || v_subjects || ' abunəliyi sabah — ' || v_when ||
                 ' — başa çatır. Uzadılmadığı təqdirdə həmin gün giriş dayanacaq.';
    end if;

    -- COUNT WHAT WAS ACTUALLY SENT, not what was considered. create_notification
    -- returns NULL when its `on conflict (idempotency_key) do nothing` discards a
    -- duplicate, and the old code `perform`ed it and incremented regardless -- so
    -- a run that sent nothing still reported one per candidate row. Nothing reads
    -- this number today, which is exactly how a lying counter survives until the
    -- day somebody debugging a missing reminder trusts it.
    select public.create_notification(
      v_row.owner_parent_profile_id,
      'subject_expiring',
      v_title,
      v_body,
      jsonb_build_object(
        'child_name', v_name,
        'student_profile_id', v_row.student_profile_id,
        'subjects', v_subjects,
        'days', v_row.days_left,
        'ends_on', v_when,
        'subscription_id', v_row.id),
      array['in_app'],
      -- THE DAY BUCKET IS WHAT MAKES THE CHAIN WORK. Without it the second and
      -- third warnings collide with the first on `on conflict (idempotency_key)
      -- do nothing` and are silently discarded — which is exactly what the old
      -- key did. period_end stays in the key so a RENEWED subject starts a fresh
      -- series rather than being permanently muted by the old one.
      'subexp:' || v_row.id::text || ':' || v_row.end_date::text || ':d' || v_row.days_left::text,
      v_prio,
      -- A RELATIVE path. §5 forbids opening an external https URL from
      -- notification content; the mobile client allowlists relative routes.
      '/subscription',
      'billing',
      null) into v_sent;
    if v_sent is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.notify_expiring_subscriptions() from public, anon, authenticated;
grant execute on function public.notify_expiring_subscriptions() to service_role;

-- -----------------------------------------------------------------------------
-- 4 — the campaign ends by itself (spec §6). Hourly: the restore is idempotent
-- and refuses to act while a window is still running.
-- -----------------------------------------------------------------------------
do $$
declare v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    raise notice '134: pg_cron absent - the giveaway restore is not scheduled.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_restore_payments_after_giveaway';
  perform cron.schedule(
    'olympiq_restore_payments_after_giveaway',
    '9 * * * *',
    'select public.restore_payments_after_giveaway();'
  );
  raise notice '134: pg_cron job olympiq_restore_payments_after_giveaway scheduled (hourly at :09).';
end $$;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.is_giveaway_active()'::regprocedure);
  if position('current_payment_mode' in v_def) = 0 then
    raise exception '134: is_giveaway_active does not delegate to current_payment_mode';
  end if;

  v_def := pg_get_functiondef('public.notify_giveaway_ending()'::regprocedure);
  if position('in (3, 2, 1)' in v_def) = 0 then
    raise exception '134: the giveaway warning is not a three-rung chain';
  end if;
  if position(''':d'' || v_days' in v_def) = 0 then
    raise exception '134: the rung is missing from the idempotency key - rungs 2 and 1 would be deduped away';
  end if;
  if position('if v_sent is not null then' in v_def) = 0 then
    raise exception '134: the counter reports candidates rather than notifications sent';
  end if;

  v_def := pg_get_functiondef('public.notify_expiring_subscriptions()'::regprocedure);
  if position('is_giveaway_active' in v_def) = 0 then
    raise exception '134: lapse reminders still fire during a campaign';
  end if;
  raise notice '134: all checks passed';
end $$;

commit;
