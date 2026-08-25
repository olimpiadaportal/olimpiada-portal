-- =============================================================================
-- 2026_08_25_138 - A NOTIFICATION CHANNEL NOBODY COULD RECEIVE.
--
-- `notification_deliveries` holds ZERO rows. Not few - none, ever, on production.
-- The notification engine is complete, the Brevo transport has shipped since
-- migration 116, and `delivery.ts` already delegates to it. And still nothing
-- could ever be sent, for two independent reasons, either of which alone is
-- sufficient to send nothing:
--
--   1. NOBODY ASKED FOR THE CHANNEL. `create_notification` writes an email
--      delivery row only when 'email' appears in p_channels AND the
--      notifications_email flag is on AND the recipient's preference allows it.
--      Every producer passed `array['in_app']`. Turning the flag on would have
--      sent exactly zero emails and looked like a broken provider.
--
--   2. NOTHING DRAINED THE QUEUE. /api/notifications/process has no caller at
--      all: no vercel.json (Hobby caps crons at once daily), no pg_cron job, no
--      external cron. A queue with no consumer.
--
-- WHY THIS MATTERS MORE THAN IT LOOKS. ABB has not approved recurring billing
-- (ticket AZCDF-100303), so renewals are MANUAL: a subscription simply stops
-- unless the parent comes back and pays again. The 3/2/1-day reminder chain is
-- therefore not a courtesy, it is the entire retention mechanism -- and the
-- PARENT is the payer while the CHILD is the daily user. A parent may not open
-- the portal for weeks. An in-app-only warning is a warning nobody reads:
-- access lapses quietly and the family finds out from a locked-out child.
--
-- WHICH NOTIFICATIONS GET EMAIL, AND WHY NOT ALL OF THEM. Only the two that mean
-- "your child's access is about to change": the renewal chain and the
-- giveaway-ending chain. Achievements, streak milestones and report-status
-- updates stay in-app deliberately -- an email per personal best trains parents
-- to ignore our mail, which would cost us the one message that matters.
--
-- Requesting the channel is inert until the notifications_email flag is turned
-- on, so this migration changes no observable behaviour by itself.
--
-- Self-transacting. Backported verbatim into canonical 011 and 016.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 - the renewal chain asks for email.
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
      -- MIGRATION 138: the EMAIL channel is requested here.
      --
      -- Renewals are MANUAL (ABB has not approved recurring), so this chain is
      -- the entire retention mechanism -- and the parent is the payer while the
      -- CHILD is the daily user. A parent may not open the portal for weeks, so
      -- an in-app-only warning is a warning nobody reads: access lapses quietly
      -- and the family finds out from a locked-out child.
      --
      -- Nothing is sent until BOTH the notifications_email flag is on AND the
      -- recipient's email_enabled preference allows it; create_notification
      -- checks both before it writes a delivery row. Asking for the channel is
      -- therefore safe on its own and inert until deliberately enabled.
      array['in_app', 'email'],
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
-- 2 - the giveaway-ending chain asks for email.
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
      -- MIGRATION 138: the EMAIL channel is requested here, for the same
      -- reason as the renewal chain -- this is the other notification that
      -- means "your child's access is about to change", and it is the only
      -- warning before a free period ends and subjects start costing money.
      -- Gated by the notifications_email flag and the recipient's preference.
      array['in_app', 'email'],
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
-- 3 - something to drain the queue.
-- -----------------------------------------------------------------------------
create or replace function public.notifications_process_kick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url   text;
  v_key   text;
  v_host  text;
  v_req   bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'notifications_process_kick: pg_net is not installed; nothing to do.';
    return null;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notifications_process_url' limit 1;
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'notifications_processor_key' limit 1;

  -- Fail CLOSED and quietly. Not configured is the ordinary state of a fresh
  -- database, and this fires every five minutes.
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    raise notice 'notifications_process_kick: not configured (vault secrets missing); skipping.';
    return null;
  end if;

  -- OUR OWN ENDPOINT ONLY, exactly as azericard_reconcile_kick does it. The
  -- shared secret is useless to anyone but us, but a secret posted at an
  -- attacker-chosen host is still a credential leak, and a hardcoded allowlist
  -- is the one check a later Vault write cannot talk its way around.
  v_host := split_part(split_part(regexp_replace(v_url, '^https://', ''), '/', 1), ':', 1);
  if v_url !~ '^https://' or v_host not in ('olympiq.ai', 'www.olympiq.ai', 'staging.olympiq.ai') then
    raise warning 'notifications_process_kick: refusing to post to an unexpected host (%).', v_host;
    return null;
  end if;

  -- Fire and forget. The ROUTE claims pending deliveries and records every
  -- outcome; a cron job that waits on a network call blocks a worker for its
  -- duration. Failures land in net._http_response.
  --
  -- KNOWN LIMITATION, stated rather than hidden: like the reconcile kick, this
  -- never reads the HTTP result, so a wrong key produces 401s that pg_cron still
  -- records as successful runs. On 2026-08-25 exactly that hid a 75-minute
  -- reconcile outage. Watch net._http_response, not cron.job_run_details.
  select net.http_post(
           url                  => v_url,
           body                 => '{}'::jsonb,
           params               => '{}'::jsonb,
           headers              => jsonb_build_object(
                                     'Content-Type',    'application/json',
                                     'x-processor-key', v_key),
           timeout_milliseconds => 55000
         ) into v_req;
  return v_req;
end $$;
revoke all on function public.notifications_process_kick() from public, anon, authenticated;
grant execute on function public.notifications_process_kick() to service_role;
comment on function public.notifications_process_kick() is
  'Migration 138: pg_cron entrypoint that asks the web app to drain notification_deliveries. Vault-configured, host-allowlisted, fire-and-forget.';
-- -----------------------------------------------------------------------------
-- 4 - drain the queue every five minutes.
--
-- Nothing called /api/notifications/process before this. There is no vercel.json
-- (a Hobby plan caps crons at once daily), no pg_cron job and no external
-- caller, so notification_deliveries was a queue with no consumer -- which is
-- why it holds ZERO rows despite the engine being complete. Mirrors the proven
-- olympiq_azericard_reconcile pattern rather than inventing a second one.
-- -----------------------------------------------------------------------------
do $$
declare
  v_has_cron boolean;
  v_has_net  boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net')  into v_has_net;
  if not v_has_cron then
    raise notice '138: pg_cron absent - notification processor not scheduled.';
    return;
  end if;
  if not v_has_net then
    raise notice '138: pg_net absent - notification processor not scheduled.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_notifications_process';
  perform cron.schedule(
    'olympiq_notifications_process',
    '*/5 * * * *',
    'select public.notifications_process_kick();'
  );
  raise notice '138: pg_cron job olympiq_notifications_process scheduled (*/5).';
end $$;

-- -----------------------------------------------------------------------------
-- VERIFICATION.
-- -----------------------------------------------------------------------------
do $$
declare
  v_src text;
begin
  v_src := pg_get_functiondef('public.notify_expiring_subscriptions()'::regprocedure);
  if position('''in_app'', ''email''' in v_src) = 0 then
    raise exception '138: the renewal chain still does not request the email channel';
  end if;

  v_src := pg_get_functiondef('public.notify_giveaway_ending()'::regprocedure);
  if position('''in_app'', ''email''' in v_src) = 0 then
    raise exception '138: the giveaway chain still does not request the email channel';
  end if;

  if to_regprocedure('public.notifications_process_kick()') is null then
    raise exception '138: notifications_process_kick was not created';
  end if;

  -- The achievement producers must NOT have been swept along.
  v_src := pg_get_functiondef('public.notify_progress_milestones_tg()'::regprocedure);
  if position('''in_app'', ''email''' in v_src) > 0 then
    raise exception '138: progress milestones must stay in-app only';
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'olympiq_notifications_process') then
    raise warning '138: pg_cron present but olympiq_notifications_process is not scheduled.';
  end if;

  raise notice '138: the two access-changing chains request email, and the queue has a consumer';
end $$;

commit;
