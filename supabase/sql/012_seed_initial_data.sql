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
-- Starter subjects (curated minimum; expand via Admin Panel later).
-- -----------------------------------------------------------------------------
insert into public.subjects (code, name, status) values
  ('math',        'Riyaziyyat',      'active'),
  ('az_language', 'Azərbaycan dili', 'active'),
  ('english',     'İngilis dili',    'active'),
  ('informatics', 'İnformatika',     'active')
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
-- Base system settings.
-- -----------------------------------------------------------------------------
insert into public.system_settings (key, value_json) values
  ('platform.default_locale', '"az"'::jsonb),
  ('platform.supported_locales', '["az","ru","en"]'::jsonb),
  ('leaderboard.public_display_names', 'false'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Base feature flags (off by default; enable per stage rollout).
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled) values
  ('payments',    false),
  ('leaderboard', false),
  ('notifications_email', false)
on conflict (key) do nothing;

-- =============================================================================
-- End of 012_seed_initial_data.sql
-- =============================================================================
