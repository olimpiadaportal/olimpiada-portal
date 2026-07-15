-- =============================================================================
-- 2026_07_12_060_notification_audiences.sql
-- Round 20 item 11: two new admin-composer audiences.
--   * 'all_users'       — every parent AND student profile (deduped UNION).
--   * 'olympiad_buyers' — users tied to ACTIVE purchases of ≥1 selected package
--     (filter.package_ids uuid[]): the purchasing PARENT + the entitled CHILD
--     (both are affected by e.g. an olympiad time change; our child bell is a
--     first-class channel). DISTINCT across packages/relationships — a user
--     never gets duplicates (the per-recipient idempotency key also guards).
--   * admin_send_notification: whitelist extended + package_ids validated
--     (required, well-formed, existing + ACTIVE packages) BEFORE anything is
--     stored. get_notification_target_count picks the new types up for free.
--
-- The composer stores audience_filter verbatim in admin_notifications, so the
-- history keeps the selected package ids (+ any title snapshot the admin UI
-- adds — extra keys are ignored by the resolver).
-- Backports: 011. Validation: 013 #64.
-- Apply via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

create or replace function public.lb_notify_audience(p_type text, p_filter jsonb)
returns table (profile_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_type = 'all_users' then
    -- Every notifiable end-user role, deduped (migration 060).
    return query
      select pr.profile_id from public.parents pr
      union
      select st.profile_id from public.students st;
  elsif p_type = 'all_parents' then
    return query select pr.profile_id from public.parents pr;
  elsif p_type = 'all_children' then
    return query select st.profile_id from public.students st;
  elsif p_type = 'olympiad_buyers' then
    -- ACTIVE purchases of any selected package → purchasing parent + entitled
    -- child, deduped (migration 060). Failed/canceled purchases never match.
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
  end if;
end;
$$;
revoke all on function public.lb_notify_audience(text, jsonb) from public, anon, authenticated;
grant execute on function public.lb_notify_audience(text, jsonb) to service_role;

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

  -- Immediate fan-out (idempotent per recipient+broadcast).
  for v_rec in select a.profile_id from public.lb_notify_audience(p_audience_type, coalesce(p_audience_filter,'{}'::jsonb)) a
  loop
    v_key := 'admin:' || v_id::text || ':' || v_rec::text;
    perform public.create_notification(
      v_rec, 'admin_announcement', p_title, p_body,
      jsonb_build_object('admin_notification_id', v_id),
      coalesce(p_channels,'{in_app}'), v_key, 3, p_action_url, 'announcement', null);
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

-- ---- self-verify --------------------------------------------------------------------
do $$
declare v_n int;
begin
  if position('all_users' in pg_get_functiondef('public.lb_notify_audience(text,jsonb)'::regprocedure)) = 0
     or position('olympiad_buyers' in pg_get_functiondef('public.admin_send_notification(text,text,text[],text,jsonb,timestamptz,text,text)'::regprocedure)) = 0 then
    raise exception 'new audiences missing';
  end if;
  -- all_users must equal |parents ∪ students| (dedup check)
  select count(*) into v_n from public.lb_notify_audience('all_users', '{}'::jsonb);
  if v_n <> (select count(*) from (
       select profile_id from public.parents union select profile_id from public.students) u) then
    raise exception 'all_users audience not deduped/complete';
  end if;
  raise notice 'notification audiences self-verify PASS (all_users = % profiles).', v_n;
end $$;

commit;
