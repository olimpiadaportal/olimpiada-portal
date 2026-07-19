-- ============================================================================
-- Migration: 2026_07_19_072_contact_address_and_listing_limit.sql
-- Purpose: two small public-surface extensions:
--   * contact.support_address system setting — EXACTLY the
--     contact.support_email/phone/whatsapp shape (migrations 019/070: a JSON
--     string, idempotent on-conflict-do-nothing seed). Seeded with the CURRENT
--     contact-page address ("Səbail rayonu, Akademik Əhəd Yaqubov küç, 52C,
--     Bakı, Azərbaycan") so behavior is unchanged the moment it ships; from
--     now on the address is admin-editable in Settings instead of hardcoded.
--   * get_mobile_config().contact gains "address" (whitelist discipline: ONE
--     known key read, empty-string default), alongside email/phone/whatsapp.
--   * get_public_olympiad_packages gains an OPTIONAL p_limit (int, default
--     null): null or < 1 = all rows (the existing behavior), otherwise
--     least(p_limit, 100). This is a SIGNATURE change, so the zero-arg
--     function from migration 070 is DROPPED and recreated as
--     (p_limit int default null) — a SINGLE function with a defaulted arg, so
--     every existing zero-arg caller (web landing + mobile
--     supabase.rpc('get_public_olympiad_packages') with no args) resolves to
--     it exactly as before. RETURNS TABLE and body are otherwise identical to
--     the 070 definition (canonical 015).
--
-- Environment first applied: development
-- Related root SQL file(s): supabase/sql/012_seed_initial_data.sql
--                           supabase/sql/011_indexes_constraints_functions_triggers.sql
--                           supabase/sql/015_olympiad_preparation.sql
-- Backport status: completed (012 seed, 011 get_mobile_config,
--                  015 listing RPC signature, 013 check #71 extended)
-- Destructive change: no (the listing RPC drop+recreate is signature-only:
--                  same rows, same columns, same grants; the seed never
--                  overwrites an existing value)
-- Rollback notes: delete from public.system_settings where
--                  key='contact.support_address'; restore get_mobile_config
--                  and the zero-arg get_public_olympiad_packages() from
--                  migration 070 (drop the (integer) overload first).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) contact.support_address (same key family/shape as contact.support_email /
--    contact.support_phone / contact.support_whatsapp: a JSON string). Unlike
--    those (seeded empty), this one seeds the LIVE contact-page address so the
--    switch to an admin-editable setting changes nothing visibly. Idempotent:
--    an existing/edited value is never overwritten.
-- ----------------------------------------------------------------------------
insert into public.system_settings (key, value_json)
values ('contact.support_address',
        '"Səbail rayonu, Akademik Əhəd Yaqubov küç, 52C, Bakı, Azərbaycan"'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2) get_mobile_config(): the contact object gains "address" (whitelist
--    discipline — one known key, empty-string default). Everything else is the
--    070 definition verbatim.
-- ----------------------------------------------------------------------------
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
        'address',  coalesce((select value_json->>0 from public.system_settings where key='contact.support_address'), '')),
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

-- ----------------------------------------------------------------------------
-- 3) get_public_olympiad_packages(p_limit int default null): optional row cap
--    for small surfaces (landing teaser, mobile home). null / < 1 = all rows
--    (the pre-072 behavior); otherwise least(p_limit, 100) so an anon caller
--    can never demand an unbounded-but-huge page. SIGNATURE change: drop the
--    zero-arg 070 function first (create or replace cannot change a
--    signature — it would ADD an ambiguous overload), leaving exactly ONE
--    function that zero-arg callers still resolve to via the default.
-- ----------------------------------------------------------------------------
drop function if exists public.get_public_olympiad_packages();

create or replace function public.get_public_olympiad_packages(p_limit int default null)
returns table (
  id             uuid,
  code           text,
  title_az       text,
  title_en       text,
  title_ru       text,
  description_az text,
  description_en text,
  description_ru text,
  price_amount   numeric(10,2),
  currency       text,
  subject_code   text,
  subject_name   text,
  grade_level    int,
  grade_label    text,
  sale_ends_at   timestamptz,
  event_at       timestamptz,
  question_count int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.code,
    coalesce(t_az.title, p.code)                          as title_az,
    coalesce(t_en.title, t_az.title, p.code)              as title_en,
    coalesce(t_ru.title, t_az.title, p.code)              as title_ru,
    t_az.description                                      as description_az,
    coalesce(t_en.description, t_az.description)          as description_en,
    coalesce(t_ru.description, t_az.description)          as description_ru,
    p.price_amount,
    p.currency,
    s.code                                                as subject_code,
    s.name                                                as subject_name,
    g.level::int                                          as grade_level,
    g.name                                                as grade_label,
    p.sale_ends_at,
    p.event_starts_at                                     as event_at,
    coalesce(qc.n, 0)                                     as question_count
  from public.olympiad_packages p
  left join public.olympiad_package_translations t_az
         on t_az.olympiad_package_id = p.id and t_az.locale = 'az'
  left join public.olympiad_package_translations t_en
         on t_en.olympiad_package_id = p.id and t_en.locale = 'en'
  left join public.olympiad_package_translations t_ru
         on t_ru.olympiad_package_id = p.id and t_ru.locale = 'ru'
  left join public.subjects s on s.id = p.subject_id
  left join public.grades   g on g.id = p.grade_id
  left join lateral (
    -- get_olympiad_pool_counts parity: REAL published pool size, never the
    -- display-legacy questions_per_attempt.
    select count(*)::int as n
    from public.questions q
    where q.olympiad_package_id = p.id
      and q.status = 'published'
  ) qc on true
  where public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
  order by least(p.sale_ends_at, p.event_starts_at) asc nulls last,
           coalesce(t_az.title, p.code) asc
  -- Migration 072: optional cap. null/<1 = no limit (pre-072 behavior).
  limit case when p_limit is null or p_limit < 1 then null else least(p_limit, 100) end
$$;
comment on function public.get_public_olympiad_packages(int) is
  'Anon-callable catalog of PUBLICLY PURCHASABLE olympiad packages (migration '
  '070): only rows passing olympiad_package_on_sale, with trilingual texts (az '
  'fallback), price, subject/grade context, sale_ends_at, event_at (= '
  'event_starts_at) and the REAL published pool count. Soonest sale-end/event '
  'first, then az title. Migration 072: optional p_limit (null or < 1 = all '
  'rows, else capped at 100); zero-arg calls keep resolving via the default.';
revoke all on function public.get_public_olympiad_packages(int) from public;
grant execute on function public.get_public_olympiad_packages(int) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Self-verify (raises = migration fails inside this transaction)
-- ----------------------------------------------------------------------------
do $$
declare
  v_setting jsonb;
  v_cfg     jsonb;
  v_def     text;
  v_all     int;
  v_n       int;
begin
  -- 1) contact.support_address seeded, string-typed, non-empty default.
  select value_json into v_setting
  from public.system_settings where key = 'contact.support_address';
  if v_setting is null then
    raise exception 'contact.support_address setting missing';
  end if;
  if jsonb_typeof(v_setting) <> 'string' or length(trim(v_setting->>0)) = 0 then
    raise exception 'contact.support_address must be a non-empty JSON string (got %)', v_setting;
  end if;

  -- 2) get_mobile_config reads the key and exposes contact.address at runtime;
  --    the whole contact whitelist (email/phone/whatsapp/address) is intact.
  if position('contact.support_address' in
       pg_get_functiondef('public.get_mobile_config()'::regprocedure)) = 0 then
    raise exception 'get_mobile_config does not read contact.support_address';
  end if;
  v_cfg := public.get_mobile_config();
  if v_cfg #>> '{contact,address}' is null then
    raise exception 'get_mobile_config().contact.address key absent at runtime';
  end if;
  if not (v_cfg #> '{contact}') ?& array['email','phone','whatsapp','address'] then
    raise exception 'get_mobile_config().contact lost a key (%)', v_cfg #> '{contact}';
  end if;

  -- 3) Listing RPC: the zero-arg overload is GONE and exactly ONE function
  --    with the defaulted arg exists — this is the backward-compat proof: an
  --    unqualified/no-args call (SQL or supabase.rpc) can only resolve to it.
  --    Grants match 070 (anon/authenticated/service_role).
  if to_regprocedure('public.get_public_olympiad_packages()') is not null then
    raise exception 'zero-arg get_public_olympiad_packages still exists (would be an ambiguous overload)';
  end if;
  if to_regprocedure('public.get_public_olympiad_packages(integer)') is null then
    raise exception 'get_public_olympiad_packages(integer) missing';
  end if;
  if (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_public_olympiad_packages') <> 1 then
    raise exception 'get_public_olympiad_packages must have exactly ONE overload';
  end if;
  if not has_function_privilege('anon', 'public.get_public_olympiad_packages(integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_public_olympiad_packages(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_public_olympiad_packages(integer)', 'EXECUTE') then
    raise exception 'get_public_olympiad_packages grants wrong';
  end if;

  -- 4) Functional: callable WITHOUT the arg (compat) and WITH it (positional
  --    and named); null/0 = all rows, 1 caps at one, 1000 caps at 100.
  select count(*) into v_all from public.get_public_olympiad_packages();
  select count(*) into v_n   from public.get_public_olympiad_packages(null);
  if v_n <> v_all then
    raise exception 'p_limit null must return all rows (% vs %)', v_n, v_all;
  end if;
  select count(*) into v_n from public.get_public_olympiad_packages(0);
  if v_n <> v_all then
    raise exception 'p_limit < 1 must mean no limit (% vs %)', v_n, v_all;
  end if;
  select count(*) into v_n from public.get_public_olympiad_packages(p_limit => 1);
  if v_n > 1 then
    raise exception 'p_limit 1 returned % rows', v_n;
  end if;
  select count(*) into v_n from public.get_public_olympiad_packages(1000);
  if v_n > 100 then
    raise exception 'p_limit must cap at 100 (got %)', v_n;
  end if;

  -- 5) Body discipline: still the ONE canonical on-sale predicate, plus the
  --    exact limit-cap marker.
  v_def := pg_get_functiondef('public.get_public_olympiad_packages(integer)'::regprocedure);
  if position('olympiad_package_on_sale' in v_def) = 0 then
    raise exception 'get_public_olympiad_packages no longer reuses the canonical on-sale predicate';
  end if;
  if position('least(p_limit, 100)' in v_def) = 0 then
    raise exception 'get_public_olympiad_packages lacks the least(p_limit, 100) cap';
  end if;

  raise notice 'contact address + listing limit self-verify PASS.';
end $$;

commit;
