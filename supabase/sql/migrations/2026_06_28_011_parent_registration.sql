-- Migration: 2026_06_28_011_parent_registration.sql
-- Purpose: Stage 10 (Parent App) — atomic parent self-registration. The web-app
--          registration server action creates the Auth user (service role,
--          email_confirm) then calls this to promote the auto-created profile into
--          an ACTIVE parent (parent role + parents row). Provider-agnostic; no email
--          dependency (we use admin.createUser, not signUp + email confirmation).
-- Environment first applied: development/staging
-- Related root SQL file(s): 011 (function), 013 (validation).
-- Backport status: completed (canonical 011 + 013 #19; from-zero rebuild = 19/19 PASS)
-- Destructive change: no (additive function)
-- Rollback notes: drop setup_parent().
-- Security: SECURITY DEFINER; service_role EXECUTE only (called from the server
--           action's admin client, like create_child_account). Not anon/authenticated.
-- =============================================================================

create or replace function public.setup_parent(
  p_auth_user_id uuid,
  p_display_name text default null
)
returns uuid  -- the parent's profile id
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid;
  v_role    uuid;
begin
  select id into v_profile from public.profiles where auth_user_id = p_auth_user_id;
  if v_profile is null then
    raise exception 'setup_parent: no profile for auth user %', p_auth_user_id
      using errcode = 'no_data_found';
  end if;

  -- A child profile must never be turned into a parent.
  if exists (select 1 from public.students s where s.profile_id = v_profile) then
    raise exception 'setup_parent: profile % is a student', v_profile using errcode = 'check_violation';
  end if;

  update public.profiles
     set status       = 'active',
         display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
         updated_at   = now()
   where id = v_profile;

  insert into public.parents (profile_id) values (v_profile)
  on conflict (profile_id) do nothing;

  select id into v_role from public.roles where code = 'parent';
  if v_role is null then raise exception 'setup_parent: parent role missing (seed 012)'; end if;
  insert into public.profile_roles (profile_id, role_id) values (v_profile, v_role)
  on conflict do nothing;

  return v_profile;
end;
$$;

comment on function public.setup_parent(uuid, text) is
  'Promote an auth user''s profile to an active parent (parent role + parents row). service_role EXECUTE only; run after admin.createUser.';

revoke all on function public.setup_parent(uuid, text) from public, anon, authenticated;
grant execute on function public.setup_parent(uuid, text) to service_role;

-- =============================================================================
-- End of 2026_06_28_011_parent_registration.sql
-- =============================================================================
