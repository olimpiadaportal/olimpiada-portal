-- Migration: 2026_06_27_001_auth_user_provisioning.sql
-- Purpose: Auto-create a base public.profiles row when a Supabase Auth user is created,
--          so identity exists immediately after signup. Role/type (student vs parent)
--          and onboarding details are completed later by the service layer.
-- Environment first applied: development/staging
-- Related root SQL file(s): supabase/sql/002_core_profiles_roles_permissions.sql
-- Backport status: completed (also added to canonical 002)
-- Destructive change: no
-- Rollback notes:
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.handle_new_user();
-- =============================================================================

-- SECURITY DEFINER so it can insert into public.profiles (which has RLS) when the
-- Auth system creates the user. Idempotent on conflict so re-signup edge cases and
-- reruns are safe. Does not assign a role or create student/parent rows — that is
-- decided during onboarding by the service layer.
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

-- Validation (read-only):
--   select tgname from pg_trigger where tgname = 'on_auth_user_created';
--   select proname from pg_proc where proname = 'handle_new_user';
