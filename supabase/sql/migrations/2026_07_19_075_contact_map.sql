-- ============================================================================
-- Migration: 2026_07_19_075_contact_map.sql
-- Round 29 (owner ask): the Contact-page mini-map must be admin-controlled and
-- show the exact configured location, not a hardcoded pin.
--
-- Adds `contact.support_map_query` (empty default). The clients build the
-- keyless Google-Maps query from: this value if set (a precise "lat,lng" or a
-- place query for an exact pin), else `contact.support_address`, else the
-- built-in Government-House fallback. Empty default = the map keeps deriving
-- from the address, so behavior is unchanged until an admin sets a precise pin.
--
-- get_mobile_config().contact gains `map_query` so the mobile Contact screen can
-- open the same location in the device maps app. This migration takes the LIVE
-- get_mobile_config definition verbatim and adds only the one contact line.
-- Backported to 012 (seed) + 011 (get_mobile_config). 013 #75.
-- ============================================================================

begin;

-- Same key family/shape as the other contact.* settings (a JSON string).
insert into public.system_settings (key, value_json)
values ('contact.support_map_query', '""'::jsonb)
on conflict (key) do nothing;

-- Thread map_query into the mobile config contact object. Body is the live
-- definition; the ONLY change is the added 'map_query' line in 'contact'.
create or replace function public.get_mobile_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
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
  select jsonb_object_agg(key, enabled) into v_flags
  from public.feature_flags
  where key in ('payments','demo_payments','giveaway_period','news_public',
                'olympiad_module','leaderboard','notifications',
                'notifications_push','launch_promo');
  v_flags    := coalesce(v_flags, '{}'::jsonb);
  v_real     := coalesce((v_flags->>'payments')::boolean, true);
  v_demo     := coalesce((v_flags->>'demo_payments')::boolean, false);
  v_gvw_flag := coalesce((v_flags->>'giveaway_period')::boolean, false);

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

  select value_json into v_setting from public.system_settings where key = 'platform.supported_locales';
  if v_setting is not null and jsonb_typeof(v_setting) = 'array' and jsonb_array_length(v_setting) > 0 then
    v_locales := v_setting;
  end if;
  select value_json into v_setting from public.system_settings where key = 'platform.default_locale';
  if v_setting is not null and jsonb_typeof(v_setting) = 'string'
     and length(trim(v_setting->>0)) > 0 then
    v_default_loc := trim(v_setting->>0);
  end if;

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
        'email',    coalesce((select value_json->>0 from public.system_settings where key='contact.support_email'), ''),
        'phone',    coalesce((select value_json->>0 from public.system_settings where key='contact.support_phone'), ''),
        -- Migration 070: admin-configured WhatsApp line (empty = hidden in UIs).
        'whatsapp', coalesce((select value_json->>0 from public.system_settings where key='contact.support_whatsapp'), ''),
        -- Migration 072: admin-editable support/office address (contact page).
        'address',  coalesce((select value_json->>0 from public.system_settings where key='contact.support_address'), ''),
        -- Migration 075: precise map query/coordinates (empty = derive from address).
        'map_query', coalesce((select value_json->>0 from public.system_settings where key='contact.support_map_query'), '')),
    'social', jsonb_build_object(
        'facebook',  coalesce((select value_json->>0 from public.system_settings where key='social.facebook'), ''),
        'instagram', coalesce((select value_json->>0 from public.system_settings where key='social.instagram'), ''),
        'youtube',   coalesce((select value_json->>0 from public.system_settings where key='social.youtube'), ''),
        'tiktok',    coalesce((select value_json->>0 from public.system_settings where key='social.tiktok'), '')),
    'version', coalesce(v_version, '{}'::jsonb)
  );
end;
$function$;
revoke all on function public.get_mobile_config() from public;
grant execute on function public.get_mobile_config() to anon, authenticated, service_role;

-- Self-verify
do $$
declare v_cfg jsonb;
begin
  if not exists (select 1 from public.system_settings where key='contact.support_map_query') then
    raise exception 'contact.support_map_query not seeded';
  end if;
  v_cfg := public.get_mobile_config();
  if not (v_cfg->'contact' ? 'map_query') then
    raise exception 'get_mobile_config contact.map_query missing';
  end if;
  raise notice 'contact map self-verify PASS.';
end $$;

commit;
