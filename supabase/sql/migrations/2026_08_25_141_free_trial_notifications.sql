-- =============================================================================
-- 2026_08_25_141 — TELLING THE PARENT THE FREE DAY IS ENDING.
--
-- Three rungs, owner decision 2026-08-25: 12 HOURS LEFT, 1 HOUR LEFT, and ENDED.
--
-- WHY NOT THE SPECCED 3h/2h/1h. A trial activated at 09:00 ends at 09:00 the
-- next day, so those three rungs fire at 06:00, 07:00 and 08:00 — roughly half
-- of all activations would spend their ENTIRE warning budget while the parent
-- was asleep, and the parent's first contact with the feature would be the "it
-- ended" notice. A 12-hour rung is a real "half your day is gone" nudge that
-- lands in waking hours for almost every activation, and 2h was noise next to 1h.
--
-- WAKING HOURS ARE ENFORCED, NOT ASSUMED. Every rung also requires the local
-- hour in Asia/Baku to be 08–21. A rung that comes due at 03:00 is simply not
-- emitted then; the monotone predicate below re-offers it at 08:00.
--
-- THE TRAP THAT CREATES, AND THE GUARD FOR IT. Deferring a "1 hour left" notice
-- to 08:00 would announce time that no longer exists — a trial ending at 02:00
-- would produce "1 hour left" at 08:00, six hours after it ended. Both
-- time-remaining rungs therefore carry `ft.ends_at > now()`: a rung whose window
-- passed during the quiet hours is DROPPED, and the parent gets the honest
-- "ended" notice instead. Never a late lie.
--
-- WHY */5 AND NOT HOURLY — a change of UNIT, not a reversal of migration 130.
-- 130 established that a rung must not depend on the instant the job fires. At
-- DAY grain a bucket lasts a day, so one sample per day is safe against jitter.
-- At HOUR grain a bucket lasts an hour, so an hourly job samples 1:1 and ONE
-- delayed run swallows a whole rung with no error anywhere. Two things make it
-- safe, and both are required:
--   1. Fire finer than the rung (*/5 — twelve samples per bucket), as
--      dispatch_scheduled_notifications, azericard_reconcile and 138's
--      notifications_process all already do.
--   2. A monotone DUE-AND-UNSENT predicate (`<=`), never equality. The unique
--      idempotency key makes each rung at-most-once; `<=` makes it at-least-once
--      across any outage that ends before the rung expires. An outage from 11:00
--      to 13:05 on a trial ending at 14:37 delivers the 1h rung LATE rather than
--      NEVER. dispatch_scheduled_notifications uses exactly this shape.
--
-- PRIORITY IS NEVER 1. Priority 1 overrides BOTH the recipient's mute AND the
-- platform-wide notifications master switch. Migration 130 spent that override
-- once, on a parent about to lose access they had PAID for. Nobody paid for this.
--
-- THE PARENT ONLY, NEVER THE CHILD. A "your access ended" notice to a minor is a
-- purchase-adjacent nudge with no action they are permitted to take.
--
-- COPY IS MOBILE-SAFE BY CONSTRUCTION. These bodies are DB literals and render
-- verbatim inside store binaries, so they name no price, no purchase verb, no
-- destination and no URL — they state what ended and when. A banned-token
-- assertion at the bottom enforces it in all three languages.
--
-- Self-transacting. Backported into canonical 011 and 016.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 — the trilingual bodies.
--
-- free_trials.locale records what the parent was reading when they activated
-- (the migration-136 pattern). DB notifications were AZ-only before this; the
-- trial is parent-facing at a moment that decides whether they ever buy, so it
-- speaks their language.
-- -----------------------------------------------------------------------------
create or replace function public.free_trial_notice(
  p_locale   text,
  p_rung     int,
  p_child    text,
  p_subjects text,
  p_ends_at  timestamptz
)
returns table (title text, body text)
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_loc  text := case when p_locale in ('az','en','ru') then p_locale else 'az' end;
  v_when text := to_char(p_ends_at at time zone 'Asia/Baku', 'DD.MM.YYYY HH24:MI');
begin
  if p_rung = 12 then
    if v_loc = 'en' then
      title := 'Half of the free day is gone';
      body  := 'Free access to ' || p_subjects || ' for ' || p_child ||
               ' ends on ' || v_when || '. There is still time.';
    elsif v_loc = 'ru' then
      title := 'Половина бесплатного дня позади';
      body  := 'Бесплатный доступ к предметам ' || p_subjects || ' для ' || p_child ||
               ' заканчивается ' || v_when || '. Время ещё есть.';
    else
      title := 'Pulsuz günün yarısı keçdi';
      body  := p_child || ' üçün ' || p_subjects || ' fənlərinə pulsuz giriş ' ||
               v_when || ' tarixində bitir. Hələ vaxt var.';
    end if;
  elsif p_rung = 1 then
    if v_loc = 'en' then
      title := 'Free access ends in an hour';
      body  := 'Access to ' || p_subjects || ' for ' || p_child ||
               ' closes at ' || v_when || '.';
    elsif v_loc = 'ru' then
      title := 'Бесплатный доступ закончится через час';
      body  := 'Доступ к предметам ' || p_subjects || ' для ' || p_child ||
               ' закроется ' || v_when || '.';
    else
      title := 'Pulsuz giriş bir saatdan sonra bitir';
      body  := p_child || ' üçün ' || p_subjects || ' fənlərinə giriş ' ||
               v_when || ' tarixində bağlanacaq.';
    end if;
  else
    if v_loc = 'en' then
      title := 'Free access has ended';
      body  := 'Access to ' || p_subjects || ' for ' || p_child || ' is now closed.';
    elsif v_loc = 'ru' then
      title := 'Бесплатный доступ завершён';
      body  := 'Доступ к предметам ' || p_subjects || ' для ' || p_child || ' закрыт.';
    else
      title := 'Pulsuz giriş başa çatdı';
      body  := p_child || ' üçün ' || p_subjects || ' fənlərinə giriş bağlandı.';
    end if;
  end if;
  return next;
end;
$$;

comment on function public.free_trial_notice(text, int, text, text, timestamptz) is
  'Migration 141: the trilingual Free Trial notice bodies (az/en/ru), keyed on '
  'the locale captured on the free_trials row. Names no price, no purchase verb, '
  'no destination and no URL — these strings render verbatim inside the '
  'purchase-silent store binaries.';

revoke all on function public.free_trial_notice(text, int, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.free_trial_notice(text, int, text, text, timestamptz)
  to service_role;


-- -----------------------------------------------------------------------------
-- 2 — the producer.
-- -----------------------------------------------------------------------------
create or replace function public.notify_free_trial_ending()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      record;
  v_note     record;
  v_rung     int;
  v_prio     int;
  v_type     text;
  v_expires  timestamptz;
  v_sent     uuid;
  v_n        int := 0;
  v_hour     int;
begin
  -- During a campaign or an admin free-access window the trial ends and NOTHING
  -- changes, so every one of these sentences would be false. The renewal chain
  -- opens with the same guard for the same reason.
  if public.is_giveaway_active() then return 0; end if;

  -- WAKING HOURS, in the child's own timezone. A rung due at 03:00 is not
  -- emitted; the monotone predicate below re-offers it from 08:00.
  v_hour := extract(hour from (now() at time zone 'Asia/Baku'))::int;
  if v_hour < 8 or v_hour > 21 then return 0; end if;

  for v_row in
    select ft.id, ft.student_profile_id, ft.owner_parent_profile_id,
           ft.subject_ids, ft.ends_at, ft.locale,
           trim(both from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) as child_name
    from public.free_trials ft
    join public.students s on s.profile_id = ft.student_profile_id
    where ft.cancelled_at is null
      -- Bounded by idx_free_trials_ends_at. The backward reach is 14 hours so an
      -- expiry that happened during the quiet window is still reportable at 08:00.
      and ft.ends_at >  now() - interval '14 hours'
      and ft.ends_at <= now() + interval '12 hours'
  loop
    begin
      -- One family must not be able to silence every family: a raise inside this
      -- loop would abort the whole run, so each row is wrapped.
      if public.is_free_access_active_for_student(v_row.student_profile_id) then
        continue;
      end if;

      -- WHICH RUNG IS DUE. Ordered most-urgent-first so a single pass emits at
      -- most one notice per trial per run.
      if v_row.ends_at <= now() then
        v_rung := 0;  v_prio := 2;  v_type := 'free_trial_ended';  v_expires := null;
      elsif v_row.ends_at - now() <= interval '1 hour' then
        v_rung := 1;  v_prio := 2;  v_type := 'free_trial_ending'; v_expires := v_row.ends_at;
      elsif v_row.ends_at - now() <= interval '12 hours' then
        v_rung := 12; v_prio := 3;  v_type := 'free_trial_ending'; v_expires := v_row.ends_at;
      else
        continue;
      end if;

      select * into v_note from public.free_trial_notice(
        v_row.locale, v_rung,
        nullif(v_row.child_name, ''),
        coalesce((select string_agg(sub.name, ', ' order by sub.name)
                  from public.subjects sub where sub.id = any(v_row.subject_ids)), ''),
        v_row.ends_at);

      -- ends_at is IN the key, so a reissued trial would start a fresh series
      -- rather than being muted by the old one.
      select public.create_notification(
        v_row.owner_parent_profile_id,
        v_type,
        v_note.title,
        v_note.body,
        jsonb_build_object('student_profile_id', v_row.student_profile_id,
                           'ends_at', v_row.ends_at,
                           'hours', v_rung),
        -- The email channel, per migration 138's rule: only the chains that mean
        -- "your child's access is about to change". Inert until the flag is on.
        array['in_app', 'email'],
        'trial:' || v_row.id::text || ':' || v_row.ends_at::text || ':h' || v_rung::text,
        v_prio,
        -- NEVER a pricing route. /children is allowlisted; /services and the
        -- auth routes deliberately are not.
        '/children/' || v_row.student_profile_id::text,
        'announcement',
        v_expires
      ) into v_sent;

      -- Count what was SENT, not what was considered. Under the monotone
      -- predicate a suppressed rung is re-offered every five minutes; those are
      -- harmless no-ops and must not inflate the counter.
      if v_sent is not null then v_n := v_n + 1; end if;
    exception when others then
      raise warning 'notify_free_trial_ending: trial % failed: %', v_row.id, sqlerrm;
    end;
  end loop;

  return v_n;
end;
$$;

comment on function public.notify_free_trial_ending() is
  'Migration 141: warns the OWNING PARENT that a Free Trial is ending — 12 hours '
  'left, 1 hour left, and ended. Runs */5 with a monotone due-and-unsent '
  'predicate so a delayed run delivers late rather than never. Emits only between '
  '08:00 and 21:00 Asia/Baku, and never announces remaining time after ends_at '
  'has passed. Priority never 1: nobody paid for this.';

revoke all on function public.notify_free_trial_ending() from public, anon, authenticated;
grant execute on function public.notify_free_trial_ending() to service_role;


-- -----------------------------------------------------------------------------
-- 3 — schedule it.
-- -----------------------------------------------------------------------------
do $$
declare v_has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  if not v_has_cron then
    raise notice '141: pg_cron absent — the Free Trial chain is not scheduled.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'olympiq_notify_free_trial_ending';
  perform cron.schedule(
    'olympiq_notify_free_trial_ending',
    '*/5 * * * *',
    'select public.notify_free_trial_ending();'
  );
  raise notice '141: pg_cron job olympiq_notify_free_trial_ending scheduled (*/5).';
end $$;


-- -----------------------------------------------------------------------------
-- VERIFICATION — including the copy, in all three languages.
-- -----------------------------------------------------------------------------
do $$
declare
  v_banned text[] := array[
    'subscribe', 'abunə ol', 'подписатьс', 'купит', 'buy', 'satın al',
    'endirim', 'discount', 'скидк', 'azn', '₼', 'manat',
    'http', 'olympiq.ai', 'ödəniş', 'payment', 'оплат', 'plan'
  ];
  v_loc  text;
  v_rung int;
  v_note record;
  v_hay  text;
  v_bad  text;
begin
  if to_regprocedure('public.notify_free_trial_ending()') is null then
    raise exception '141: the producer was not created';
  end if;

  -- EVERY rung, in EVERY language, must be free of purchase language. These
  -- strings render verbatim inside the store binaries, where a purchase CTA
  -- delivered after review is Apple 3.1.1(a) dynamic steering.
  foreach v_loc in array array['az','en','ru'] loop
    foreach v_rung in array array[12, 1, 0] loop
      select * into v_note from public.free_trial_notice(
        v_loc, v_rung, 'Test Child', 'Riyaziyyat', now() + interval '1 hour');
      v_hay := lower(v_note.title || ' ' || v_note.body);
      foreach v_bad in array v_banned loop
        if position(v_bad in v_hay) > 0 then
          raise exception '141: % rung % contains the banned token "%": %',
            v_loc, v_rung, v_bad, v_note.title;
        end if;
      end loop;
      if coalesce(v_note.title, '') = '' or coalesce(v_note.body, '') = '' then
        raise exception '141: % rung % produced an empty notice', v_loc, v_rung;
      end if;
    end loop;
  end loop;

  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'olympiq_notify_free_trial_ending') then
    raise warning '141: pg_cron present but the chain is not scheduled.';
  end if;

  raise notice '141: three rungs, three languages, no purchase language anywhere';
end $$;

commit;
