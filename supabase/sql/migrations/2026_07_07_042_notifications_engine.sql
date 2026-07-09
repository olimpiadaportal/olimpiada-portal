-- =============================================================================
-- 2026_07_07_042_notifications_engine.sql
-- NOTIFICATIONS — N0 engine (owner rulings 2026-07-07):
--   * In-app LIVE now; email + push architected but OFF behind flags
--     (notifications_email / notifications_push) until an SMTP provider / the
--     mobile app exist. Flip a flag to go live.
--   * Both parents AND children get direct inboxes. Admin can broadcast to
--     all parents / all children / one family / children by subject / one person.
--     Parents also receive child-critical events (payment/subscription).
--   * Per-channel preferences (in_app/email/push); PARENTS manage their
--     children's prefs. Retention: prune READ notifications > 180 days + cap 500
--     per user (both editable in system_settings).
--
-- Security posture (industry-standard, non-forgeable):
--   * NO client INSERT/UPDATE on notifications. Rows are created ONLY by the
--     SECURITY DEFINER create_notification()/admin_send_notification() path, so a
--     user can never forge or edit a notification. read_at flips ONLY via
--     mark_notification_read()/mark_all (owner-checked). Users may delete their
--     own rows (RLS) — nothing else.
--   * Idempotency: notifications.idempotency_key UNIQUE + ON CONFLICT DO NOTHING
--     → at-most-once (same event/user/minute deduped).
--   * Delivery fan-out (email/push) is claimed by a service-role processor with
--     FOR UPDATE SKIP LOCKED; the service-role key never ships to clients.
--   * PII-safe: emails are never stored on notifications; audit carries
--     title/channels/audience/counts only (done in the admin action layer).
--
-- Backports: enum 'push' -> 001; notifications columns + new tables -> 008;
-- RLS -> 010; RPCs/indexes -> 011; permission + flags + template seeds -> 012;
-- cron -> 016; checks #54/#55 -> 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

-- 'push' channel — ADD VALUE cannot run inside a txn block that later uses it,
-- and is idempotent, so it runs first, outside the main transaction.
alter type public.notification_channel add value if not exists 'push';

begin;

-- ---- A) extend notifications --------------------------------------------------
alter table public.notifications
  add column if not exists idempotency_key text,
  add column if not exists priority        int not null default 5,
  add column if not exists category        text,
  add column if not exists action_url      text,     -- same-origin RELATIVE deep link
  add column if not exists expires_at      timestamptz;

do $$ begin
  alter table public.notifications add constraint uq_notifications_idempotency unique (idempotency_key);
exception when duplicate_table then null; when duplicate_object then null; end $$;

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_profile_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications (recipient_profile_id) where read_at is null;

-- ---- B) admin broadcast records ----------------------------------------------
create table if not exists public.admin_notifications (
  id                uuid primary key default gen_random_uuid(),
  actor_profile_id  uuid references public.profiles (id) on delete set null,
  title             text not null,
  body              text not null,
  template_code     text,
  channels          text[] not null default '{in_app}',
  audience_type     text not null,   -- all_parents|all_children|parent|by_subject|individual
  audience_filter   jsonb not null default '{}'::jsonb,
  status            text not null default 'sent'
                      check (status in ('draft','scheduled','sending','sent','failed','canceled')),
  total_recipients  int not null default 0,
  delivered_count   int not null default 0,
  failed_count      int not null default 0,
  scheduled_at      timestamptz,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_admin_notifications_created on public.admin_notifications (created_at desc);
create index if not exists idx_admin_notifications_scheduled
  on public.admin_notifications (scheduled_at) where status = 'scheduled';

-- ---- C) per-user preferences (coarse per-channel; parent manages child) -------
create table if not exists public.notification_preferences (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  in_app_enabled    boolean not null default true,
  email_enabled     boolean not null default true,
  push_enabled      boolean not null default true,
  quiet_hours_start int,     -- optional (0..23), reserved for a later stage
  quiet_hours_end   int,
  updated_at        timestamptz not null default now()
);

-- ---- D) push tokens (mobile-ready; schema from the mobile master plan) --------
create table if not exists public.push_tokens (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  token         text not null unique,
  platform      text not null check (platform in ('ios','android','web')),
  is_valid      boolean not null default true,
  failure_count int not null default 0,
  device_info   jsonb not null default '{}'::jsonb,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_push_tokens_profile on public.push_tokens (profile_id) where is_valid;

-- ---- retention + updated_at triggers -----------------------------------------
drop trigger if exists trg_set_updated_at_admin_notifs on public.admin_notifications;
create trigger trg_set_updated_at_admin_notifs before update on public.admin_notifications
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at_notif_prefs on public.notification_preferences;
create trigger trg_set_updated_at_notif_prefs before update on public.notification_preferences
  for each row execute function public.set_updated_at();
drop trigger if exists trg_set_updated_at_push_tokens on public.push_tokens;
create trigger trg_set_updated_at_push_tokens before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- ---- E) permission + flags + retention settings ------------------------------
insert into public.permissions (code, description)
values ('notifications.send', 'Send/broadcast notifications (Admin only)')
on conflict (code) do nothing;
-- Administrator holds ALL permissions (cross-join seed in 012); re-assert here so
-- an already-seeded DB grants the new code to administrators (never to CMs).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'administrator' and p.code = 'notifications.send'
on conflict do nothing;

insert into public.feature_flags (key, enabled) values
  ('notifications', true),          -- in-app center master switch (ON)
  ('notifications_push', false)     -- mobile push (OFF until the mobile app)
on conflict (key) do nothing;
-- notifications_email already seeded (OFF).

insert into public.system_settings (key, value_json) values
  ('notifications.retention_days', '180'::jsonb),
  ('notifications.max_per_user',   '500'::jsonb)
on conflict (key) do nothing;

-- =============================================================================
-- RPCs
-- =============================================================================

-- create_notification — the SINGLE insert path. Idempotent; always writes the
-- in-app row, then a pending delivery per EXTRA channel the recipient allows.
-- NO end-user grant: only service_role + other DEFINER RPCs may create rows.
create or replace function public.create_notification(
  p_recipient       uuid,
  p_type            text,
  p_title           text,
  p_body            text default null,
  p_data            jsonb default '{}'::jsonb,
  p_channels        text[] default '{in_app}',
  p_idempotency_key text default null,
  p_priority        int default 5,
  p_action_url      text default null,
  p_category        text default null,
  p_expires_at      timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_ch    text;
  v_email boolean;
  v_push  boolean;
begin
  if p_recipient is null then return null; end if;
  -- Respect the recipient's IN-APP preference; missing prefs = enabled.
  if coalesce((select in_app_enabled from public.notification_preferences where profile_id = p_recipient), true) = false
     and coalesce(p_priority, 5) > 1 then
    -- Priority 1 (critical: payment/security) always reaches the inbox.
    return null;
  end if;

  insert into public.notifications
    (recipient_profile_id, type, title, body, data_json, idempotency_key,
     priority, action_url, category, expires_at)
  values
    (p_recipient, p_type, left(p_title, 200), p_body,
     coalesce(p_data, '{}'::jsonb), p_idempotency_key,
     coalesce(p_priority, 5), p_action_url, p_category, p_expires_at)
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then return null; end if;   -- deduped (already sent)

  -- Extra channels → pending deliveries, gated by global flag + user preference.
  v_email := coalesce((select email_enabled from public.notification_preferences where profile_id = p_recipient), true)
             and coalesce((select enabled from public.feature_flags where key = 'notifications_email'), false);
  v_push  := coalesce((select push_enabled  from public.notification_preferences where profile_id = p_recipient), true)
             and coalesce((select enabled from public.feature_flags where key = 'notifications_push'), false);

  foreach v_ch in array coalesce(p_channels, '{}')
  loop
    if v_ch = 'email' and v_email then
      insert into public.notification_deliveries (notification_id, channel, status)
      values (v_id, 'email', 'pending');
    elsif v_ch = 'push' and v_push then
      insert into public.notification_deliveries (notification_id, channel, status)
      values (v_id, 'push', 'pending');
    end if;
  end loop;

  return v_id;
end;
$$;
revoke all on function public.create_notification(uuid, text, text, text, jsonb, text[], text, int, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_notification(uuid, text, text, text, jsonb, text[], text, int, text, text, timestamptz) to service_role;

-- Internal audience resolver → set of recipient profile ids. service-internal.
create or replace function public.lb_notify_audience(p_type text, p_filter jsonb)
returns table (profile_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_type = 'all_parents' then
    return query select pr.profile_id from public.parents pr;
  elsif p_type = 'all_children' then
    return query select st.profile_id from public.students st;
  elsif p_type = 'parent' then
    return query select (p_filter->>'profile_id')::uuid where (p_filter->>'profile_id') is not null;
  elsif p_type = 'individual' then
    return query select (p_filter->>'profile_id')::uuid where (p_filter->>'profile_id') is not null;
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

-- get_target_count — admin audience preview (authenticated; admin-checked in body).
create or replace function public.get_notification_target_count(p_type text, p_filter jsonb)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not (public.is_admin() or public.has_permission('notifications.send')) then
    raise exception 'notify: forbidden' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into v_n from public.lb_notify_audience(p_type, coalesce(p_filter,'{}'::jsonb));
  return coalesce(v_n, 0);
end;
$$;
revoke all on function public.get_notification_target_count(text, jsonb) from public, anon;
grant execute on function public.get_notification_target_count(text, jsonb) to authenticated, service_role;

-- admin_send_notification — the broadcast path. authenticated + in-body admin
-- check. Immediate send (scheduled_at null) fans out now; else stored 'scheduled'
-- and dispatched by cron. Returns the admin_notifications id + recipient count.
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
begin
  if not (public.is_admin() or public.has_permission('notifications.send')) then
    raise exception 'notify: forbidden' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_body),'') = '' then
    raise exception 'notify: title and body required' using errcode = 'check_violation';
  end if;
  if p_audience_type not in ('all_parents','all_children','parent','by_subject','individual') then
    raise exception 'notify: bad audience' using errcode = 'check_violation';
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

-- mark read / mark all / unread count / delete — owner-scoped (authenticated).
create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notifications set read_at = coalesce(read_at, now())
   where id = p_id and recipient_profile_id = public.current_profile_id();
end; $$;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated, service_role;

create or replace function public.mark_all_notifications_read()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  update public.notifications set read_at = now()
   where recipient_profile_id = public.current_profile_id() and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated, service_role;

create or replace function public.get_unread_notification_count()
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.notifications
   where recipient_profile_id = public.current_profile_id() and read_at is null
     and (expires_at is null or expires_at > now());
$$;
revoke all on function public.get_unread_notification_count() from public, anon;
grant execute on function public.get_unread_notification_count() to authenticated, service_role;

create or replace function public.delete_notification(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.notifications
   where id = p_id and recipient_profile_id = public.current_profile_id();
end; $$;
revoke all on function public.delete_notification(uuid) from public, anon;
grant execute on function public.delete_notification(uuid) to authenticated, service_role;

-- preferences: read/write own OR a linked child's (parent-managed) OR admin.
create or replace function public.get_notification_preferences(p_profile uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_target uuid := coalesce(p_profile, public.current_profile_id()); v_row public.notification_preferences;
begin
  if v_target is null then raise exception 'prefs: not authenticated'; end if;
  if not (v_target = public.current_profile_id()
          or public.is_parent_linked_to_student(v_target) or public.is_admin()) then
    raise exception 'prefs: forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.notification_preferences where profile_id = v_target;
  return jsonb_build_object(
    'in_app_enabled', coalesce(v_row.in_app_enabled, true),
    'email_enabled',  coalesce(v_row.email_enabled, true),
    'push_enabled',   coalesce(v_row.push_enabled, true));
end; $$;
revoke all on function public.get_notification_preferences(uuid) from public, anon;
grant execute on function public.get_notification_preferences(uuid) to authenticated, service_role;

create or replace function public.set_notification_preferences(
  p_profile uuid, p_in_app boolean, p_email boolean, p_push boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_target uuid := coalesce(p_profile, public.current_profile_id());
begin
  if v_target is null then raise exception 'prefs: not authenticated'; end if;
  if not (v_target = public.current_profile_id()
          or public.is_parent_linked_to_student(v_target) or public.is_admin()) then
    raise exception 'prefs: forbidden' using errcode = 'insufficient_privilege';
  end if;
  insert into public.notification_preferences (profile_id, in_app_enabled, email_enabled, push_enabled)
  values (v_target, coalesce(p_in_app,true), coalesce(p_email,true), coalesce(p_push,true))
  on conflict (profile_id) do update
    set in_app_enabled = excluded.in_app_enabled,
        email_enabled  = excluded.email_enabled,
        push_enabled   = excluded.push_enabled,
        updated_at = now();
end; $$;
revoke all on function public.set_notification_preferences(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_notification_preferences(uuid, boolean, boolean, boolean) to authenticated, service_role;

-- push token upsert (mobile registers this; owner-scoped).
create or replace function public.upsert_push_token(p_token text, p_platform text, p_device jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := public.current_profile_id();
begin
  if v_me is null then raise exception 'push: not authenticated'; end if;
  if p_platform not in ('ios','android','web') then raise exception 'push: bad platform' using errcode='check_violation'; end if;
  insert into public.push_tokens (profile_id, token, platform, device_info, is_valid, last_used_at)
  values (v_me, p_token, p_platform, coalesce(p_device,'{}'::jsonb), true, now())
  on conflict (token) do update
    set profile_id = v_me, platform = excluded.platform, device_info = excluded.device_info,
        is_valid = true, failure_count = 0, last_used_at = now(), updated_at = now();
end; $$;
revoke all on function public.upsert_push_token(text, text, jsonb) from public, anon;
grant execute on function public.upsert_push_token(text, text, jsonb) to authenticated, service_role;

-- ---- processor (service-role only) -------------------------------------------
create or replace function public.claim_pending_deliveries(p_limit int default 50, p_worker text default null)
returns setof public.notification_deliveries
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  update public.notification_deliveries d
     set status = 'queued', provider_ref = p_worker, updated_at = now()
   where d.id in (
     select id from public.notification_deliveries
      where status = 'pending'
      order by created_at
      for update skip locked
      limit greatest(1, least(coalesce(p_limit,50), 500))
   )
  returning d.*;
end; $$;
revoke all on function public.claim_pending_deliveries(int, text) from public, anon, authenticated;
grant execute on function public.claim_pending_deliveries(int, text) to service_role;

create or replace function public.mark_delivery_result(p_id uuid, p_status public.delivery_status, p_ref text default null, p_error text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notification_deliveries
     set status = p_status, provider_ref = coalesce(p_ref, provider_ref),
         error_text = p_error, updated_at = now()
   where id = p_id;
end; $$;
revoke all on function public.mark_delivery_result(uuid, public.delivery_status, text, text) from public, anon, authenticated;
grant execute on function public.mark_delivery_result(uuid, public.delivery_status, text, text) to service_role;

-- dispatch scheduled broadcasts whose time has come (cron / processor).
create or replace function public.dispatch_scheduled_notifications()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row record; v_rec uuid; v_n int; v_total int := 0;
begin
  for v_row in
    select * from public.admin_notifications
     where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
     for update skip locked
  loop
    update public.admin_notifications set status = 'sending' where id = v_row.id;
    v_n := 0;
    for v_rec in select a.profile_id from public.lb_notify_audience(v_row.audience_type, v_row.audience_filter) a
    loop
      perform public.create_notification(
        v_rec, 'admin_announcement', v_row.title, v_row.body,
        jsonb_build_object('admin_notification_id', v_row.id),
        v_row.channels, 'admin:' || v_row.id::text || ':' || v_rec::text, 3, null, 'announcement', null);
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

-- retention prune: delete READ notifications older than retention_days, and trim
-- each user's inbox to max_per_user (keeping the newest). service-role / cron.
create or replace function public.prune_notifications()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_days int; v_max int; v_n int := 0; v_m int;
begin
  v_days := coalesce((select nullif(value_json #>> '{}','')::int from public.system_settings where key='notifications.retention_days'), 180);
  v_max  := coalesce((select nullif(value_json #>> '{}','')::int from public.system_settings where key='notifications.max_per_user'), 500);

  delete from public.notifications
   where read_at is not null and read_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;

  -- Cap per user (delete oldest READ beyond the cap; never prune unread).
  with ranked as (
    select id, row_number() over (partition by recipient_profile_id order by created_at desc) rn
    from public.notifications)
  delete from public.notifications n using ranked r
   where n.id = r.id and r.rn > v_max and n.read_at is not null;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end; $$;
revoke all on function public.prune_notifications() from public, anon, authenticated;
grant execute on function public.prune_notifications() to service_role;

-- =============================================================================
-- RLS hardening
-- =============================================================================
-- notifications: NO client insert/update; select own/admin; delete own/admin.
drop policy if exists "notif_insert" on public.notifications;   -- DEFINER RPCs only
drop policy if exists "notif_update" on public.notifications;   -- mark-read via RPC only
drop policy if exists "notif_delete" on public.notifications;
create policy "notif_delete" on public.notifications for delete to authenticated
  using (recipient_profile_id = public.current_profile_id() or public.is_admin());
-- notif_select (recipient or admin) is kept as-is.

alter table public.admin_notifications enable row level security;
drop policy if exists "adminnotif_select" on public.admin_notifications;
create policy "adminnotif_select" on public.admin_notifications for select to authenticated
  using (public.is_admin() or public.has_permission('notifications.send'));
-- writes only via admin_send_notification (DEFINER) → no client write policy.

alter table public.notification_preferences enable row level security;
drop policy if exists "notifprefs_select" on public.notification_preferences;
create policy "notifprefs_select" on public.notification_preferences for select to authenticated
  using (profile_id = public.current_profile_id()
         or public.is_parent_linked_to_student(profile_id) or public.is_admin());
-- writes via set_notification_preferences (DEFINER) → no client write policy.

alter table public.push_tokens enable row level security;
drop policy if exists "pushtokens_own" on public.push_tokens;
create policy "pushtokens_own" on public.push_tokens for select to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());
drop policy if exists "pushtokens_del" on public.push_tokens;
create policy "pushtokens_del" on public.push_tokens for delete to authenticated
  using (profile_id = public.current_profile_id() or public.is_admin());
-- writes via upsert_push_token (DEFINER) → no client write policy.

-- =============================================================================
-- Template seeds (trilingual; {{var}} placeholders). (code, locale) unique.
-- =============================================================================
insert into public.notification_templates (code, locale, subject, body) values
  ('news_published','az','Yeni xəbər','{{title}} — yeni xəbər dərc olundu.'),
  ('news_published','en','New article','{{title}} — a new article was published.'),
  ('news_published','ru','Новая новость','{{title}} — опубликована новая новость.'),
  ('olympiad_purchased','az','Olimpiada paketi alındı','{{package}} paketi {{child}} üçün aktivdir.'),
  ('olympiad_purchased','en','Olympiad package purchased','{{package}} is now active for {{child}}.'),
  ('olympiad_purchased','ru','Олимпиадный пакет куплен','{{package}} активен для {{child}}.'),
  ('attempt_graded','az','Nəticə hazırdır','Sınağın qiymətləndirildi: {{score}}/{{max}}.'),
  ('attempt_graded','en','Your result is ready','Your test was graded: {{score}}/{{max}}.'),
  ('attempt_graded','ru','Результат готов','Тест оценён: {{score}}/{{max}}.'),
  ('personal_best','az','Yeni rekord!','Yeni şəxsi rekordun: {{points}} xal 🎉'),
  ('personal_best','en','New personal best!','New personal best: {{points}} points 🎉'),
  ('personal_best','ru','Новый рекорд!','Новый личный рекорд: {{points}} очков 🎉'),
  ('streak_milestone','az','Seriya davam edir 🔥','{{days}} günlük seriya! Davam et.'),
  ('streak_milestone','en','Streak milestone 🔥','{{days}}-day streak! Keep it up.'),
  ('streak_milestone','ru','Серия дней 🔥','Серия {{days}} дней! Так держать.'),
  ('subject_expiring','az','Abunə bitmək üzrədir','{{child}} üçün {{subject}} abunəsi {{days}} gün sonra bitir.'),
  ('subject_expiring','en','Subscription ending soon','{{subject}} for {{child}} ends in {{days}} days.'),
  ('subject_expiring','ru','Подписка скоро закончится','{{subject}} для {{child}} закончится через {{days}} дн.'),
  ('subject_charge_failed','az','Ödəniş alınmadı','{{child}} üçün ödəniş uğursuz oldu — giriş bloklandı.'),
  ('subject_charge_failed','en','Payment failed','Payment for {{child}} failed — access is blocked.'),
  ('subject_charge_failed','ru','Платёж не прошёл','Оплата за {{child}} не удалась — доступ заблокирован.'),
  ('subscription_canceled','az','Abunə ləğv edildi','{{child}} üçün abunə cari dövrün sonunda bitəcək.'),
  ('subscription_canceled','en','Subscription canceled','{{child}}''s subscription ends at the period end.'),
  ('subscription_canceled','ru','Подписка отменена','Подписка {{child}} закончится в конце периода.'),
  ('giveaway_ending','az','Kampaniya bitir','Pulsuz kampaniya {{time}} sonra başa çatır.'),
  ('giveaway_ending','en','Giveaway ending','The free campaign ends in {{time}}.'),
  ('giveaway_ending','ru','Акция заканчивается','Бесплатная акция закончится через {{time}}.'),
  ('admin_announcement','az','Elan','{{body}}'),
  ('admin_announcement','en','Announcement','{{body}}'),
  ('admin_announcement','ru','Объявление','{{body}}')
on conflict (code, locale) do nothing;

-- ---- self-verify -------------------------------------------------------------
do $$
begin
  if to_regclass('public.admin_notifications') is null
     or to_regclass('public.notification_preferences') is null
     or to_regclass('public.push_tokens') is null then
    raise exception 'self-verify: notification tables missing';
  end if;
  if has_function_privilege('authenticated','public.create_notification(uuid,text,text,text,jsonb,text[],text,int,text,text,timestamptz)','EXECUTE')
     or has_function_privilege('anon','public.admin_send_notification(text,text,text[],text,jsonb,timestamptz,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.claim_pending_deliveries(int,text)','EXECUTE') then
    raise exception 'self-verify: notification privileges leaked';
  end if;
  if has_function_privilege('authenticated','public.mark_notification_read(uuid)','EXECUTE') = false
     or has_function_privilege('authenticated','public.admin_send_notification(text,text,text[],text,jsonb,timestamptz,text,text)','EXECUTE') = false then
    raise exception 'self-verify: end-user/admin notify RPCs not callable';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='notifications'
              and policyname in ('notif_insert','notif_update')) then
    raise exception 'self-verify: forgeable notification policies still present';
  end if;
  if not exists (select 1 from public.permissions where code='notifications.send') then
    raise exception 'self-verify: notifications.send permission missing';
  end if;
  if (select count(*) from public.notification_templates where code='attempt_graded') < 3 then
    raise exception 'self-verify: templates not seeded';
  end if;
  raise notice 'migration 042 self-verify PASS';
end $$;

commit;
