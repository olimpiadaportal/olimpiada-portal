-- Migration: 2026_09_10_172_notification_subject_names.sql
-- Purpose: stop the two parent-facing notification producers naming a subject
--          by the string migration 171 froze as an INTERNAL import key. Both
--          read `subjects.name` to build a notification body (and, for the
--          renewal chain, an email body); `subjects.name` deliberately no
--          longer follows a rename, so after one the warning names a subject
--          that exists nowhere a family can see. Both now read
--          public.subject_translations and keep `subjects.name` as a fallback.
-- Environment first applied: staging + production, 2026-09-10
-- Related root SQL file(s) / BACKPORT TARGETS:
--          * 011_indexes_constraints_functions_triggers.sql -- both functions,
--            replaced in place at their existing definitions.
-- Backport status: completed (same round, 011 only)
-- Destructive change: no. CREATE OR REPLACE on two existing functions with
--          IDENTICAL signatures, plus their unchanged revoke/grant lines. No
--          DROP: notify_expiring_subscriptions() and notify_free_trial_ending()
--          are both referenced by pg_cron schedules created in
--          016_scheduled_jobs.sql, which call them by name inside a command
--          string -- a drop+recreate would leave a window in which the scheduled
--          command errors, and a drop would also discard the grants. No table is
--          created, altered, written or deleted from.
-- Rollback notes: re-run the previous definitions from the git history of 011.
--          Nothing else has to be undone: no schema, no data and no grant
--          changes here.
-- =============================================================================
-- 2026_09_10_172 -- THE WARNING THAT NAMED A SUBJECT NOBODY HAS EVER SEEN.
--
-- WHAT 171 CHANGED, AND WHAT IT LEFT BEHIND.
-- Migration 171 gave subjects per-locale display names in
-- public.subject_translations and FROZE `subjects.name` as the machine-facing
-- import key: three bulk-import RPCs in 011 resolve a subject with
-- `where name = (meta ->> 'subject')` (lines 3026, 3185 and 6857), so an admin
-- rename must leave that column alone or every upload file an admin has been
-- reusing for months stops matching. The admin action therefore writes the three
-- translation rows and does NOT touch `name`; `name` and the az display name
-- are allowed to diverge, deliberately.
--
-- Every DISPLAY surface was routed through subjectLabel(), which reads the
-- translation first. Two producers were not display surfaces and were missed --
-- they build their text inside the DATABASE, where there is no subjectLabel():
--
--   1. notify_expiring_subscriptions() -- the 3/2/1-day renewal chain. Renewals
--      are MANUAL (ABB has not approved recurring billing), so this chain is the
--      entire retention mechanism, and since migration 138 it also asks for the
--      EMAIL channel. It named the lapsing subjects from `subj.name`.
--   2. notify_free_trial_ending() -- the 12h/1h/ended trial chain. Same read,
--      string_agg'd into free_trial_notice()'s `p_subjects`.
--
-- So the most consequential message this platform sends a paying parent -- "your
-- child's access to X stops on the 14th" -- identified X by an internal key.
-- Before any rename that key merely looked odd in one edge case; after the first
-- rename it is a name the parent cannot find anywhere in the product, on a
-- message asking them to act within three days.
--
-- WHAT THIS MIGRATION DOES *NOT* DO: LOCALIZE NOTIFICATIONS.
-- profiles.preferred_locale is unused, and every body in
-- notify_expiring_subscriptions() is an Azerbaijani literal. That is a standing,
-- deliberate limitation with a recipient-locale decision behind it, and this
-- migration does not touch it: the renewal chain reads the 'az' translation and
-- stays monolingual. Its three bodies say exactly what they said before, with
-- the CURRENT az name substituted for the frozen one.
--
-- The trial chain looks like an exception and is not one. free_trial_notice()
-- ALREADY renders az/en/ru from free_trials.locale -- the language the parent
-- activated the trial in -- so its sentence was localized while the subject
-- names inside it were not. Reading the translation for that same locale closes
-- an inconsistency; it introduces localization nowhere it did not exist.
--
-- FALLBACKS, AND WHY THERE ARE SEVERAL.
-- Both readers keep `subjects.name` behind the translation, and the trial
-- reader keeps `subjects.code` behind that -- the same chain subjectLabel()
-- uses on the clients. 171's seed plus its own assert make a subject with no
-- translation row unreachable today, but a function outlives that guarantee and
-- must degrade to a slightly stale name rather than to an empty string:
-- string_agg drops NULLs silently, so an unguarded read would quietly shorten
-- "Riyaziyyat, Fizika" to "Riyaziyyat" -- a warning about the wrong SET of
-- subjects, with nothing anywhere reporting it.
--
-- NOT CHANGED, ON PURPOSE:
--   * both signatures, both bodies' wording, both idempotency keys, both
--     priority ladders, the giveaway guard, the quiet-hours guard, the
--     per-row exception handling and both counters;
--   * the notification metadata_json `subjects` field, which simply now carries
--     the same display string the body does;
--   * every other producer in 011. Only these two read a subject name at all:
--     notify_attempt_graded_tg, notify_progress_milestones_tg,
--     notify_giveaway_ending, notify_question_report_status_tg and the checkout
--     escalation notice name no subject, while my_entitled_subjects and
--     child_free_trial return `code` ALONGSIDE `name`, so their callers already
--     resolve the label on the client.
-- =============================================================================

-- =============================================================================
-- A. notify_expiring_subscriptions() -- the manual-renewal chain (in-app + email)
-- =============================================================================
-- Byte-identical to 011 after this round's backport. CREATE OR REPLACE with the
-- same signature, so the pg_cron entry created by 016 keeps resolving; the
-- revoke/grant pair is restated only because that is how every producer in this
-- repository is written -- REPLACE leaves privileges untouched.

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
           -- MIGRATION 172 -- THE DISPLAY NAME, NOT THE IMPORT KEY. Migration
           -- 171 froze `subjects.name` as the bulk-import match key (three RPCs
           -- in this file resolve a subject with `where name = meta->>'subject'`)
           -- and moved the visible az/en/ru names into subject_translations, so
           -- a rename deliberately leaves `name` alone. Reading it here named a
           -- subject, in a warning sent to a paying parent, by a string that
           -- family has never seen -- and after any rename, by one that exists
           -- nowhere else in the product.
           --
           -- az AND ONLY az. profiles.preferred_locale is unused, so every
           -- server-generated body in this function is an Azerbaijani literal.
           -- The goal is that the az name shown is the CURRENT az display name,
           -- NOT that notifications become trilingual -- that is a separate
           -- change with a recipient-locale decision behind it.
           string_agg(distinct coalesce(nullif(btrim(tr_az.name), ''),
                                        nullif(btrim(subj.name), ''),
                                        '—'), ', ')
             as subject_names
    from public.child_subscriptions cs
    join public.subscription_subjects ss on ss.child_subscription_id = cs.id
    join public.students s              on s.profile_id = cs.student_profile_id
    left join public.subjects subj      on subj.id = ss.subject_id
    -- LEFT, and locale-pinned. A subject carrying no az row -- unreachable
    -- after 171's seed and its own assert, but this join outlives that
    -- guarantee -- falls back to subj.name above rather than dropping out of
    -- the warning. uq_subject_locale makes the join at most 1:1, so it cannot
    -- duplicate a subscription row into the aggregate.
    left join public.subject_translations tr_az
                                        on tr_az.subject_id = subj.id
                                       and tr_az.locale = 'az'
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

-- =============================================================================
-- B. notify_free_trial_ending() -- the trial chain (already az/en/ru)
-- =============================================================================
-- Same treatment, plus the reader's locale. free_trial_notice() is untouched: it
-- receives a subject list and does not have to know where the names came from.

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
        -- MIGRATION 172 -- the DISPLAY name, in the language this notice is
        -- actually written in. Unlike every other producer here, free_trial_notice()
        -- below renders its title and body in az/en/ru from free_trials.locale --
        -- the parent chose that language when they activated the trial. Only the
        -- subject list stayed `subjects.name`, the frozen bulk-import key, so an
        -- English parent read an English sentence with an Azerbaijani subject
        -- inside it, and after a rename nobody read the current name at all.
        -- This is NOT new localization: the sentence around it was already
        -- localized and this makes the hole in it consistent.
        --
        -- Fallback chain, most specific first: the reader's locale -> az -> the
        -- raw column -> the code, so a subject can never silently vanish from a
        -- sentence that is about to list it. The locale is re-normalized exactly
        -- as free_trial_notice does rather than trusted from the row.
        coalesce((
          select string_agg(q.nm, ', ' order by q.nm)
            from (
              select coalesce(nullif(btrim(tr.name), ''),
                              nullif(btrim(tr_az.name), ''),
                              nullif(btrim(sub.name), ''),
                              sub.code) as nm
                from public.subjects sub
                left join public.subject_translations tr
                       on tr.subject_id = sub.id
                      and tr.locale = (case
                                         when v_row.locale in ('az', 'en', 'ru')
                                         then v_row.locale else 'az'
                                       end)::public.content_locale
                left join public.subject_translations tr_az
                       on tr_az.subject_id = sub.id
                      and tr_az.locale = 'az'
               where sub.id = any(v_row.subject_ids)
            ) q), ''),
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

-- =============================================================================
-- C. ASSERT -- a silent no-op here is indistinguishable from success
-- =============================================================================
-- Both functions are called by cron and by nothing else, their return value is a
-- count nobody reads, and their output lands in someone else's inbox. Applied
-- against a database whose 171 had not run, or after a future edit reverted the
-- read, NOTHING would fail and NOTHING would look wrong -- the warnings would
-- simply go back to naming an internal key. So the read itself is asserted, from
-- the catalog rather than from this file's own text.

do $$
declare
  v_bad text[] := '{}';
begin
  if to_regclass('public.subject_translations') is null then
    raise exception '172: public.subject_translations is missing -- apply '
                    'migration 171 first; these functions now read it.';
  end if;

  -- The READ, per function. pg_get_functiondef reflects what the database
  -- actually stored, so this cannot pass merely because the text above exists.
  if position('subject_translations' in
              pg_get_functiondef('public.notify_expiring_subscriptions()'::regprocedure)) = 0
  then
    v_bad := v_bad || 'notify_expiring_subscriptions';
  end if;

  if position('subject_translations' in
              pg_get_functiondef('public.notify_free_trial_ending()'::regprocedure)) = 0
  then
    v_bad := v_bad || 'notify_free_trial_ending';
  end if;

  if cardinality(v_bad) > 0 then
    raise exception '172: % still resolve a subject name from subjects.name only',
      array_to_string(v_bad, ', ');
  end if;

  -- The POSTURE, unchanged: service_role only. A REPLACE cannot alter this, so a
  -- failure here means something else in the session did.
  if not has_function_privilege('service_role',
        'public.notify_expiring_subscriptions()', 'EXECUTE')
     or not has_function_privilege('service_role',
        'public.notify_free_trial_ending()', 'EXECUTE')
     or has_function_privilege('authenticated',
        'public.notify_expiring_subscriptions()', 'EXECUTE')
     or has_function_privilege('authenticated',
        'public.notify_free_trial_ending()', 'EXECUTE')
     or has_function_privilege('anon',
        'public.notify_expiring_subscriptions()', 'EXECUTE')
     or has_function_privilege('anon',
        'public.notify_free_trial_ending()', 'EXECUTE')
  then
    raise exception '172: notification producer grants are not service_role-only';
  end if;

  raise notice '172: both notification producers now read subject_translations '
               '(% subject(s), % translation row(s)).',
    (select count(*) from public.subjects),
    (select count(*) from public.subject_translations);
end
$$;
