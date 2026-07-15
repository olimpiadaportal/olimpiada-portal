-- =============================================================================
-- 002_core_profiles_roles_permissions.sql
-- =============================================================================
-- OlympIQ — canonical root SQL file 002 of 013.
--
-- Responsibility : Core identity & RBAC core tables:
--                  profiles, roles, permissions, role_permissions, profile_roles,
--                  parents, students, parent_student_links.
--                  PLUS the security/permission helper functions used by RLS.
-- Run order      : After 001. Before 003 (taxonomy) and 010 (RLS policies).
-- Safe to rerun  : Yes (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--                  guarded constraints). Non-destructive.
--
-- DESIGN NOTE (run-order correctness):
--   RLS policies live in 010 and MUST reference security helper functions
--   (is_admin, has_permission, current_profile_id, is_parent_linked_to_student).
--   Because 010 runs BEFORE 011, those helper functions are defined HERE in 002
--   (right after the RBAC tables exist) so the database can always be rebuilt by
--   running files in numeric order. 011 keeps the updated_at / audit trigger
--   functions and the deferred cross-file foreign keys.
--
-- DESIGN NOTE (forward FKs):
--   students.grade_id / school_id / district_id reference taxonomy tables created
--   in 003, and profiles.avatar_media_id references media_assets created in 008.
--   Those columns are declared here as plain uuid columns; their FOREIGN KEY
--   constraints are added in 011 to preserve numeric run order.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles : public application profile, 1:1 with a Supabase Auth user.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid not null unique references auth.users (id) on delete cascade,
  display_name     text,
  email            citext,
  phone_optional   text,                      -- LEGACY, unused by app code (kept non-destructively; superseded by phone)
  phone            text,                      -- Round 11: parent contact phone, E.164 (+994…); required at parent registration (app-enforced)
  preferred_locale public.content_locale not null default 'az',
  avatar_media_id  uuid,                       -- FK to media_assets added in 011 (deferred)
  status           public.account_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile linked 1:1 to a Supabase Auth user. No passwords or binary files are stored here.';
comment on column public.profiles.phone_optional is
  'Optional contact phone. Profile metadata only. Never used for SMS or authentication (SMS is excluded).';

-- Round 11 (migration 025): E.164 shape guard for the real phone column.
do $$ begin
  alter table public.profiles
    add constraint chk_profiles_phone_e164
    check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$');
exception when duplicate_object then null; end $$;

comment on column public.profiles.phone is
  'Parent contact phone in E.164 (+<country><number>). Required at parent registration (app-enforced); null for children/admin/legacy rows. Never used for SMS/auth.';

-- -----------------------------------------------------------------------------
-- roles : role definitions (RBAC). Do not rely on a text role column alone.
-- -----------------------------------------------------------------------------
create table if not exists public.roles (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,            -- e.g. 'administrator','content_manager','student','parent'
  name       text not null,
  is_system  boolean not null default false,  -- system roles cannot be deleted by admins
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- permissions : atomic permission catalog (e.g. 'payments.manage').
-- -----------------------------------------------------------------------------
create table if not exists public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- role_permissions : role <-> permission join.
-- -----------------------------------------------------------------------------
create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- profile_roles : user <-> role assignment.
-- -----------------------------------------------------------------------------
create table if not exists public.profile_roles (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role_id     uuid not null references public.roles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, role_id)
);

-- -----------------------------------------------------------------------------
-- parents : parent-specific data (1:1 with a profile).
-- -----------------------------------------------------------------------------
create table if not exists public.parents (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- students : student-specific data (1:1 with a profile).
-- grade_id / school_id / district_id FKs are deferred to 011 (taxonomy is 003).
-- -----------------------------------------------------------------------------
create table if not exists public.students (
  profile_id         uuid primary key references public.profiles (id) on delete cascade,
  grade_id           uuid,                     -- FK -> grades(id) added in 011
  school_id          uuid,                     -- FK -> schools(id) added in 011
  district_id        uuid,                     -- FK -> districts(id) added in 011 (NB: districts = the CITIES table)
  city_district_id   uuid,                     -- FK -> city_districts(id) added in 011 (intra-city rayon, Round 21)
  birth_year_optional smallint,
  -- Parent-created child account fields (Stage 7 business model).
  -- created_by_parent_profile_id index is added in 011.
  created_by_parent_profile_id uuid references public.profiles (id) on delete set null,
  child_unique_id    text unique,              -- server-allocated 8-digit ID (registry below)
  first_name         text,
  last_name          text,
  city               text,
  school_name        text,
  class_grade        text,
  access_status      public.child_access_status not null default 'inactive',
  graduated          boolean not null default false, -- true once grade 11 is finished; promotion stops (advance_student_grades, 011)
  -- Round 12 (migration 030): chosen child-friendly LIGHT-MODE palette slug (or
  -- NULL for the default look). Applied via data-palette on .arena; dark mode
  -- unaffected. CHECK is the server-side whitelist (palettes are CSS-only).
  palette            text constraint students_palette_chk check (palette is null or palette in ('sky','bubblegum','mint','sunset','rainbow')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- parent_student_links : the ONLY source of truth for parent access to a student.
-- RLS for parent reads checks an 'active' link here.
-- -----------------------------------------------------------------------------
create table if not exists public.parent_student_links (
  id                 uuid primary key default gen_random_uuid(),
  parent_profile_id  uuid not null references public.parents (profile_id) on delete cascade,
  student_profile_id uuid not null references public.students (profile_id) on delete cascade,
  status             public.link_status not null default 'pending',
  verified_at        timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uq_parent_student_pair unique (parent_profile_id, student_profile_id)
);

comment on table public.parent_student_links is
  'Verified parent-child relationship. Parent RLS access to student data requires status = active here.';

-- -----------------------------------------------------------------------------
-- child_unique_ids : server-side 8-digit ID allocation registry (collision-safe).
-- The allocate_child_unique_id() generator (011) inserts here under uniqueness to
-- guarantee no two children share an ID. Never trust a client-provided ID.
-- -----------------------------------------------------------------------------
create table if not exists public.child_unique_ids (
  child_unique_id    text primary key,
  student_profile_id uuid not null unique references public.students (profile_id) on delete cascade,
  allocated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- child_credentials : maps a child auth user (synthetic c<8digits>@children.invalid
-- email) to its 8-digit ID. The parent sets the password; passwords live ONLY in
-- Supabase Auth (never stored here). Children never self-register or log in by email.
-- -----------------------------------------------------------------------------
-- child_unique_id is NULLABLE: the credential row is written at child-create time,
-- BEFORE any 8-digit ID exists. The ID is allocated later (on the first subscription /
-- plan choice) and backfilled here (see create_child_subscription in 011).
create table if not exists public.child_credentials (
  student_profile_id                uuid primary key references public.students (profile_id) on delete cascade,
  child_unique_id                   text unique,
  auth_user_id                      uuid not null unique references auth.users (id) on delete cascade,
  password_set_by_parent_profile_id uuid references public.profiles (id) on delete set null,
  password_set_at                   timestamptz,
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- child_login_attempts : rate-limit / temporary-lockout log for child login.
-- The child 8-digit ID is a public username; security is password + lockout. We
-- store an IP HASH (not the raw IP) for privacy. Service-role-only (no client RLS).
-- Its index, grants, RLS policy, and login helper functions live in 010/011
-- (backported from migrations/2026_06_28_008_child_account_provisioning.sql).
-- -----------------------------------------------------------------------------
create table if not exists public.child_login_attempts (
  id              bigint generated always as identity primary key,
  child_unique_id text not null,
  ip_hash         text,
  success         boolean not null default false,
  attempted_at    timestamptz not null default now()
);

-- =============================================================================
-- Security / permission helper functions (used by RLS in 010)
-- =============================================================================
-- These are SECURITY DEFINER and run as the function owner, which bypasses RLS
-- on the RBAC tables they read. This is intentional and prevents infinite
-- recursion (an RLS policy on profile_roles that calls has_permission(), which
-- itself reads profile_roles). Do NOT enable FORCE ROW LEVEL SECURITY on these
-- RBAC tables. search_path is pinned to avoid hijacking.

-- Resolve the current request's application profile id from the Auth uid.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;

comment on function public.current_profile_id() is
  'Returns the public.profiles.id for the currently authenticated Supabase user, or NULL.';

-- True if the current user holds a given role code.
create or replace function public.has_role(p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.profile_id = public.current_profile_id()
      and r.code = p_role_code
  )
$$;

-- True if the current user is an administrator.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_role('administrator')
$$;

-- True if the current user has been granted a specific permission code
-- (through any of their roles).
create or replace function public.has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profile_roles pr
    join public.role_permissions rp on rp.role_id = pr.role_id
    join public.permissions perm on perm.id = rp.permission_id
    where pr.profile_id = public.current_profile_id()
      and perm.code = p_permission_code
  )
$$;

-- True if the current user is a parent with an ACTIVE link to the given student.
create or replace function public.is_parent_linked_to_student(p_student_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.parent_student_links l
    where l.parent_profile_id = public.current_profile_id()
      and l.student_profile_id = p_student_profile_id
      and l.status = 'active'
  )
$$;

comment on function public.is_parent_linked_to_student(uuid) is
  'Authorization helper: current parent has an active parent_student_links row for the student.';

-- =============================================================================
-- Auth user provisioning (backported from migrations/2026_06_27_001_auth_user_provisioning.sql)
-- =============================================================================
-- Auto-create a base profile row when a Supabase Auth user is created. Role/type
-- (student vs parent) and onboarding details are completed later by the service
-- layer. SECURITY DEFINER so it can write to RLS-protected public.profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (auth_user_id, email, status)
  values (new.id, new.email, 'pending')
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- LEADERBOARD ENGINE (backported from migrations/2026_07_06_039_leaderboard_engine.sql)
-- Cached points/streak columns on students (server-managed; see 011 protection trigger).
-- -----------------------------------------------------------------------------
alter table public.students
  add column if not exists points_all_time  numeric(12,2) not null default 0,
  add column if not exists points_month     numeric(12,2) not null default 0,
  add column if not exists points_month_key text,
  add column if not exists last_points_at   timestamptz,
  add column if not exists current_streak   int not null default 0,
  add column if not exists best_streak      int not null default 0,
  add column if not exists last_active_date date,
  add column if not exists streak_tz        text not null default 'Asia/Baku';

-- =============================================================================
-- End of 002_core_profiles_roles_permissions.sql
-- =============================================================================
