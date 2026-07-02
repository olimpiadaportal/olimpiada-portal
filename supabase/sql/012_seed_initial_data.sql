-- =============================================================================
-- 012_seed_initial_data.sql
-- =============================================================================
-- Olimpiada Portal — canonical root SQL file 012 of 013.
--
-- Responsibility : Initial reference/seed data: roles, permissions, role grants,
--                  grades, starter subjects, content catalogs, subscription plans,
--                  base settings/flags.
-- Run order      : After 011. Before 013 (validation).
-- Safe to rerun  : Yes. All inserts are upsert-based (ON CONFLICT DO NOTHING).
-- Notes          : This is reference/config data only — NOT user data. It does
--                  NOT create admin accounts (admins are bootstrapped securely in
--                  Supabase Auth + assigned the 'administrator' role separately).
--                  Prices are placeholders; stripe_price_id is set later by ops.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles (system roles).
-- -----------------------------------------------------------------------------
insert into public.roles (code, name, is_system) values
  ('administrator',   'Administrator',          true),
  ('content_manager', 'Teacher / Content Manager', true),
  ('student',         'Student',                true),
  ('parent',          'Parent',                 true)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Permissions (atomic; see 03_AUTH_RBAC_SECURITY_AND_AUDIT).
-- -----------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('users.read',                  'Read user/profile data'),
  ('users.manage',                'Create/update/manage users'),
  ('users.suspend',               'Suspend/deactivate users'),
  ('content.create',              'Create content (questions/etc.)'),
  ('content.edit_own',            'Edit own draft content'),
  ('content.review',              'Review submitted content'),
  ('content.publish',             'Publish/unpublish content'),
  ('content.archive',             'Archive content'),
  ('tests.manage',                'Manage test packages'),
  ('daily_tasks.manage',          'Manage daily task packages'),
  ('payments.read',               'Read payment data'),
  ('payments.manage',             'Manage payments/coupons'),
  ('subscriptions.manage',        'Manage subscriptions'),
  ('analytics.read_admin',        'Read full admin analytics'),
  ('analytics.read_subject_limited','Read limited subject analytics'),
  ('audit.read',                  'Read audit logs'),
  ('settings.manage',             'Manage system settings'),
  ('feature_flags.manage',        'Manage feature flags')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Role -> permission grants.
-- Administrator gets ALL permissions.
-- -----------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'administrator'
on conflict do nothing;

-- Content Manager: least-privilege content workflow + limited analytics only.
-- (No payments/settings/audit/role management — see Content Manager boundary.)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in ('content.create', 'content.edit_own', 'analytics.read_subject_limited')
where r.code = 'content_manager'
on conflict do nothing;

-- Student and Parent hold NO permission codes; their access is ownership-based
-- through RLS (own data / active parent_student_links).

-- -----------------------------------------------------------------------------
-- Grades 1..11.
-- -----------------------------------------------------------------------------
insert into public.grades (level, name)
select g, g::text || '. sinif'
from generate_series(1, 11) as g
on conflict (level) do nothing;

-- -----------------------------------------------------------------------------
-- Cities (the districts table is the City catalog; schools link to a city).
-- AZ proper nouns; idempotent via unique(country_code, name). Localized city
-- names could be added later as a districts_translations table.
-- -----------------------------------------------------------------------------
insert into public.districts (name, country_code, status) values
  ('Bakı',       'AZ', 'active'),
  ('Gəncə',      'AZ', 'active'),
  ('Sumqayıt',   'AZ', 'active'),
  ('Mingəçevir', 'AZ', 'active'),
  ('Şirvan',     'AZ', 'active'),
  ('Naxçıvan',   'AZ', 'active'),
  ('Lənkəran',   'AZ', 'active'),
  ('Şəki',       'AZ', 'active'),
  ('Yevlax',     'AZ', 'active'),
  ('Xırdalan',   'AZ', 'active'),
  ('Quba',       'AZ', 'active'),
  ('Şamaxı',     'AZ', 'active'),
  ('Qəbələ',     'AZ', 'active'),
  ('Gədəbəy',    'AZ', 'active'),
  ('Ağdam',      'AZ', 'active')
on conflict (country_code, name) do nothing;

-- -----------------------------------------------------------------------------
-- Sample schools under Bakı (each with a valid mandatory district_id) for testing.
-- Admins create real schools later via the Admin Panel.
-- -----------------------------------------------------------------------------
insert into public.schools (name, district_id, status)
select v.name, d.id, 'active'::public.catalog_status
from (values
  ('Bakı 6 nömrəli tam orta məktəb'),
  ('Bakı 20 nömrəli tam orta məktəb')
) as v(name)
cross join lateral (
  select id from public.districts where country_code = 'AZ' and name = 'Bakı' limit 1
) as d
where not exists (
  select 1 from public.schools s where s.name = v.name and s.district_id = d.id
);

-- -----------------------------------------------------------------------------
-- Starter subjects (curated minimum; expand via Admin Panel later).
-- -----------------------------------------------------------------------------
insert into public.subjects (code, name, status) values
  ('math',        'Riyaziyyat',      'active'),
  ('az_language', 'Azərbaycan dili', 'active'),
  ('english',     'İngilis dili',    'active'),
  ('informatics', 'İnformatika',     'active')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Predefined solid-color wallpapers (child dashboard). Image wallpapers are
-- added later by an admin via the wallpaper-assets bucket.
-- -----------------------------------------------------------------------------
insert into public.wallpapers (code, name, kind, value, status) values
  ('solid_sky',      'Sky',      'solid_color', '#dbeafe', 'active'),
  ('solid_mint',     'Mint',     'solid_color', '#dcfce7', 'active'),
  ('solid_lavender', 'Lavender', 'solid_color', '#ede9fe', 'active'),
  ('solid_peach',    'Peach',    'solid_color', '#ffedd5', 'active'),
  ('solid_rose',     'Rose',     'solid_color', '#ffe4e6', 'active'),
  ('solid_slate',    'Slate',    'solid_color', '#e2e8f0', 'active')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Question types.
-- -----------------------------------------------------------------------------
insert into public.question_types (code, name, supports_auto_grading) values
  ('single_choice',   'Single choice',   true),
  ('multiple_choice', 'Multiple choice', true),
  ('true_false',      'True / False',    true),
  ('numeric_input',   'Numeric input',   true),
  ('short_text',      'Short text',      false),
  ('open_text',       'Open / essay',    false)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Difficulty levels.
-- -----------------------------------------------------------------------------
insert into public.difficulty_levels (code, name, weight) values
  ('easy',     'Easy',     1.0),
  ('medium',   'Medium',   2.0),
  ('hard',     'Hard',     3.0),
  ('olympiad', 'Olympiad', 5.0)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Olympiad types.
-- -----------------------------------------------------------------------------
insert into public.olympiad_types (code, name) values
  ('school',        'School'),
  ('regional',      'Regional / Rayon'),
  ('national',      'National / Republic'),
  ('international', 'International')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Subscription plans (placeholder prices in AZN; stripe_price_id set by ops).
-- -----------------------------------------------------------------------------
insert into public.subscription_plans (code, name, price_amount, currency, interval, status) values
  ('weekly',  'Weekly',  4.99,  'AZN', 'week',  'active'),
  ('monthly', 'Monthly', 14.99, 'AZN', 'month', 'active'),
  ('yearly',  'Yearly',  119.99,'AZN', 'year',  'active')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Child-based subscriptions config & subject pricing (Stage 7, increment 2).
-- Backported from migrations/2026_06_27_007_child_subscriptions_payments.sql.
-- -----------------------------------------------------------------------------
-- Singleton promo/trial config (promo window unset; ongoing 7-day trial).
insert into public.launch_promo_config (id, trial_days) values (1, 7)
on conflict (id) do nothing;

-- Placeholder per-subject pricing (1 AZN/subject weekly; configurable by admin).
insert into public.subjects_pricing (subject_id, interval, price_amount, currency, status)
select s.id, i.interval, i.price, 'AZN', 'active'
from public.subjects s
cross join (values
  ('week'::public.plan_interval, 1.00),
  ('month'::public.plan_interval, 3.00),
  ('year'::public.plan_interval, 30.00)
) as i(interval, price)
where s.code in ('math', 'science', 'english', 'informatics', 'az_language')
on conflict (subject_id, interval) do nothing;

-- -----------------------------------------------------------------------------
-- Base system settings.
-- -----------------------------------------------------------------------------
insert into public.system_settings (key, value_json) values
  ('platform.default_locale', '"az"'::jsonb),
  ('platform.supported_locales', '["az","ru","en"]'::jsonb),
  ('leaderboard.public_display_names', 'false'::jsonb),
  -- Round 6 (migration 019): support/maintenance/social settings surfaced by the
  -- redesigned admin Settings (typed controls; no raw-JSON editors).
  ('contact.support_email',         '""'::jsonb),
  ('contact.support_phone',         '""'::jsonb),
  ('platform.maintenance_mode',     'false'::jsonb),
  ('platform.maintenance_message',  '{"az":"","en":"","ru":""}'::jsonb),
  ('social.facebook',               '""'::jsonb),
  ('social.instagram',              '""'::jsonb),
  ('social.youtube',                '""'::jsonb),
  ('social.tiktok',                 '""'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Base feature flags (payments/leaderboard/notifications off by default;
-- launch_promo/news_public/olympiad_module ship enabled — Round 6 backport of
-- flags that previously existed only on dev).
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled) values
  ('payments',    false),
  ('leaderboard', false),
  ('notifications_email', false),
  ('launch_promo',    true),
  ('news_public',     true),
  ('olympiad_module', true)
on conflict (key) do nothing;

-- =============================================================================
-- End of 012_seed_initial_data.sql
-- =============================================================================
