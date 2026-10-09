-- 182 — The Super Admin: one protected administrator account (owner, 2026-10-09).
--
-- WHAT IT IS. The Super Admin is an ADMINISTRATOR (it keeps the
-- `administrator` role and every power that role already has) whose account is
-- PROTECTED: nobody — not another administrator, not the Super Admin itself
-- through the panel, not a hand-written API request — can delete it, disable
-- it, strip its roles or move the designation to someone else.
--
-- WHY A FLAG AND NOT A NEW ROLE. Every authorization check in this system —
-- is_admin(), the RLS policies, the panel guards — keys on the `administrator`
-- role. A separate `super_admin` role would have to be threaded through all of
-- them, and any one that was missed would make the most privileged account
-- LESS privileged than an ordinary admin. A flag on top of the existing role
-- changes nothing about what the account can do; it only changes what can be
-- done TO it.
--
-- WHY IN THE DATABASE. The panel hides the controls, and its server actions
-- refuse the operations — but those are the layers a modified request goes
-- around. These triggers are what make "cannot be modified or deleted" true for
-- every caller, the service-role client included.
--
-- WHAT IS DELIBERATELY NOT BLOCKED: the account's PASSWORD and its sign-in. The
-- panel offers no password controls for the Super Admin, but Supabase Auth's
-- own recovery must keep working — a locked-out owner with no recovery path is
-- a worse outcome than anything this protects against.
--
-- ASSIGNMENT is by profile id AND auth user id (both checked), never by name.
-- The account has no display name in production; it is the one profile that
-- held the administrator role when this was written.
--
-- Safe to re-run. Staging is schema-only: the account does not exist there, so
-- the assignment step reports that and changes nothing.

-- 1. The flag, and at most ONE holder of it.
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

create unique index if not exists ux_profiles_single_super_admin
  on public.profiles ((true))
  where is_super_admin;

-- 2. Profile guard: the designation cannot be granted or removed outside a
--    reviewed migration, and the Super Admin's profile cannot be deleted,
--    disabled or re-pointed at another auth user.
create or replace function public.fn_guard_super_admin_profile()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_assigning boolean := coalesce(current_setting('olympiq.super_admin_assign', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.is_super_admin then
      raise exception 'The Super Admin account cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.is_super_admin and not v_assigning then
      raise exception 'The Super Admin designation can only be assigned by a reviewed migration.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.is_super_admin is distinct from old.is_super_admin and not v_assigning then
    raise exception 'The Super Admin designation can only be changed by a reviewed migration.'
      using errcode = '42501';
  end if;
  if old.is_super_admin and not v_assigning
     and (new.status is distinct from old.status
          or new.auth_user_id is distinct from old.auth_user_id) then
    raise exception 'The Super Admin account cannot be modified.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_super_admin_profile on public.profiles;
create trigger trg_guard_super_admin_profile
  before insert or update or delete on public.profiles
  for each row execute function public.fn_guard_super_admin_profile();

-- 3. Role guard: the Super Admin's roles cannot be removed, changed or added to.
create or replace function public.fn_guard_super_admin_roles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_assigning boolean := coalesce(current_setting('olympiq.super_admin_assign', true), '') = 'on';
begin
  if v_assigning then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE')
     and exists (select 1 from public.profiles p where p.id = old.profile_id and p.is_super_admin) then
    raise exception 'The Super Admin account''s roles cannot be changed.' using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and exists (select 1 from public.profiles p where p.id = new.profile_id and p.is_super_admin) then
    raise exception 'The Super Admin account''s roles cannot be changed.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_super_admin_roles on public.profile_roles;
create trigger trg_guard_super_admin_roles
  before insert or update or delete on public.profile_roles
  for each row execute function public.fn_guard_super_admin_roles();

-- Trigger functions are not callable as RPCs, but revoke anyway: Supabase's
-- default privileges grant EXECUTE to anon and authenticated explicitly.
revoke all on function public.fn_guard_super_admin_profile() from public, anon, authenticated;
revoke all on function public.fn_guard_super_admin_roles() from public, anon, authenticated;

-- 4. Assign the existing administrator account (Ailə Quliyev).
do $$
declare
  c_profile constant uuid := '414f3c7b-8086-4f37-a597-a7b220c37f1d';
  c_auth    constant uuid := 'e4d52772-d1e3-48de-a359-dd14f16585d8';
  v_exists boolean;
begin
  select exists (
    select 1 from public.profiles p
    where p.id = c_profile and p.auth_user_id = c_auth
  ) into v_exists;

  if not v_exists then
    raise notice '182: the Super Admin account is not in this database (expected on staging) — nothing assigned.';
    return;
  end if;

  if not exists (
    select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id
    where pr.profile_id = c_profile and r.code = 'administrator'
  ) then
    raise exception '182: refusing — profile % does not hold the administrator role.', c_profile;
  end if;

  perform set_config('olympiq.super_admin_assign', 'on', true);
  update public.profiles set is_super_admin = true where id = c_profile and not is_super_admin;
  perform set_config('olympiq.super_admin_assign', '', true);

  if (select count(*) from public.profiles where is_super_admin) <> 1 then
    raise exception '182: expected exactly one Super Admin after assignment.';
  end if;
  raise notice '182: Super Admin assigned to profile %.', c_profile;
end;
$$;

-- 5. Self-check: both guards are installed and armed.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_super_admin_profile' and not tgisinternal and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger where tgname = 'trg_guard_super_admin_roles' and not tgisinternal and tgenabled <> 'D') then
    raise exception '182: a Super Admin guard trigger is missing or disabled.';
  end if;
end;
$$;
