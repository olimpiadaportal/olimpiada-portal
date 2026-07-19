-- ============================================================================
-- Migration: 2026_07_18_070_olympiad_sales_window.sql
-- Purpose: olympiad packages gain a PUBLIC SALES WINDOW (investor round):
--   * new nullable olympiad_packages.sale_starts_at / sale_ends_at
--     (timestamptz, UTC, server-time authoritative) + CHECK (end > start when
--     both set). The EVENT date REUSES the existing event_starts_at column
--     (Round 8, migration 021) — no duplicate "event_at" column; the public
--     RPC below exposes it under the name event_at.
--   * ONE canonical availability predicate, olympiad_package_on_sale(status,
--     starts, ends): publicly purchasable ⇔ status = 'active' AND
--     (sale_starts_at IS NULL OR <= now()) AND (sale_ends_at IS NULL OR
--     > now()). Reused by RLS, purchase_olympiad and the public listing RPC —
--     never re-inlined.
--   * RLS tightened: non-admin, non-purchaser users see a package (and its
--     translations) ONLY while it is on sale. A user linked to a PURCHASE of
--     the package (purchaser parent, the child, an active linked parent, the
--     creator parent — the exact olympiad_purchases_select family rule) keeps
--     reading it FOREVER: the sales window ends public visibility, never the
--     lifetime entitlement. Admins read all. Factored into
--     can_view_olympiad_package(package_id) so packages + translations can
--     never diverge.
--   * purchase_olympiad now rejects off-sale packages server-side (errcode
--     check_violation, hint 'package_not_on_sale') — direct-API purchases of
--     expired listings are dead. The migration-035 "past event = not sellable"
--     rule is carried over as a ONE-TIME backfill (sale_ends_at :=
--     event_starts_at where unset) so no previously-blocked package becomes
--     purchasable; from now on the window column is the only sale gate.
--   * start_olympiad_attempt is intentionally UNTOUCHED: it has no package-
--     status/window check (purchase-gated only), which is exactly the
--     lifetime rule — purchasers keep attempting after the window closes.
--   * NEW anon-callable get_public_olympiad_packages(): on-sale listings only
--     (id, code, trilingual title/description with az fallback, price,
--     subject, grade, sale_ends_at, event_at, REAL published pool count —
--     get_olympiad_pool_counts parity), ordered soonest-ending/event first.
--   * contact.support_whatsapp system setting (empty default — no real number
--     yet; UIs hide when empty) + get_mobile_config().contact.whatsapp.
--
-- Environment first applied: development
-- Related root SQL file(s): supabase/sql/015_olympiad_preparation.sql
--                           supabase/sql/011_indexes_constraints_functions_triggers.sql
--                           supabase/sql/012_seed_initial_data.sql
-- Backport status: completed (015 columns/check/helpers/RLS/listing RPC,
--                  011 purchase_olympiad + get_mobile_config, 012 seed,
--                  013 new check #71)
-- Destructive change: no (additive columns; RLS is tightened for non-
--                  purchasers only; the data backfill only fills NULLs)
-- Rollback notes: drop policy-recreate with the old status='active' predicate,
--                  drop functions get_public_olympiad_packages(),
--                  can_view_olympiad_package(uuid),
--                  olympiad_package_on_sale(catalog_status,timestamptz,timestamptz),
--                  restore purchase_olympiad from 011 pre-070, drop the two
--                  sale_* columns. Purchases/attempts data is never touched.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Columns + window sanity CHECK. The event date stays on the existing
--    event_starts_at column (exposed as event_at by the public RPC).
-- ----------------------------------------------------------------------------
alter table public.olympiad_packages
  add column if not exists sale_starts_at timestamptz,
  add column if not exists sale_ends_at   timestamptz;

do $$ begin
  alter table public.olympiad_packages
    add constraint chk_olympiad_sales_window
    check (sale_ends_at is null or sale_starts_at is null or sale_ends_at > sale_starts_at);
exception when duplicate_object then null; end $$;

comment on column public.olympiad_packages.sale_starts_at is
  'Public sales window opens (UTC, server-authoritative). NULL = on sale immediately once active.';
comment on column public.olympiad_packages.sale_ends_at is
  'Public sales window closes (UTC). NULL = open-ended. After it passes the package is hidden from public listing/purchase but stays admin-visible and PURCHASERS KEEP lifetime access + attempts + history (there is no entitlement expiry).';

-- ONE-TIME backfill (NOT backported to seeds — data migration, 061-style):
-- migration 035 treated a past event_starts_at as "not sellable"; carry that
-- exact behavior into the new mechanism so nothing previously blocked reopens.
-- Admins can lift/adjust the window explicitly from now on.
update public.olympiad_packages
   set sale_ends_at = event_starts_at
 where sale_ends_at is null
   and event_starts_at is not null;

-- ----------------------------------------------------------------------------
-- 2) THE canonical on-sale predicate (single definition, reused everywhere).
-- ----------------------------------------------------------------------------
create or replace function public.olympiad_package_on_sale(
  p_status public.catalog_status,
  p_starts timestamptz,
  p_ends   timestamptz
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_status = 'active'
     and (p_starts is null or p_starts <= now())
     and (p_ends   is null or p_ends   >  now())
$$;
comment on function public.olympiad_package_on_sale(public.catalog_status, timestamptz, timestamptz) is
  'THE public-sale predicate for olympiad packages (migration 070): active AND '
  'inside [sale_starts_at, sale_ends_at). Server now() is authoritative. Reused '
  'by RLS, purchase_olympiad and get_public_olympiad_packages — never re-inline it.';
revoke all on function public.olympiad_package_on_sale(public.catalog_status, timestamptz, timestamptz) from public;
grant execute on function public.olympiad_package_on_sale(public.catalog_status, timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) Package visibility = on sale OR admin OR purchase-family. DEFINER so the
--    packages and translations policies share ONE evaluation (and the nested
--    purchases/students reads never depend on those tables'' own RLS).
--    The family rule mirrors olympiad_purchases_select EXACTLY.
-- ----------------------------------------------------------------------------
create or replace function public.can_view_olympiad_package(p_package_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.olympiad_packages p
    where p.id = p_package_id
      and (
        public.olympiad_package_on_sale(p.status, p.sale_starts_at, p.sale_ends_at)
        or public.is_admin()
        or exists (
             select 1 from public.olympiad_purchases pu
             where pu.olympiad_package_id = p.id
               and (
                 pu.owner_parent_profile_id = public.current_profile_id()
                 or pu.student_profile_id = public.current_profile_id()
                 or public.is_parent_linked_to_student(pu.student_profile_id)
                 or exists (select 1 from public.students s
                            where s.profile_id = pu.student_profile_id
                              and s.created_by_parent_profile_id = public.current_profile_id())
               )
           )
      )
  )
$$;
comment on function public.can_view_olympiad_package(uuid) is
  'Row visibility for olympiad packages + their translations (migration 070): '
  'on sale (olympiad_package_on_sale) OR admin OR anyone in the purchase family '
  '(purchaser parent / the child / active linked parent / creator parent — the '
  'olympiad_purchases_select rule). Purchasers keep reading a package after the '
  'sales window forever (lifetime access, no entitlement expiry).';
revoke all on function public.can_view_olympiad_package(uuid) from public;
grant execute on function public.can_view_olympiad_package(uuid) to anon, authenticated, service_role;

-- Packages: public read ONLY while on sale; purchase family + admins always.
drop policy if exists "olympiad_packages_select" on public.olympiad_packages;
create policy "olympiad_packages_select" on public.olympiad_packages for select
  using (public.can_view_olympiad_package(id));

-- Translations follow the package''s visibility 1:1 (same helper — cannot drift).
drop policy if exists "olympiad_pkg_tr_select" on public.olympiad_package_translations;
create policy "olympiad_pkg_tr_select" on public.olympiad_package_translations for select
  using (public.can_view_olympiad_package(olympiad_package_id));

-- ----------------------------------------------------------------------------
-- 4) purchase_olympiad: the canonical predicate is enforced server-side, so a
--    direct request can never buy an off-sale/expired package. Replaces the
--    migration-035 inline status/event check (behavior preserved via the
--    backfill above). Everything else (idempotent lifetime purchase, refund
--    re-buy at current price) is unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.purchase_olympiad(
  p_student_profile_id uuid,
  p_package_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner     uuid;
  v_price     numeric(10,2);
  v_currency  text;
  v_status    public.catalog_status;
  v_starts    timestamptz;
  v_ends      timestamptz;
  v_existing  uuid;
  v_ex_status text;
  v_id        uuid;
begin
  select created_by_parent_profile_id into v_owner
  from public.students where profile_id = p_student_profile_id;
  if v_owner is null then raise exception 'purchase: child has no owning parent'; end if;

  select price_amount, currency, status, sale_starts_at, sale_ends_at
    into v_price, v_currency, v_status, v_starts, v_ends
  from public.olympiad_packages where id = p_package_id;
  if v_price is null then raise exception 'purchase: package not found'; end if;
  -- Sales window (migration 070): the ONE canonical predicate. Off-sale =
  -- not purchasable, full stop (existing purchasers are unaffected — this
  -- guard only blocks NEW purchases).
  if not public.olympiad_package_on_sale(v_status, v_starts, v_ends) then
    raise exception 'purchase: package not on sale'
      using errcode = 'check_violation', hint = 'package_not_on_sale';
  end if;

  -- Lifetime: one purchase per child/package (idempotent).
  select id, status into v_existing, v_ex_status from public.olympiad_purchases
  where student_profile_id = p_student_profile_id and olympiad_package_id = p_package_id;
  if v_existing is not null then
    if v_ex_status = 'active' then
      return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
    end if;
    -- Audit L17 (migration 035): re-buying after a refund records the CURRENT price/date.
    update public.olympiad_purchases
       set status = 'active', amount = v_price, currency = v_currency,
           purchased_at = now(), updated_at = now()
     where id = v_existing;
    return jsonb_build_object('purchase_id', v_existing, 'status', 'active', 'existing', true);
  end if;

  insert into public.olympiad_purchases
    (olympiad_package_id, owner_parent_profile_id, student_profile_id,
     amount, currency, status, purchased_at, provider)
  values
    (p_package_id, v_owner, p_student_profile_id, v_price, v_currency, 'active', now(), 'none')
  returning id into v_id;

  return jsonb_build_object('purchase_id', v_id, 'status', 'active', 'existing', false);
end;
$$;

comment on function public.purchase_olympiad(uuid, uuid) is
  'Parent one-time LIFETIME purchase of an olympiad package for a child. '
  'service_role only (payment stubbed). Migration 070: only packages passing '
  'olympiad_package_on_sale are purchasable (hint package_not_on_sale otherwise).';

revoke all on function public.purchase_olympiad(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purchase_olympiad(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 5) Public listing RPC: the landing/parent/mobile "buyable olympiads" feed.
--    DEFINER + anon-callable, so the row filter INSIDE is the security
--    boundary: ONLY on-sale packages ever leave this function (no draft/
--    inactive/archived/off-sale leakage). Counts reuse the
--    get_olympiad_pool_counts rule (published questions in the private pool).
-- ----------------------------------------------------------------------------
create or replace function public.get_public_olympiad_packages()
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
$$;
comment on function public.get_public_olympiad_packages() is
  'Anon-callable catalog of PUBLICLY PURCHASABLE olympiad packages (migration '
  '070): only rows passing olympiad_package_on_sale, with trilingual texts (az '
  'fallback), price, subject/grade context, sale_ends_at, event_at (= '
  'event_starts_at) and the REAL published pool count. Soonest sale-end/event '
  'first, then az title.';
revoke all on function public.get_public_olympiad_packages() from public;
grant execute on function public.get_public_olympiad_packages() to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6) contact.support_whatsapp (same key family/shape as contact.support_email
--    and contact.support_phone: a JSON string, empty by default — no real
--    number exists yet; UIs hide the line while empty) + the mobile config
--    contact object gains "whatsapp" (whitelist discipline: one known key).
-- ----------------------------------------------------------------------------
insert into public.system_settings (key, value_json)
values ('contact.support_whatsapp', '""'::jsonb)
on conflict (key) do nothing;

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
        'whatsapp', coalesce((select value_json->>0 from public.system_settings where key='contact.support_whatsapp'), '')),
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
-- Self-verify (raises = migration fails inside this transaction)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def     text;
  v_pkg     uuid;
  v_student uuid;
  v_hint    text;
  v_row     record;
  v_res     jsonb;
begin
  -- 1) Columns + window CHECK present.
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='olympiad_packages'
                   and column_name='sale_starts_at')
     or not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='olympiad_packages'
                      and column_name='sale_ends_at') then
    raise exception 'sale window columns missing on olympiad_packages';
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'chk_olympiad_sales_window'
                   and conrelid = 'public.olympiad_packages'::regclass) then
    raise exception 'chk_olympiad_sales_window missing';
  end if;

  -- 2) Helpers + listing RPC + grants. anon must be able to evaluate the RLS
  --    helpers and call the public listing; nothing grants anon the admin RPCs.
  if to_regprocedure('public.olympiad_package_on_sale(public.catalog_status,timestamptz,timestamptz)') is null
     or to_regprocedure('public.can_view_olympiad_package(uuid)') is null
     or to_regprocedure('public.get_public_olympiad_packages()') is null then
    raise exception 'sales-window functions missing';
  end if;
  if not has_function_privilege('anon', 'public.get_public_olympiad_packages()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_public_olympiad_packages()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_public_olympiad_packages()', 'EXECUTE') then
    raise exception 'get_public_olympiad_packages grants wrong';
  end if;
  if not has_function_privilege('anon', 'public.can_view_olympiad_package(uuid)', 'EXECUTE') then
    raise exception 'anon cannot evaluate can_view_olympiad_package (RLS would break)';
  end if;
  if has_function_privilege('anon', 'public.purchase_olympiad(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.purchase_olympiad(uuid,uuid)', 'EXECUTE') then
    raise exception 'purchase_olympiad must stay service-role-only';
  end if;

  -- 3) The ONE-predicate discipline: purchase guard + visibility helper +
  --    listing all reference olympiad_package_on_sale; the purchase guard
  --    carries the package_not_on_sale hint.
  v_def := pg_get_functiondef('public.purchase_olympiad(uuid,uuid)'::regprocedure);
  if position('olympiad_package_on_sale' in v_def) = 0
     or position('package_not_on_sale' in v_def) = 0 then
    raise exception 'purchase_olympiad lacks the on-sale guard/hint';
  end if;
  if position('olympiad_package_on_sale' in
       pg_get_functiondef('public.can_view_olympiad_package(uuid)'::regprocedure)) = 0 then
    raise exception 'can_view_olympiad_package does not reuse the canonical predicate';
  end if;
  if position('olympiad_package_on_sale' in
       pg_get_functiondef('public.get_public_olympiad_packages()'::regprocedure)) = 0 then
    raise exception 'get_public_olympiad_packages does not reuse the canonical predicate';
  end if;

  -- 4) RLS: both select policies delegate to the shared visibility helper.
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='olympiad_packages'
                   and policyname='olympiad_packages_select'
                   and qual like '%can_view_olympiad_package%') then
    raise exception 'olympiad_packages_select does not use can_view_olympiad_package';
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='olympiad_package_translations'
                   and policyname='olympiad_pkg_tr_select'
                   and qual like '%can_view_olympiad_package%') then
    raise exception 'olympiad_pkg_tr_select does not use can_view_olympiad_package';
  end if;

  -- 5) Lifetime rule intact: start_olympiad_attempt must have NO sales-window/
  --    status gate (purchase-gated only) — purchasers attempt forever.
  v_def := pg_get_functiondef('public.start_olympiad_attempt(uuid)'::regprocedure);
  if position('olympiad_package_on_sale' in v_def) > 0
     or position('sale_ends_at' in v_def) > 0 then
    raise exception 'start_olympiad_attempt must not gate on the sales window';
  end if;

  -- 6) contact.support_whatsapp seeded + surfaced by get_mobile_config.
  if not exists (select 1 from public.system_settings where key = 'contact.support_whatsapp') then
    raise exception 'contact.support_whatsapp setting missing';
  end if;
  if position('contact.support_whatsapp' in
       pg_get_functiondef('public.get_mobile_config()'::regprocedure)) = 0 then
    raise exception 'get_mobile_config does not expose contact.whatsapp';
  end if;
  if coalesce((public.get_mobile_config())#>>'{contact,whatsapp}', 'MISSING') = 'MISSING' then
    raise exception 'get_mobile_config().contact.whatsapp key absent at runtime';
  end if;

  -- 7) Functional smoke (unwound via the 068 savepoint/exception pattern):
  --    an ACTIVE package whose window ENDED must be invisible to the public
  --    listing and unpurchasable; reopening the window flips both.
  begin
    insert into public.olympiad_packages (code, price_amount, status, sale_starts_at, sale_ends_at)
    values ('smoke_070_sales_window', 5, 'active', now() - interval '2 days', now() - interval '1 day')
    returning id into v_pkg;
    insert into public.olympiad_package_translations (olympiad_package_id, locale, title, description)
    values (v_pkg, 'az', 'Smoke paketi', 'Smoke təsviri');

    -- 7a) Window closed → excluded from the public listing.
    if exists (select 1 from public.get_public_olympiad_packages() l where l.id = v_pkg) then
      raise exception 'smoke: off-sale package leaked into get_public_olympiad_packages';
    end if;

    -- 7b) Window closed → purchase_olympiad refuses with the exact hint.
    --     Needs a real parent-created student; skipped on from-zero DBs.
    select st.profile_id into v_student
    from public.students st
    where st.created_by_parent_profile_id is not null
    limit 1;
    if v_student is null then
      raise notice 'sales-window purchase smoke SKIPPED (no parent-created student in this environment).';
    else
      begin
        perform public.purchase_olympiad(v_student, v_pkg);
        raise exception 'smoke: purchase of an off-sale package succeeded';
      exception when check_violation then
        get stacked diagnostics v_hint = pg_exception_hint;
        if v_hint is distinct from 'package_not_on_sale' then
          raise exception 'smoke: off-sale purchase raised without the package_not_on_sale hint (%)', v_hint;
        end if;
      end;
    end if;

    -- 7c) Window open → listed with the documented shape, and purchasable.
    update public.olympiad_packages
       set sale_starts_at = now() - interval '1 hour',
           sale_ends_at   = now() + interval '1 day'
     where id = v_pkg;
    select * into v_row from public.get_public_olympiad_packages() l where l.id = v_pkg;
    if v_row.id is null then
      raise exception 'smoke: on-sale package missing from get_public_olympiad_packages';
    end if;
    if v_row.title_az <> 'Smoke paketi'
       or v_row.title_en <> 'Smoke paketi'          -- az fallback
       or v_row.title_ru <> 'Smoke paketi'          -- az fallback
       or v_row.question_count <> 0
       or v_row.price_amount <> 5
       or v_row.event_at is not null then
      raise exception 'smoke: listing row shape unexpected (%)', v_row;
    end if;
    if v_student is not null then
      v_res := public.purchase_olympiad(v_student, v_pkg);
      if coalesce(v_res->>'status','') <> 'active' then
        raise exception 'smoke: on-sale purchase did not activate (%)', v_res;
      end if;
    end if;

    -- 7d) Not-started-yet and archived must both be hidden again.
    update public.olympiad_packages
       set sale_starts_at = now() + interval '1 hour', sale_ends_at = null
     where id = v_pkg;
    if exists (select 1 from public.get_public_olympiad_packages() l where l.id = v_pkg) then
      raise exception 'smoke: not-yet-on-sale package leaked into the public listing';
    end if;
    update public.olympiad_packages
       set status = 'archived', sale_starts_at = null, sale_ends_at = null
     where id = v_pkg;
    if exists (select 1 from public.get_public_olympiad_packages() l where l.id = v_pkg) then
      raise exception 'smoke: archived package leaked into the public listing';
    end if;

    -- Unwind every smoke row (package, translation, purchase, audit side rows).
    raise exception 'SMOKE_ROLLBACK';
  exception when others then
    if sqlerrm <> 'SMOKE_ROLLBACK' then raise; end if;
  end;

  if exists (select 1 from public.olympiad_packages where code = 'smoke_070_sales_window') then
    raise exception 'smoke: rollback failed to unwind the fake package';
  end if;

  raise notice 'olympiad sales-window self-verify PASS.';
end $$;

commit;
