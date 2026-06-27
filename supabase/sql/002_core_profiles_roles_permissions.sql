-- =============================================================================
-- 002_core_profiles_roles_permissions.sql
-- =============================================================================
-- Olimpiada Portal — canonical root SQL file 002 of 013.
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
  phone_optional   text,                      -- optional profile data only; never used for SMS/auth
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
  district_id        uuid,                     -- FK -> districts(id) added in 011
  birth_year_optional smallint,
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
-- End of 002_core_profiles_roles_permissions.sql
-- =============================================================================
