-- =============================================================================
-- 2026_07_09_045_mobile_control_plane.sql
-- Stage M1 (mobile) — the ADMIN CONTROL PLANE the mobile app boots against.
--
-- Why: `feature_flags`, `system_settings` and `site_content` are admin-only under
-- RLS (the web app reads them server-side with the service role). The mobile app
-- has NO service role, so it needs two anon-callable, hard-whitelisted readers:
--
--   1) get_mobile_config()        -> one JSON the app gates itself with:
--        payment MODE (resolved server-side with web paymentMode.ts parity,
--        incl. lazy giveaway-window expiry), module flags, maintenance,
--        locales, contact/social, per-platform version gate.
--   2) get_mobile_content(locale) -> the site_content override map for ONE
--        locale, so the admin "Website Content" CMS reaches mobile with zero
--        releases (web getT()/I18nProvider parity).
--
-- Plus the NEW `mobile_app_versions` table (per-platform min/latest/force/
-- store_url + trilingual message) that backs the config's `version` block and
-- the admin panel's "Mobile App" section. Admin-only RLS; the config RPC is the
-- only public reader (returns whitelisted columns only, never `select *`).
--
-- Backports: table -> 008 · RLS -> 010 · triggers + RPCs -> 011 · seed -> 012 ·
-- checks #56/#57 -> 013.
-- Apply to DEV/STAGING via: psql "$OLIMPIADA_DEV_DB_URL" -f <this file>
-- =============================================================================

begin;

-- ---- 1) mobile_app_versions ---------------------------------------------------
create table if not exists public.mobile_app_versions (
  id             uuid primary key default gen_random_uuid(),
  platform       text not null unique check (platform in ('ios','android')),
  -- Simple semver strings; the APP compares them client-side against its own
  -- version. `force_update` hard-blocks below `min_version`; otherwise the app
  -- may show a soft "update available" hint when behind `latest_version`.
  min_version    text not null default '1.0.0' check (min_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  latest_version text not null default '1.0.0' check (latest_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  force_update   boolean not null default false,
  store_url      text not null default '' check (store_url = '' or store_url ~ '^https://'),
  message_az     text not null default '',
  message_en     text not null default '',
  message_ru     text not null default '',
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.mobile_app_versions enable row level security;

-- Admin-only, like site_content: no anon/authenticated policy beyond admins;
-- the anon-safe reader is get_mobile_config() below.
drop policy if exists "mobile_app_versions_admin" on public.mobile_app_versions;
create policy "mobile_app_versions_admin" on public.mobile_app_versions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_set_updated_at on public.mobile_app_versions;
create trigger trg_set_updated_at before update on public.mobile_app_versions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_mobile_app_versions on public.mobile_app_versions;
create trigger trg_audit_mobile_app_versions
  after insert or update or delete on public.mobile_app_versions
  for each row execute function public.fn_audit_row();

-- Seed one row per platform (idempotent).
insert into public.mobile_app_versions (platform)
values ('ios'), ('android')
on conflict (platform) do nothing;

-- ---- 2) get_mobile_config() -----------------------------------------------------
-- SECURITY DEFINER whitelist reader. Payment-mode resolution mirrors
-- web-app/src/lib/paymentMode.ts EXACTLY:
--   * missing `payments` flag       -> real (legacy parity)
--   * missing demo/giveaway flags   -> off
--   * giveaway active only when flag ON + started_at parseable + duration > 0
--     + now() < started_at + duration_days (lazy expiry — flag alone is never
--     enough); precedence giveaway(active) > demo > real > off.
create or replace function public.get_mobile_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flags        jsonb;
  v_real         boolean;
  v_demo         boolean;
  v_gvw_flag     boolean;
  v_gvw_days     int := 0;
  v_gvw_start    timestamptz;
  v_gvw_end      timestamptz;
  v_gvw_active   boolean := false;
  v_mode         text;
  v_maint_on     boolean := false;
  v_maint_msg    jsonb := jsonb_build_object('az','','en','','ru','');
  v_locales      jsonb := jsonb_build_array('az','en','ru');
  v_default_loc  text := 'az';
  v_setting      jsonb;
  v_version      jsonb;
begin
  -- Flags (whitelisted keys only).
  select jsonb_object_agg(key, enabled) into v_flags
  from public.feature_flags
  where key in ('payments','demo_payments','giveaway_period','news_public',
                'olympiad_module','leaderboard','notifications',
                'notifications_push','launch_promo');
  v_flags    := coalesce(v_flags, '{}'::jsonb);
  v_real     := coalesce((v_flags->>'payments')::boolean, true);
  v_demo     := coalesce((v_flags->>'demo_payments')::boolean, false);
  v_gvw_flag := coalesce((v_flags->>'giveaway_period')::boolean, false);

  -- Giveaway window (lazy expiry).
  select value_json into v_setting from public.system_settings where key = 'giveaway.duration_days';
  if v_setting is not null and jsonb_typeof(v_setting) = 'number' then
    v_gvw_days := greatest(0, floor((v_setting)::text::numeric)::int);
  end if;
  select value_json into v_setting from public.system_settings where key = 'giveaway.started_at';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    begin
      v_gvw_start := (trim(v_setting->>0))::timestamptz;
    exception when others then
      v_gvw_start := null;
    end;
  end if;
  if v_gvw_flag and v_gvw_start is not null and v_gvw_days > 0 then
    v_gvw_end    := v_gvw_start + make_interval(days => v_gvw_days);
    v_gvw_active := now() < v_gvw_end;
  end if;
  v_mode := case
    when v_gvw_active then 'giveaway'
    when v_demo       then 'demo'
    when v_real       then 'real'
    else 'off'
  end;

  -- Maintenance.
  select value_json into v_setting from public.system_settings where key = 'platform.maintenance_mode';
  if v_setting is not null and jsonb_typeof(v_setting) = 'boolean' then
    v_maint_on := (v_setting)::text::boolean;
  end if;
  select value_json into v_setting from public.system_settings where key = 'platform.maintenance_message';
  if v_setting is not null and jsonb_typeof(v_setting) = 'object' then
    v_maint_msg := jsonb_build_object(
      'az', coalesce(v_setting->>'az',''),
      'en', coalesce(v_setting->>'en',''),
      'ru', coalesce(v_setting->>'ru',''));
  end if;

  -- Locales.
  select value_json into v_setting from public.system_settings where key = 'platform.supported_locales';
  if v_setting is not null and jsonb_typeof(v_setting) = 'array' and jsonb_array_length(v_setting) > 0 then
    v_locales := v_setting;
  end if;
  select value_json into v_setting from public.system_settings where key = 'platform.default_locale';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    v_default_loc := trim(v_setting->>0);
  end if;

  -- Version gate (per-platform message — more flexible than one shared blob).
  select jsonb_object_agg(platform, jsonb_build_object(
           'min',       min_version,
           'latest',    latest_version,
           'force',     force_update,
           'store_url', store_url,
           'message',   jsonb_build_object('az', message_az, 'en', message_en, 'ru', message_ru)))
    into v_version
  from public.mobile_app_versions;

  return jsonb_build_object(
    'payment', jsonb_build_object(
        'mode', v_mode,
        'giveaway_ends_at', case when v_gvw_active then to_jsonb(v_gvw_end) else 'null'::jsonb end),
    'flags', jsonb_build_object(
        'news_public',        coalesce((v_flags->>'news_public')::boolean, false),
        'olympiad_module',    coalesce((v_flags->>'olympiad_module')::boolean, false),
        'leaderboard',        coalesce((v_flags->>'leaderboard')::boolean, false),
        'notifications',      coalesce((v_flags->>'notifications')::boolean, false),
        'notifications_push', coalesce((v_flags->>'notifications_push')::boolean, false),
        'launch_promo',       coalesce((v_flags->>'launch_promo')::boolean, false)),
    'maintenance', jsonb_build_object('on', v_maint_on, 'message', v_maint_msg),
    'locales', jsonb_build_object('supported', v_locales, 'default', v_default_loc),
    'contact', jsonb_build_object(
        'email', coalesce((select value_json->>0 from public.system_settings where key='contact.support_email'), ''),
        'phone', coalesce((select value_json->>0 from public.system_settings where key='contact.support_phone'), '')),
    'social', jsonb_build_object(
        'facebook',  coalesce((select value_json->>0 from public.system_settings where key='social.facebook'), ''),
        'instagram', coalesce((select value_json->>0 from public.system_settings where key='social.instagram'), ''),
        'youtube',   coalesce((select value_json->>0 from public.system_settings where key='social.youtube'), ''),
        'tiktok',    coalesce((select value_json->>0 from public.system_settings where key='social.tiktok'), '')),
    'version', coalesce(v_version, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.get_mobile_config() from public;
grant execute on function public.get_mobile_config() to anon, authenticated, service_role;

-- ---- 3) get_mobile_content(locale) ----------------------------------------------
-- The site_content override map for one locale (empty values are fallbacks and
-- are omitted). Rows are already registry-allowlisted at write time by the admin
-- CMS; a hard cap keeps the payload bounded regardless.
create or replace function public.get_mobile_content(p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(s.key, s.val), '{}'::jsonb)
  from (
    select key,
           case when p_locale = 'en' then en
                when p_locale = 'ru' then ru
                else az
           end as val
    from public.site_content
    order by key
    limit 500
  ) s
  where length(s.val) > 0;
$$;
revoke all on function public.get_mobile_content(text) from public;
grant execute on function public.get_mobile_content(text) to anon, authenticated, service_role;

-- ---- 4) self-verify --------------------------------------------------------------
do $$
declare
  v_cfg jsonb;
  v_keys text[];
begin
  -- Table + seed + RLS + policy.
  if to_regclass('public.mobile_app_versions') is null then
    raise exception 'mobile_app_versions missing';
  end if;
  if (select count(*) from public.mobile_app_versions where platform in ('ios','android')) <> 2 then
    raise exception 'mobile_app_versions platforms not seeded';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.mobile_app_versions'::regclass) then
    raise exception 'mobile_app_versions RLS not enabled';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='mobile_app_versions' and policyname='mobile_app_versions_admin') then
    raise exception 'mobile_app_versions admin policy missing';
  end if;

  -- Anon executability (the whole point of the control plane).
  if not has_function_privilege('anon', 'public.get_mobile_config()', 'EXECUTE') then
    raise exception 'get_mobile_config not anon-executable';
  end if;
  if not has_function_privilege('anon', 'public.get_mobile_content(text)', 'EXECUTE') then
    raise exception 'get_mobile_content not anon-executable';
  end if;

  -- Whitelist shape: EXACTLY these top-level keys.
  v_cfg := public.get_mobile_config();
  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_cfg) k;
  if v_keys is distinct from array['contact','flags','locales','maintenance','payment','social','version'] then
    raise exception 'get_mobile_config unexpected shape: %', v_keys;
  end if;
  if v_cfg->'version'->'ios' is null or v_cfg->'version'->'android' is null then
    raise exception 'get_mobile_config version block incomplete';
  end if;
  if (v_cfg->'payment'->>'mode') not in ('real','demo','giveaway','off') then
    raise exception 'get_mobile_config invalid payment mode: %', v_cfg->'payment'->>'mode';
  end if;

  -- Content override reader returns an object.
  if jsonb_typeof(public.get_mobile_content('az')) <> 'object' then
    raise exception 'get_mobile_content did not return an object';
  end if;

  raise notice 'mobile control plane self-verify PASS (mode=%)', v_cfg->'payment'->>'mode';
end $$;

commit;
