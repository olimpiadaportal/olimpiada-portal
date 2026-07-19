-- ============================================================================
-- Migration: 2026_07_19_076_admin_notifications_scope.sql
-- Round 30 (owner feedback on the R29 admin bell): the admin /alerts inbox was
-- showing EVERY notification in the system (student "result ready", parent
-- "olympiad bought", …) and clicking them 404'd on web-app deep links.
--
-- Root cause: `notif_select` RLS was `recipient = me OR is_admin()`, so an admin
-- session read everyone's rows. FIX: scope it to `recipient = me` (self only) —
-- admins, like everyone, read only notifications addressed TO them. This is also
-- a privacy fix: admin-directed notifications must never be visible to other
-- panel users (content managers are not admins, so they were already self-scoped;
-- this closes the admin-sees-all hole).
--
-- Per owner: admins should NOT be auto-spammed with ecosystem events. So the R29
-- operational-alert triggers (new parent / purchase / subscription) + notify_admins
-- are REMOVED. Instead:
--   * the admin notification composer gains 'administrators' / 'content_managers'
--     audiences (send TO staff on purpose), and
--   * a content manager / creator is notified when THEIR olympiad package is
--     published (name in the body) — recipient-scoped, so private to them.
-- The kept R29 producers (personal_best, streak_milestone, subject_expiring,
-- giveaway_ending) are correct student/parent notifications and stay.
--
-- Backported: RLS → 010; lb_notify_audience + admin_send_notification → 011
-- (drop the two admin-alert fns there); 015 drops the purchase-alert trigger and
-- gains the package-published trigger. 013 check #74 updated (#76 folded in).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Tighten notif_select: self-scope only (drop the OR is_admin() hole).
-- ----------------------------------------------------------------------------
drop policy if exists "notif_select" on public.notifications;
create policy "notif_select" on public.notifications for select to authenticated
  using (recipient_profile_id = public.current_profile_id());

-- ----------------------------------------------------------------------------
-- 2) Remove the R29 admin operational-alert triggers + functions + notify_admins.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_notify_admin_new_parent on public.parents;
drop trigger if exists trg_notify_admin_new_purchase on public.olympiad_purchases;
drop trigger if exists trg_notify_admin_new_subscription on public.child_subscriptions;
drop function if exists public.notify_admin_new_parent_tg();
drop function if exists public.notify_admin_new_purchase_tg();
drop function if exists public.notify_admin_new_subscription_tg();
drop function if exists public.notify_admins(text,text,text,jsonb,text,text,text,int);

-- ----------------------------------------------------------------------------
-- 3) lb_notify_audience: add staff audiences (administrators / content_managers).
--    Verbatim live body + two new branches before the final end.
-- ----------------------------------------------------------------------------
create or replace function public.lb_notify_audience(p_type text, p_filter jsonb)
returns table(profile_id uuid)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_type = 'all_users' then
    return query
      select pr.profile_id from public.parents pr
      union
      select st.profile_id from public.students st;
  elsif p_type = 'all_parents' then
    return query select pr.profile_id from public.parents pr;
  elsif p_type = 'all_children' then
    return query select st.profile_id from public.students st;
  elsif p_type = 'olympiad_buyers' then
    return query
      with pkg as (
        select e::uuid as id
        from jsonb_array_elements_text(coalesce(p_filter->'package_ids','[]'::jsonb)) e
        where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
      select distinct u.pid
      from (
        select op.owner_parent_profile_id as pid
        from public.olympiad_purchases op
        join pkg on pkg.id = op.olympiad_package_id
        where op.status = 'active'
        union
        select op.student_profile_id
        from public.olympiad_purchases op
        join pkg on pkg.id = op.olympiad_package_id
        where op.status = 'active'
      ) u
      where u.pid is not null;
  elsif p_type in ('parent', 'individual') then
    if p_filter ? 'profile_ids' and jsonb_typeof(p_filter->'profile_ids') = 'array' then
      return query
        select e::uuid
        from jsonb_array_elements_text(p_filter->'profile_ids') e
        where e ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    elsif (p_filter->>'profile_id') is not null then
      return query select (p_filter->>'profile_id')::uuid;
    end if;
  elsif p_type = 'by_subject' then
    return query
      select distinct cs.student_profile_id
      from public.child_subscriptions cs
      join public.subscription_subjects ss on ss.child_subscription_id = cs.id
      where ss.subject_id = (p_filter->>'subject_id')::uuid
        and cs.status in ('trialing','active');
  elsif p_type = 'administrators' then
    -- Migration 076: staff audience — administrators only (private admin sends).
    return query
      select prr.profile_id from public.profile_roles prr
      join public.roles r on r.id = prr.role_id where r.code = 'administrator';
  elsif p_type = 'content_managers' then
    return query
      select prr.profile_id from public.profile_roles prr
      join public.roles r on r.id = prr.role_id where r.code = 'content_manager';
  end if;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 4) admin_send_notification: whitelist the two new audiences. Verbatim live
--    body with only the audience whitelist extended.
-- ----------------------------------------------------------------------------
create or replace function public.admin_send_notification(
  p_title text, p_body text, p_channels text[], p_audience_type text,
  p_audience_filter jsonb default '{}'::jsonb, p_scheduled_at timestamptz default null,
  p_template_code text default null, p_action_url text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
                             'parent','by_subject','individual',
                             'administrators','content_managers') then
    raise exception 'notify: bad audience' using errcode = 'check_violation';
  end if;

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

  if p_scheduled_at is not null and p_scheduled_at > now() then
    select count(*) into v_n from public.lb_notify_audience(p_audience_type, coalesce(p_audience_filter,'{}'::jsonb));
    update public.admin_notifications set total_recipients = coalesce(v_n,0) where id = v_id;
    return jsonb_build_object('id', v_id, 'status', 'scheduled', 'recipients', coalesce(v_n,0));
  end if;

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
$function$;
revoke all on function public.admin_send_notification(text, text, text[], text, jsonb, timestamptz, text, text) from public, anon;
grant execute on function public.admin_send_notification(text, text, text[], text, jsonb, timestamptz, text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) Notify a package's CREATOR when it is published (status active). Recipient-
--    scoped (private to that content manager / admin). Idempotency keyed by the
--    package → one "your package is live" ever, no matter how often it's edited.
-- ----------------------------------------------------------------------------
create or replace function public.notify_package_published_tg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_title text;
begin
  begin
    if new.created_by is not null then
      select coalesce(nullif(btrim(t.title), ''), 'Olimpiada paketi') into v_title
        from public.olympiad_package_translations t
        where t.olympiad_package_id = new.id and t.locale = 'az' limit 1;
      perform public.create_notification(
        new.created_by, 'olympiad_package_published', 'Paket dərc olundu',
        '"' || coalesce(v_title, 'Olimpiada paketi') || '" paketi indi aktivdir.',
        jsonb_build_object('package_id', new.id, 'title', v_title),
        array['in_app'], 'pkgpub:' || new.id::text, 4, '/olympiad', 'admin', null);
    end if;
  exception when others then raise warning 'notify_package_published failed: %', sqlerrm;
  end;
  return new;
end; $$;
drop trigger if exists trg_notify_package_published on public.olympiad_packages;
create trigger trg_notify_package_published
  after insert or update of status on public.olympiad_packages
  for each row when (new.status = 'active')
  execute function public.notify_package_published_tg();

-- ----------------------------------------------------------------------------
-- Self-verify
-- ----------------------------------------------------------------------------
do $$
declare v_qual text;
begin
  select pg_get_expr(polqual, polrelid) into v_qual from pg_policy where polname = 'notif_select';
  if v_qual is null or position('is_admin' in v_qual) > 0 then
    raise exception 'notif_select still references is_admin() (or missing)';
  end if;
  if to_regprocedure('public.notify_admins(text,text,text,jsonb,text,text,text,int)') is not null then
    raise exception 'notify_admins should have been dropped';
  end if;
  if exists (select 1 from pg_trigger where tgname in
       ('trg_notify_admin_new_parent','trg_notify_admin_new_purchase','trg_notify_admin_new_subscription')) then
    raise exception 'an admin operational-alert trigger survived';
  end if;
  if position('administrators' in pg_get_functiondef('public.lb_notify_audience(text,jsonb)'::regprocedure)) = 0
     or position('administrators' in pg_get_functiondef('public.admin_send_notification(text,text,text[],text,jsonb,timestamptz,text,text)'::regprocedure)) = 0 then
    raise exception 'staff audiences not wired';
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_notify_package_published'
                   and tgrelid='public.olympiad_packages'::regclass) then
    raise exception 'package-published trigger not attached';
  end if;
  raise notice 'admin notifications scope self-verify PASS.';
end $$;

commit;
