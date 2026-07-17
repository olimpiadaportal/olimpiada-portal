-- ============================================================================
-- Migration: 2026_07_17_067_news_notification_kind.sql
-- Round 24 follow-up (owner-approved): notifications fanned out through
-- admin_send_notification always stored type='admin_announcement' /
-- category='announcement', even when a template said otherwise — so the news
-- publish broadcast (template_code 'news_published') rendered with the
-- megaphone icon and filtered under "Announcements" instead of "News" on web
-- AND mobile (both clients already know the news icon/category — dead code
-- until now).
--
-- Fix: a tiny IMMUTABLE mapping (template code → notification type/category)
-- used by BOTH fan-out paths (immediate admin_send_notification + the
-- scheduled dispatch_scheduled_notifications), defaulting to the old
-- admin_announcement/announcement pair for plain composer sends; plus a
-- precise backfill of existing rows via their linked broadcast's
-- template_code (never URL guessing).
--
-- No signature changes; 013 check #64 (olympiad_buyers validation) unaffected.
-- Backported to canonical 011 (functions) + 013 (new check #68).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Template code → (type, category). The category set matches the client
--    filter chips (olympiad/progress/billing/announcement/news); unknown or
--    NULL codes keep the plain-announcement pair.
-- ----------------------------------------------------------------------------
create or replace function public.notify_template_kind(
  p_template_code text,
  out n_type text,
  out n_category text
)
returns record
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    case p_template_code
      when 'news_published'        then 'news_published'
      when 'olympiad_purchased'    then 'olympiad_purchased'
      when 'attempt_graded'        then 'attempt_graded'
      when 'personal_best'         then 'personal_best'
      when 'streak_milestone'      then 'streak_milestone'
      when 'subscription_canceled' then 'subscription_canceled'
      when 'subject_charge_failed' then 'subject_charge_failed'
      when 'subject_expiring'      then 'subject_expiring'
      when 'giveaway_ending'       then 'giveaway_ending'
      else 'admin_announcement'
    end,
    case p_template_code
      when 'news_published'        then 'news'
      when 'olympiad_purchased'    then 'olympiad'
      when 'attempt_graded'        then 'progress'
      when 'personal_best'         then 'progress'
      when 'streak_milestone'      then 'progress'
      when 'subscription_canceled' then 'billing'
      when 'subject_charge_failed' then 'billing'
      when 'subject_expiring'      then 'billing'
      when 'giveaway_ending'       then 'announcement'
      else 'announcement'
    end
$$;

-- Only the DEFINER fan-out functions call this; keep it out of client reach
-- like every other service-role-only helper (explicit authenticated revoke).
revoke all on function public.notify_template_kind(text) from public, anon, authenticated;
grant execute on function public.notify_template_kind(text) to service_role;

-- ----------------------------------------------------------------------------
-- 2) admin_send_notification: identical to migration 060 except the fan-out
--    derives type/category from the template code (v_kind) instead of the
--    hardcoded admin_announcement/announcement pair.
-- ----------------------------------------------------------------------------
create or replace function public.admin_send_notification(
  p_title         text,
  p_body          text,
  p_channels      text[],
  p_audience_type text,
  p_audience_filter jsonb default '{}'::jsonb,
  p_scheduled_at  timestamptz default null,
  p_template_code text default null,
  p_action_url    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_id    uuid;
  v_rec   uuid;
  v_n     int := 0;
  v_key   text;
  v_pkg_n int;
  v_kind  record;
begin
  if not (public.is_admin() or public.has_permission('notifications.send')) then
    raise exception 'notify: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_body),'') = '' then
    raise exception 'notify: title and body required' using errcode = 'check_violation';
  end if;
  if p_audience_type not in ('all_users','all_parents','all_children','olympiad_buyers',
                             'parent','by_subject','individual') then
    raise exception 'notify: bad audience' using errcode = 'check_violation';
  end if;

  -- olympiad_buyers: package_ids are REQUIRED and must all be existing ACTIVE
  -- packages (migration 060) — validated before anything is stored.
  if p_audience_type = 'olympiad_buyers' then
    select count(*) into v_pkg_n
    from jsonb_array_elements_text(coalesce(p_audience_filter->'package_ids','[]'::jsonb)) e
    where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    if coalesce(v_pkg_n, 0) = 0 then
      raise exception 'notify: at least one olympiad package required' using errcode = 'check_violation';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(p_audience_filter->'package_ids') e
      where not exists (
        select 1 from public.olympiad_packages op
        where op.id::text = e and op.status = 'active')
    ) then
      raise exception 'notify: invalid or inactive olympiad package' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.admin_notifications
    (actor_profile_id, title, body, template_code, channels, audience_type,
     audience_filter, status, scheduled_at)
  values
    (v_actor, left(p_title,200), left(p_body,2000), p_template_code,
     coalesce(p_channels,'{in_app}'), p_audience_type, coalesce(p_audience_filter,'{}'::jsonb),
     case when p_scheduled_at is not null and p_scheduled_at > now() then 'scheduled' else 'sending' end,
     p_scheduled_at)
  returning id into v_id;

  -- Scheduled → leave for the cron dispatcher; just return the target count.
  if p_scheduled_at is not null and p_scheduled_at > now() then
    select count(*) into v_n from public.lb_notify_audience(p_audience_type, coalesce(p_audience_filter,'{}'::jsonb));
    update public.admin_notifications set total_recipients = coalesce(v_n,0) where id = v_id;
    return jsonb_build_object('id', v_id, 'status', 'scheduled', 'recipients', coalesce(v_n,0));
  end if;

  -- Immediate fan-out (idempotent per recipient+broadcast). Type/category come
  -- from the template so e.g. the news broadcast files under "news".
  select * into v_kind from public.notify_template_kind(p_template_code);
  for v_rec in select a.profile_id from public.lb_notify_audience(p_audience_type, coalesce(p_audience_filter,'{}'::jsonb)) a
  loop
    v_key := 'admin:' || v_id::text || ':' || v_rec::text;
    perform public.create_notification(
      v_rec, v_kind.n_type, p_title, p_body,
      jsonb_build_object('admin_notification_id', v_id),
      coalesce(p_channels,'{in_app}'), v_key, 3, p_action_url, v_kind.n_category, null);
    v_n := v_n + 1;
  end loop;

  update public.admin_notifications
     set status = 'sent', total_recipients = v_n, delivered_count = v_n, sent_at = now()
   where id = v_id;
  return jsonb_build_object('id', v_id, 'status', 'sent', 'recipients', v_n);
end;
$$;
revoke all on function public.admin_send_notification(text, text, text[], text, jsonb, timestamptz, text, text) from public, anon;
grant execute on function public.admin_send_notification(text, text, text[], text, jsonb, timestamptz, text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) dispatch_scheduled_notifications: same mapping for the scheduled path
--    (v_row.template_code was stored at compose time).
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_scheduled_notifications()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row record; v_rec uuid; v_n int; v_total int := 0; v_kind record;
begin
  for v_row in
    select * from public.admin_notifications
     where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
     for update skip locked
  loop
    update public.admin_notifications set status = 'sending' where id = v_row.id;
    v_n := 0;
    select * into v_kind from public.notify_template_kind(v_row.template_code);
    for v_rec in select a.profile_id from public.lb_notify_audience(v_row.audience_type, v_row.audience_filter) a
    loop
      perform public.create_notification(
        v_rec, v_kind.n_type, v_row.title, v_row.body,
        jsonb_build_object('admin_notification_id', v_row.id),
        v_row.channels, 'admin:' || v_row.id::text || ':' || v_rec::text, 3, null, v_kind.n_category, null);
      v_n := v_n + 1;
    end loop;
    update public.admin_notifications
       set status = 'sent', total_recipients = v_n, delivered_count = v_n, sent_at = now()
     where id = v_row.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end; $$;
revoke all on function public.dispatch_scheduled_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_scheduled_notifications() to service_role;

-- ----------------------------------------------------------------------------
-- 4) Backfill: re-kind existing rows via their linked broadcast's
--    template_code (exact join through data_json->>'admin_notification_id' —
--    never inferred from URLs). Only news exists as a mis-kinded template so
--    far; the join form covers any future backfitted code the same way.
-- ----------------------------------------------------------------------------
update public.notifications n
   set type = k.n_type, category = k.n_category
  from public.admin_notifications an,
       lateral public.notify_template_kind(an.template_code) k
 where an.template_code = 'news_published'
   and n.type = 'admin_announcement'
   and (n.data_json->>'admin_notification_id') = an.id::text;

-- ----------------------------------------------------------------------------
-- Self-verify (raises = migration fails inside this transaction)
-- ----------------------------------------------------------------------------
do $$
declare v_kind record; v_bad int;
begin
  if position('notify_template_kind' in
       pg_get_functiondef('public.admin_send_notification(text,text,text[],text,jsonb,timestamptz,text,text)'::regprocedure)) = 0
     or position('notify_template_kind' in
       pg_get_functiondef('public.dispatch_scheduled_notifications()'::regprocedure)) = 0 then
    raise exception 'fan-out functions do not use notify_template_kind';
  end if;
  select * into v_kind from public.notify_template_kind('news_published');
  if v_kind.n_type <> 'news_published' or v_kind.n_category <> 'news' then
    raise exception 'news mapping wrong: % / %', v_kind.n_type, v_kind.n_category;
  end if;
  select * into v_kind from public.notify_template_kind(null);
  if v_kind.n_type <> 'admin_announcement' or v_kind.n_category <> 'announcement' then
    raise exception 'default mapping wrong: % / %', v_kind.n_type, v_kind.n_category;
  end if;
  select count(*) into v_bad
    from public.notifications n
    join public.admin_notifications an
      on (n.data_json->>'admin_notification_id') = an.id::text
   where an.template_code = 'news_published' and n.type <> 'news_published';
  if v_bad > 0 then
    raise exception 'backfill incomplete: % news rows still mis-kinded', v_bad;
  end if;
  raise notice 'news notification kind self-verify PASS.';
end $$;

commit;
