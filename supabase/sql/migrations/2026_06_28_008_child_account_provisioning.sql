-- Migration: 2026_06_28_008_child_account_provisioning.sql
-- Purpose: Stage 8 (Child Authentication & Account Model), increment 1 (DB layer).
--          Atomic server-side child provisioning + child-login lockout/rate-limiting.
--          A child is a real Supabase Auth user (synthetic c<8digits>@children.invalid
--          email, parent-set password) — the Auth user is created by the service layer
--          (admin API); THIS function does all DB writes atomically afterwards.
-- Environment first applied: development/staging
-- Related root SQL file(s): 002 (child_login_attempts table + create_child_account fn),
--          010 (RLS for child_login_attempts), 011 (login helper fns + index),
--          013 (validation).
-- Backport status: completed (canonical 002/010/011/013; from-zero rebuild = 17/17 PASS)
-- Destructive change: no (additive function/table/policies)
-- Rollback notes: drop create_child_account(), child_login_attempts + its functions/policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- create_child_account : atomic, server-side child provisioning.
-- The Auth user (p_auth_user_id) is created first by the service layer; the
-- on_auth_user_created trigger has already inserted a base profiles row. This
-- function promotes that profile to an active child, creates the student row,
-- allocates the 8-digit ID, assigns the Student role, records the credential
-- mapping, and auto-links the child to the creating parent — all in one txn.
-- SECURITY DEFINER; EXECUTE restricted to service_role (the parent server action
-- runs this with the service role, after admin.createUser). Never client-callable.
-- -----------------------------------------------------------------------------
-- (drop first: renaming the RETURNS TABLE columns changes the return signature)
drop function if exists public.create_child_account(uuid, uuid, text, text, text, text, text);
create or replace function public.create_child_account(
  p_parent_profile_id uuid,
  p_auth_user_id      uuid,
  p_first_name        text,
  p_last_name         text,
  p_city              text default null,
  p_school_name       text default null,
  p_class_grade       text default null
)
-- OUT column names are deliberately non-colliding with table columns (else plpgsql
-- raises "ambiguous column reference" inside the body).
returns table (new_student_profile_id uuid, new_child_unique_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id      uuid;
  v_student_role_id uuid;
  v_child_id        text;
begin
  -- The creator must be a registered parent (parents row exists).
  if not exists (select 1 from public.parents pa where pa.profile_id = p_parent_profile_id) then
    raise exception 'create_child_account: % is not a registered parent', p_parent_profile_id
      using errcode = 'check_violation';
  end if;

  -- The child Auth user must already exist with an auto-created profile.
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_user_id = p_auth_user_id;
  if v_profile_id is null then
    raise exception 'create_child_account: no profile for auth user %', p_auth_user_id
      using errcode = 'no_data_found';
  end if;

  -- Idempotency guard: never double-provision a profile already made a student.
  if exists (select 1 from public.students s where s.profile_id = v_profile_id) then
    raise exception 'create_child_account: profile % is already a student', v_profile_id
      using errcode = 'unique_violation';
  end if;

  -- 1) Promote the auto-created profile into an active child profile.
  --    Children have no contact email (synthetic auth email is not contact info).
  update public.profiles
     set display_name = nullif(btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), ''),
         email        = null,
         status       = 'active',
         updated_at   = now()
   where id = v_profile_id;

  -- 2) Create the student row (parent-created child; no paid access yet).
  insert into public.students (profile_id, created_by_parent_profile_id,
                               first_name, last_name, city, school_name, class_grade,
                               access_status)
  values (v_profile_id, p_parent_profile_id,
          p_first_name, p_last_name, p_city, p_school_name, p_class_grade,
          'inactive');

  -- 3) Allocate the collision-safe 8-digit ID (also sets students.child_unique_id).
  v_child_id := public.allocate_child_unique_id(v_profile_id);

  -- 4) Assign the Student role.
  select r.id into v_student_role_id from public.roles r where r.code = 'student';
  if v_student_role_id is null then
    raise exception 'create_child_account: student role missing (seed 012)';
  end if;
  insert into public.profile_roles (profile_id, role_id, assigned_by)
  values (v_profile_id, v_student_role_id, p_parent_profile_id)
  on conflict do nothing;

  -- 5) Record the credential mapping (password lives ONLY in Supabase Auth).
  insert into public.child_credentials (student_profile_id, child_unique_id, auth_user_id,
                                        password_set_by_parent_profile_id, password_set_at)
  values (v_profile_id, v_child_id, p_auth_user_id, p_parent_profile_id, now());

  -- 6) Auto-link the child to the creating parent (active link = parent access).
  insert into public.parent_student_links (parent_profile_id, student_profile_id, status,
                                           verified_at, created_by)
  values (p_parent_profile_id, v_profile_id, 'active', now(), p_parent_profile_id)
  on conflict (parent_profile_id, student_profile_id)
    do update set status = 'active', verified_at = now();

  return query select v_profile_id, v_child_id;
end;
$$;

comment on function public.create_child_account(uuid, uuid, text, text, text, text, text) is
  'Atomic parent-created child provisioning. service_role EXECUTE only. Run AFTER admin.createUser (synthetic c<8digits>@children.invalid).';

-- service_role only (the service layer runs admin.createUser then this).
-- NOTE: revoke from anon/authenticated EXPLICITLY — Supabase ALTER DEFAULT PRIVILEGES
-- grants EXECUTE to anon/authenticated on every new function, so revoking from
-- public alone is not enough.
revoke all on function public.create_child_account(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_child_account(uuid, uuid, text, text, text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- child_login_attempts : rate-limit / temporary-lockout log for child login.
-- The child 8-digit ID is a public username; security is password + lockout. We
-- store an IP HASH (not the raw IP) for privacy. Service-role-only (no client RLS).
-- -----------------------------------------------------------------------------
create table if not exists public.child_login_attempts (
  id              bigint generated always as identity primary key,
  child_unique_id text not null,
  ip_hash         text,
  success         boolean not null default false,
  attempted_at    timestamptz not null default now()
);

create index if not exists idx_child_login_attempts_lookup
  on public.child_login_attempts (child_unique_id, attempted_at desc);

-- Privileges: writes are service-role only; admins may READ (RLS limits rows).
revoke all on public.child_login_attempts from anon, authenticated;
grant select on public.child_login_attempts to authenticated;  -- RLS restricts rows to admins
grant all on public.child_login_attempts to service_role;
grant usage, select on sequence public.child_login_attempts_id_seq to service_role;

alter table public.child_login_attempts enable row level security;
-- Admins may READ the lockout log (security monitoring); writes are service-role only.
drop policy if exists "child_login_attempts_admin_select" on public.child_login_attempts;
create policy "child_login_attempts_admin_select" on public.child_login_attempts
  for select to authenticated using (public.is_admin());

-- True when a child ID has >= 8 failed attempts in the last 15 minutes.
create or replace function public.is_child_login_locked(p_child_unique_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) >= 8
  from public.child_login_attempts a
  where a.child_unique_id = p_child_unique_id
    and a.success = false
    and a.attempted_at > now() - interval '15 minutes'
$$;

-- Record a login attempt; a success clears the recent failure streak (resets window).
create or replace function public.record_child_login_attempt(
  p_child_unique_id text,
  p_ip_hash         text,
  p_success         boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.child_login_attempts (child_unique_id, ip_hash, success)
  values (p_child_unique_id, p_ip_hash, p_success);
  if p_success then
    delete from public.child_login_attempts
     where child_unique_id = p_child_unique_id
       and success = false
       and attempted_at > now() - interval '15 minutes';
  end if;
end;
$$;

-- Login helpers: service_role only (revoke anon/authenticated explicitly, as above).
revoke all on function public.is_child_login_locked(text) from public, anon, authenticated;
grant execute on function public.is_child_login_locked(text) to service_role;
revoke all on function public.record_child_login_attempt(text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_child_login_attempt(text, text, boolean) to service_role;

-- =============================================================================
-- End of 2026_06_28_008_child_account_provisioning.sql
-- =============================================================================
