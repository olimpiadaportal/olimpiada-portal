-- =============================================================================
-- 012_seed_initial_data.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 012 of 013.
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
  ('solid_slate',    'Slate',    'solid_color', '#e2e8f0', 'active'),
  -- Round 8 (migration 021): playful gradient PRESETS for the student
  -- background selector. `value` holds a CSS gradient string — the picker
  -- swatches and the arena background accept any CSS background value.
  ('preset_race',
   'Sürət yarışı',
   'solid_color',
   'linear-gradient(135deg, #b31217 0%, #e52d27 45%, #ff8a00 100%)',
   'active'),
  ('preset_space',
   'Kosmos',
   'solid_color',
   'radial-gradient(1000px 500px at 80% 0%, rgba(124,58,237,0.55), transparent 60%), linear-gradient(160deg, #0f0c29 0%, #302b63 55%, #24243e 100%)',
   'active'),
  ('preset_ocean',
   'Okean',
   'solid_color',
   'linear-gradient(160deg, #0077b6 0%, #00b4d8 55%, #90e0ef 100%)',
   'active'),
  ('preset_jungle',
   'Cəngəllik',
   'solid_color',
   'linear-gradient(150deg, #134e13 0%, #2e8b57 55%, #a8e063 100%)',
   'active'),
  ('preset_candy',
   'Şirniyyat',
   'solid_color',
   'linear-gradient(135deg, #ff6fb5 0%, #ffa8d5 50%, #ffe29f 100%)',
   'active'),
  ('preset_night_drive',
   'Gecə yarışı',
   'solid_color',
   'radial-gradient(900px 420px at 15% 110%, rgba(196,255,0,0.28), transparent 55%), linear-gradient(150deg, #0a0e1a 0%, #16213e 60%, #0f3460 100%)',
   'active')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Question types.
-- -----------------------------------------------------------------------------
-- MCQ-only launch (migration 037; MCQ = 4 options since migration 040, owner
-- 2026-07-07): multiple_choice IS the MCQ (exactly 4 options, exactly 1 correct)
-- and the only type selectable for new questions; the option count is a FIXED
-- business rule (the admin question-types page no longer edits it). The rest are
-- seeded inactive until their structure rules are defined.
insert into public.question_types (code, name, supports_auto_grading, status, options_required, correct_required) values
  ('single_choice',   'Single choice',   true,  'inactive', null, null),
  ('multiple_choice', 'Multiple choice', true,  'active',   4,    1),
  ('true_false',      'True / False',    true,  'inactive', 2,    1),
  ('numeric_input',   'Numeric input',   true,  'inactive', null, null),
  ('short_text',      'Short text',      false, 'inactive', null, null),
  ('open_text',       'Open / essay',    false, 'inactive', null, null)
on conflict (code) do nothing;
-- Idempotent config for databases seeded before migration 040 (MCQ = 4 options).
update public.question_types set options_required = 4, correct_required = 1 where code = 'multiple_choice';
update public.question_types set status = 'inactive' where code <> 'multiple_choice';
update public.question_types set status = 'active'   where code = 'multiple_choice';

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
-- Bakı schools (Round 10, migration 024) — verified against the official BŞTİ
-- list: https://baku.edu.gov.az/az/page/231 (retrieved 2026-07-03). Numbers
-- missing from the official list are intentionally absent.
-- -----------------------------------------------------------------------------
-- Dedupe guard first (also prevents future duplicate schools per district).
create unique index if not exists uq_schools_district_name
  on public.schools (district_id, lower(name));

-- 312 Bakı schools (310 numbered + 2 named institutions).
insert into public.schools (name, district_id, status)
select v.name, d.id, 'active'
  from (values
    ('Bakı 1 nömrəli tam orta məktəb'),
    ('Bakı 3 nömrəli tam orta məktəb'),
    ('Bakı 4 nömrəli tam orta məktəb'),
    ('Bakı 5 nömrəli tam orta məktəb'),
    ('Bakı 7 nömrəli tam orta məktəb'),
    ('Bakı 8 nömrəli tam orta məktəb'),
    ('Bakı 9 nömrəli tam orta məktəb'),
    ('Bakı 10 nömrəli tam orta məktəb'),
    ('Bakı 12 nömrəli tam orta məktəb'),
    ('Bakı 13 nömrəli tam orta məktəb'),
    ('Bakı 14 nömrəli tam orta məktəb'),
    ('Bakı 17 nömrəli tam orta məktəb'),
    ('Bakı 18 nömrəli tam orta məktəb'),
    ('Bakı 19 nömrəli tam orta məktəb'),
    ('Bakı 21 nömrəli tam orta məktəb'),
    ('Bakı 22 nömrəli tam orta məktəb'),
    ('Bakı 23 nömrəli tam orta məktəb'),
    ('Bakı 24 nömrəli tam orta məktəb'),
    ('Bakı 25 nömrəli tam orta məktəb'),
    ('Bakı 26 nömrəli tam orta məktəb'),
    ('Bakı 27 nömrəli tam orta məktəb'),
    ('Bakı 28 nömrəli tam orta məktəb'),
    ('Bakı 29 nömrəli tam orta məktəb'),
    ('Bakı 30 nömrəli tam orta məktəb'),
    ('Bakı 31 nömrəli tam orta məktəb'),
    ('Bakı 32 nömrəli tam orta məktəb'),
    ('Bakı 33 nömrəli tam orta məktəb'),
    ('Bakı 34 nömrəli tam orta məktəb'),
    ('Bakı 35 nömrəli tam orta məktəb'),
    ('Bakı 36 nömrəli tam orta məktəb'),
    ('Bakı 37 nömrəli tam orta məktəb'),
    ('Bakı 38 nömrəli tam orta məktəb'),
    ('Bakı 39 nömrəli tam orta məktəb'),
    ('Bakı 41 nömrəli tam orta məktəb'),
    ('Bakı 42 nömrəli tam orta məktəb'),
    ('Bakı 44 nömrəli tam orta məktəb'),
    ('Bakı 45 nömrəli tam orta məktəb'),
    ('Bakı 46 nömrəli tam orta məktəb'),
    ('Bakı 47 nömrəli tam orta məktəb'),
    ('Bakı 48 nömrəli tam orta məktəb'),
    ('Bakı 50 nömrəli tam orta məktəb'),
    ('Bakı 51 nömrəli tam orta məktəb'),
    ('Bakı 52 nömrəli tam orta məktəb'),
    ('Bakı 53 nömrəli tam orta məktəb'),
    ('Bakı 54 nömrəli tam orta məktəb'),
    ('Bakı 55 nömrəli tam orta məktəb'),
    ('Bakı 56 nömrəli tam orta məktəb'),
    ('Bakı 57 nömrəli tam orta məktəb'),
    ('Bakı 58 nömrəli tam orta məktəb'),
    ('Bakı 59 nömrəli tam orta məktəb'),
    ('Bakı 60 nömrəli tam orta məktəb'),
    ('Bakı 61 nömrəli tam orta məktəb'),
    ('Bakı 63 nömrəli tam orta məktəb'),
    ('Bakı 64 nömrəli tam orta məktəb'),
    ('Bakı 65 nömrəli tam orta məktəb'),
    ('Bakı 66 nömrəli tam orta məktəb'),
    ('Bakı 67 nömrəli tam orta məktəb'),
    ('Bakı 68 nömrəli tam orta məktəb'),
    ('Bakı 69 nömrəli tam orta məktəb'),
    ('Bakı 71 nömrəli tam orta məktəb'),
    ('Bakı 73 nömrəli tam orta məktəb'),
    ('Bakı 74 nömrəli tam orta məktəb'),
    ('Bakı 75 nömrəli tam orta məktəb'),
    ('Bakı 76 nömrəli tam orta məktəb'),
    ('Bakı 78 nömrəli tam orta məktəb'),
    ('Bakı 79 nömrəli tam orta məktəb'),
    ('Bakı 80 nömrəli tam orta məktəb'),
    ('Bakı 81 nömrəli tam orta məktəb'),
    ('Bakı 82 nömrəli tam orta məktəb'),
    ('Bakı 84 nömrəli tam orta məktəb'),
    ('Bakı 85 nömrəli tam orta məktəb'),
    ('Bakı 86 nömrəli tam orta məktəb'),
    ('Bakı 87 nömrəli tam orta məktəb'),
    ('Bakı 88 nömrəli tam orta məktəb'),
    ('Bakı 89 nömrəli tam orta məktəb'),
    ('Bakı 90 nömrəli tam orta məktəb'),
    ('Bakı 91 nömrəli tam orta məktəb'),
    ('Bakı 92 nömrəli tam orta məktəb'),
    ('Bakı 93 nömrəli tam orta məktəb'),
    ('Bakı 94 nömrəli tam orta məktəb'),
    ('Bakı 95 nömrəli tam orta məktəb'),
    ('Bakı 96 nömrəli tam orta məktəb'),
    ('Bakı 97 nömrəli tam orta məktəb'),
    ('Bakı 98 nömrəli tam orta məktəb'),
    ('Bakı 99 nömrəli tam orta məktəb'),
    ('Bakı 100 nömrəli tam orta məktəb'),
    ('Bakı 101 nömrəli tam orta məktəb'),
    ('Bakı 102 nömrəli tam orta məktəb'),
    ('Bakı 103 nömrəli tam orta məktəb'),
    ('Bakı 104 nömrəli tam orta məktəb'),
    ('Bakı 105 nömrəli tam orta məktəb'),
    ('Bakı 106 nömrəli tam orta məktəb'),
    ('Bakı 107 nömrəli tam orta məktəb'),
    ('Bakı 108 nömrəli tam orta məktəb'),
    ('Bakı 109 nömrəli tam orta məktəb'),
    ('Bakı 110 nömrəli tam orta məktəb'),
    ('Bakı 111 nömrəli tam orta məktəb'),
    ('Bakı 112 nömrəli tam orta məktəb'),
    ('Bakı 113 nömrəli tam orta məktəb'),
    ('Bakı 114 nömrəli tam orta məktəb'),
    ('Bakı 115 nömrəli tam orta məktəb'),
    ('Bakı 116 nömrəli tam orta məktəb'),
    ('Bakı 117 nömrəli tam orta məktəb'),
    ('Bakı 118 nömrəli tam orta məktəb'),
    ('Bakı 119 nömrəli tam orta məktəb'),
    ('Bakı 120 nömrəli tam orta məktəb'),
    ('Bakı 121 nömrəli tam orta məktəb'),
    ('Bakı 122 nömrəli tam orta məktəb'),
    ('Bakı 123 nömrəli tam orta məktəb'),
    ('Bakı 124 nömrəli tam orta məktəb'),
    ('Bakı 125 nömrəli tam orta məktəb'),
    ('Bakı 127 nömrəli tam orta məktəb'),
    ('Bakı 128 nömrəli tam orta məktəb'),
    ('Bakı 129 nömrəli tam orta məktəb'),
    ('Bakı 130 nömrəli tam orta məktəb'),
    ('Bakı 131 nömrəli tam orta məktəb'),
    ('Bakı 133 nömrəli tam orta məktəb'),
    ('Bakı 135 nömrəli tam orta məktəb'),
    ('Bakı 136 nömrəli tam orta məktəb'),
    ('Bakı 137 nömrəli tam orta məktəb'),
    ('Bakı 138 nömrəli tam orta məktəb'),
    ('Bakı 139 nömrəli tam orta məktəb'),
    ('Bakı 140 nömrəli tam orta məktəb'),
    ('Bakı 141 nömrəli tam orta məktəb'),
    ('Bakı 142 nömrəli tam orta məktəb'),
    ('Bakı 143 nömrəli tam orta məktəb'),
    ('Bakı 144 nömrəli tam orta məktəb'),
    ('Bakı 145 nömrəli tam orta məktəb'),
    ('Bakı 146 nömrəli tam orta məktəb'),
    ('Bakı 148 nömrəli tam orta məktəb'),
    ('Bakı 149 nömrəli tam orta məktəb'),
    ('Bakı 150 nömrəli tam orta məktəb'),
    ('Bakı 151 nömrəli tam orta məktəb'),
    ('Bakı 152 nömrəli tam orta məktəb'),
    ('Bakı 153 nömrəli tam orta məktəb'),
    ('Bakı 154 nömrəli tam orta məktəb'),
    ('Bakı 155 nömrəli tam orta məktəb'),
    ('Bakı 156 nömrəli tam orta məktəb'),
    ('Bakı 157 nömrəli tam orta məktəb'),
    ('Bakı 158 nömrəli tam orta məktəb'),
    ('Bakı 159 nömrəli tam orta məktəb'),
    ('Bakı 161 nömrəli tam orta məktəb'),
    ('Bakı 162 nömrəli tam orta məktəb'),
    ('Bakı 163 nömrəli tam orta məktəb'),
    ('Bakı 164 nömrəli tam orta məktəb'),
    ('Bakı 165 nömrəli tam orta məktəb'),
    ('Bakı 167 nömrəli tam orta məktəb'),
    ('Bakı 168 nömrəli tam orta məktəb'),
    ('Bakı 169 nömrəli tam orta məktəb'),
    ('Bakı 170 nömrəli tam orta məktəb'),
    ('Bakı 171 nömrəli tam orta məktəb'),
    ('Bakı 172 nömrəli tam orta məktəb'),
    ('Bakı 173 nömrəli tam orta məktəb'),
    ('Bakı 175 nömrəli tam orta məktəb'),
    ('Bakı 176 nömrəli tam orta məktəb'),
    ('Bakı 177 nömrəli tam orta məktəb'),
    ('Bakı 178 nömrəli tam orta məktəb'),
    ('Bakı 179 nömrəli tam orta məktəb'),
    ('Bakı 180 nömrəli tam orta məktəb'),
    ('Bakı 181 nömrəli tam orta məktəb'),
    ('Bakı 182 nömrəli tam orta məktəb'),
    ('Bakı 183 nömrəli tam orta məktəb'),
    ('Bakı 184 nömrəli tam orta məktəb'),
    ('Bakı 185 nömrəli tam orta məktəb'),
    ('Bakı 186 nömrəli tam orta məktəb'),
    ('Bakı 187 nömrəli tam orta məktəb'),
    ('Bakı 188 nömrəli tam orta məktəb'),
    ('Bakı 189 nömrəli tam orta məktəb'),
    ('Bakı 190 nömrəli tam orta məktəb'),
    ('Bakı 191 nömrəli tam orta məktəb'),
    ('Bakı 192 nömrəli tam orta məktəb'),
    ('Bakı 193 nömrəli tam orta məktəb'),
    ('Bakı 194 nömrəli tam orta məktəb'),
    ('Bakı 195 nömrəli tam orta məktəb'),
    ('Bakı 196 nömrəli tam orta məktəb'),
    ('Bakı 197 nömrəli tam orta məktəb'),
    ('Bakı 198 nömrəli tam orta məktəb'),
    ('Bakı 199 nömrəli tam orta məktəb'),
    ('Bakı 201 nömrəli tam orta məktəb'),
    ('Bakı 202 nömrəli tam orta məktəb'),
    ('Bakı 203 nömrəli tam orta məktəb'),
    ('Bakı 204 nömrəli tam orta məktəb'),
    ('Bakı 205 nömrəli tam orta məktəb'),
    ('Bakı 206 nömrəli tam orta məktəb'),
    ('Bakı 207 nömrəli tam orta məktəb'),
    ('Bakı 208 nömrəli tam orta məktəb'),
    ('Bakı 209 nömrəli tam orta məktəb'),
    ('Bakı 210 nömrəli tam orta məktəb'),
    ('Bakı 211 nömrəli tam orta məktəb'),
    ('Bakı 212 nömrəli tam orta məktəb'),
    ('Bakı 214 nömrəli tam orta məktəb'),
    ('Bakı 215 nömrəli tam orta məktəb'),
    ('Bakı 216 nömrəli tam orta məktəb'),
    ('Bakı 217 nömrəli tam orta məktəb'),
    ('Bakı 218 nömrəli tam orta məktəb'),
    ('Bakı 221 nömrəli tam orta məktəb'),
    ('Bakı 222 nömrəli tam orta məktəb'),
    ('Bakı 223 nömrəli tam orta məktəb'),
    ('Bakı 224 nömrəli tam orta məktəb'),
    ('Bakı 225 nömrəli tam orta məktəb'),
    ('Bakı 226 nömrəli tam orta məktəb'),
    ('Bakı 227 nömrəli tam orta məktəb'),
    ('Bakı 228 nömrəli tam orta məktəb'),
    ('Bakı 229 nömrəli tam orta məktəb'),
    ('Bakı 230 nömrəli tam orta məktəb'),
    ('Bakı 231 nömrəli tam orta məktəb'),
    ('Bakı 232 nömrəli tam orta məktəb'),
    ('Bakı 233 nömrəli tam orta məktəb'),
    ('Bakı 234 nömrəli tam orta məktəb'),
    ('Bakı 235 nömrəli tam orta məktəb'),
    ('Bakı 236 nömrəli tam orta məktəb'),
    ('Bakı 237 nömrəli tam orta məktəb'),
    ('Bakı 238 nömrəli tam orta məktəb'),
    ('Bakı 239 nömrəli tam orta məktəb'),
    ('Bakı 240 nömrəli tam orta məktəb'),
    ('Bakı 241 nömrəli tam orta məktəb'),
    ('Bakı 242 nömrəli tam orta məktəb'),
    ('Bakı 243 nömrəli tam orta məktəb'),
    ('Bakı 244 nömrəli tam orta məktəb'),
    ('Bakı 245 nömrəli tam orta məktəb'),
    ('Bakı 247 nömrəli tam orta məktəb'),
    ('Bakı 248 nömrəli tam orta məktəb'),
    ('Bakı 249 nömrəli tam orta məktəb'),
    ('Bakı 250 nömrəli tam orta məktəb'),
    ('Bakı 251 nömrəli tam orta məktəb'),
    ('Bakı 253 nömrəli tam orta məktəb'),
    ('Bakı 254 nömrəli tam orta məktəb'),
    ('Bakı 255 nömrəli tam orta məktəb'),
    ('Bakı 256 nömrəli tam orta məktəb'),
    ('Bakı 257 nömrəli tam orta məktəb'),
    ('Bakı 258 nömrəli tam orta məktəb'),
    ('Bakı 259 nömrəli tam orta məktəb'),
    ('Bakı 260 nömrəli tam orta məktəb'),
    ('Bakı 262 nömrəli tam orta məktəb'),
    ('Bakı 263 nömrəli tam orta məktəb'),
    ('Bakı 265 nömrəli tam orta məktəb'),
    ('Bakı 266 nömrəli tam orta məktəb'),
    ('Bakı 269 nömrəli tam orta məktəb'),
    ('Bakı 270 nömrəli tam orta məktəb'),
    ('Bakı 271 nömrəli tam orta məktəb'),
    ('Bakı 272 nömrəli tam orta məktəb'),
    ('Bakı 273 nömrəli tam orta məktəb'),
    ('Bakı 274 nömrəli tam orta məktəb'),
    ('Bakı 275 nömrəli tam orta məktəb'),
    ('Bakı 276 nömrəli tam orta məktəb'),
    ('Bakı 277 nömrəli tam orta məktəb'),
    ('Bakı 278 nömrəli tam orta məktəb'),
    ('Bakı 279 nömrəli tam orta məktəb'),
    ('Bakı 280 nömrəli tam orta məktəb'),
    ('Bakı 281 nömrəli tam orta məktəb'),
    ('Bakı 282 nömrəli tam orta məktəb'),
    ('Bakı 283 nömrəli tam orta məktəb'),
    ('Bakı 284 nömrəli tam orta məktəb'),
    ('Bakı 285 nömrəli tam orta məktəb'),
    ('Bakı 286 nömrəli tam orta məktəb'),
    ('Bakı 288 nömrəli tam orta məktəb'),
    ('Bakı 290 nömrəli tam orta məktəb'),
    ('Bakı 292 nömrəli tam orta məktəb'),
    ('Bakı 293 nömrəli tam orta məktəb'),
    ('Bakı 294 nömrəli tam orta məktəb'),
    ('Bakı 295 nömrəli tam orta məktəb'),
    ('Bakı 296 nömrəli tam orta məktəb'),
    ('Bakı 297 nömrəli tam orta məktəb'),
    ('Bakı 298 nömrəli tam orta məktəb'),
    ('Bakı 300 nömrəli tam orta məktəb'),
    ('Bakı 301 nömrəli tam orta məktəb'),
    ('Bakı 302 nömrəli tam orta məktəb'),
    ('Bakı 303 nömrəli tam orta məktəb'),
    ('Bakı 305 nömrəli tam orta məktəb'),
    ('Bakı 306 nömrəli tam orta məktəb'),
    ('Bakı 307 nömrəli tam orta məktəb'),
    ('Bakı 308 nömrəli tam orta məktəb'),
    ('Bakı 309 nömrəli tam orta məktəb'),
    ('Bakı 310 nömrəli tam orta məktəb'),
    ('Bakı 311 nömrəli tam orta məktəb'),
    ('Bakı 312 nömrəli tam orta məktəb'),
    ('Bakı 313 nömrəli tam orta məktəb'),
    ('Bakı 314 nömrəli tam orta məktəb'),
    ('Bakı 315 nömrəli tam orta məktəb'),
    ('Bakı 316 nömrəli tam orta məktəb'),
    ('Bakı 317 nömrəli tam orta məktəb'),
    ('Bakı 318 nömrəli tam orta məktəb'),
    ('Bakı 319 nömrəli tam orta məktəb'),
    ('Bakı 320 nömrəli tam orta məktəb'),
    ('Bakı 321 nömrəli tam orta məktəb'),
    ('Bakı 322 nömrəli tam orta məktəb'),
    ('Bakı 323 nömrəli tam orta məktəb'),
    ('Bakı 324 nömrəli tam orta məktəb'),
    ('Bakı 326 nömrəli tam orta məktəb'),
    ('Bakı 327 nömrəli tam orta məktəb'),
    ('Bakı 328 nömrəli tam orta məktəb'),
    ('Bakı 329 nömrəli tam orta məktəb'),
    ('Bakı 331 nömrəli tam orta məktəb'),
    ('Bakı 333 nömrəli tam orta məktəb'),
    ('Bakı 334 nömrəli tam orta məktəb'),
    ('Bakı 335 nömrəli tam orta məktəb'),
    ('Bakı 336 nömrəli tam orta məktəb'),
    ('Bakı 337 nömrəli tam orta məktəb'),
    ('Bakı 338 nömrəli tam orta məktəb'),
    ('Bakı 339 nömrəli tam orta məktəb'),
    ('Bakı 341 nömrəli tam orta məktəb'),
    ('Bakı 342 nömrəli tam orta məktəb'),
    ('Bakı 343 nömrəli tam orta məktəb'),
    ('Bakı 344 nömrəli tam orta məktəb'),
    ('Bakı 345 nömrəli tam orta məktəb'),
    ('Bakı 346 nömrəli tam orta məktəb'),
    ('Bakı 347 nömrəli tam orta məktəb'),
    ('Bakı 348 nömrəli tam orta məktəb'),
    ('Bakı 349 nömrəli tam orta məktəb'),
    ('Bakı 350 nömrəli tam orta məktəb'),
    ('1 nömrəli idman liseyi'),
    ('Bülbül adına orta ixtisas musiqi məktəbi')
  ) as v(name)
  cross join (select id from public.districts where name = 'Bakı' limit 1) d
on conflict (district_id, lower(name)) do nothing;

-- Round 12 (migration 029): curated starter set of well-known Bakı PRIVATE schools
-- (is_private = true; no number -> school_number NULL, sorted by name within the
-- private group). Demonstrative starter list — admins add/rename/remove via the
-- admin panel. Private schools sort BEFORE public everywhere.
insert into public.schools (name, district_id, status, is_private)
select v.name, d.id, 'active'::public.catalog_status, true
  from (values
    ('Dünya Məktəbi'),
    ('Landau Məktəbi'),
    ('Təfəkkür Liseyi'),
    ('Zəkalar Liseyi'),
    ('Avropa Liseyi'),
    ('Xəzər Universiteti nəzdində lisey')
  ) as v(name)
  cross join (select id from public.districts where country_code = 'AZ' and name = 'Bakı' limit 1) d
on conflict (district_id, lower(name)) do nothing;

-- Backfill the numeric sort key from the AZ name ("N nömrəli ..."); idempotent
-- (only fills NULLs). Named institutions with no number stay NULL (sort last).
update public.schools
   set school_number = nullif(substring(name from '([0-9]+)[[:space:]]+nömrəli'), '')::int
 where school_number is null
   and name ~ '[0-9]+[[:space:]]+nömrəli';

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
  ('social.tiktok',                 '""'::jsonb),
  -- Round 11 (migration 025): giveaway window. duration_days is admin-editable;
  -- started_at is stamped by the exclusivity trigger when the flag flips ON.
  ('giveaway.duration_days',        '7'::jsonb),
  ('giveaway.started_at',           '""'::jsonb)
  -- Round 12 note: the design.* tokens seeded by migration 031 were REMOVED in
  -- migration 033 (the "Site Content & Design" design/font/colour editor was
  -- dropped in favour of a TEXT-ONLY Website Content Management module).
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Base feature flags (payments/notifications off by default; leaderboard ON
-- since migration 041, owner 2026-07-07; launch_promo/news_public/olympiad_module
-- ship enabled — Round 6 backport of flags that previously existed only on dev).
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled) values
  ('payments',    false),
  ('leaderboard', true),
  ('notifications_email', false),
  ('launch_promo',    true),
  ('news_public',     true),
  ('olympiad_module', true),
  -- Round 11 (migration 025): payment modes. At most ONE of payments /
  -- demo_payments / giveaway_period may be enabled (DB trigger in 011).
  ('demo_payments',   false),
  ('giveaway_period', false)
on conflict (key) do nothing;


-- -----------------------------------------------------------------------------
-- LEADERBOARD ENGINE (backported from migrations/2026_07_06_039_leaderboard_engine.sql)
-- Points formula settings (weights come from difficulty_levels.weight).
-- -----------------------------------------------------------------------------
-- per_correct: base points per correct answer (× difficulty_levels.weight);
-- practice_daily_cap_per_subject: max practice+topic-test points per subject per
-- local day (anti-grind; olympiads uncapped); olympiad_multiplier: olympiad boost.
insert into public.system_settings (key, value_json)
values
  ('leaderboard.points.per_correct', '10'::jsonb),
  ('leaderboard.points.practice_daily_cap_per_subject', '150'::jsonb),
  ('leaderboard.points.olympiad_multiplier', '1.5'::jsonb)
on conflict (key) do nothing;

--

-- =============================================================================
-- End of 012_seed_initial_data.sql
-- =============================================================================
