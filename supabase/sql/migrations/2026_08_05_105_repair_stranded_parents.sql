-- 105 — Stranded parent accounts: repair the data, harden setup_parent
--
-- THE BUG THE OWNER REPORTED
-- --------------------------
-- Registering says "this email is already registered", but logging in with the
-- same address says "no account exists". Both messages are produced by the same
-- codebase, from DIFFERENT definitions of "exists":
--
--   register  ->  public.email_is_registered()  ->  auth.users            (exists)
--   login     ->  parentAccountExists()         ->  profiles JOIN parents (missing)
--
-- So any auth user whose PARENT provisioning is incomplete gets both answers at
-- once. On this database five accounts are in exactly that state: profile row
-- present, `status = 'pending'`, no roles, no `parents` row.
--
-- They are the residue of the 2026-07-29 data-loss incident: recovery
-- reconstructed `profiles` from `auth.users` the way handle_new_user() does —
-- which deliberately creates a PENDING, role-less profile — but never re-ran the
-- parent provisioning that registration normally performs afterwards.
--
-- The same shape can arise without an incident: registration calls signUp and
-- THEN setup_parent, so any failure between the two strands an account.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
--   1. Hardens setup_parent so it can never parent-ify a STAFF profile.
--   2. Repairs the stranded accounts.
--
-- The code half of the fix (one shared account-state resolver, plus self-heal
-- on a successful login) lives in web-app/src/lib/auth/accountState.ts — this
-- migration removes the existing damage; the code stops it recurring.
--
-- IDEMPOTENT. Safe to re-run.

begin;

-- -----------------------------------------------------------------------------
-- 1. setup_parent must refuse a STAFF profile.
--
-- It already refuses a student ("a child profile must never be turned into a
-- parent") but would happily add the parent role next to `administrator`. That
-- matters now that login SELF-HEALS a missing parents row: an administrator
-- signing in to the parent web app must not silently acquire a parent account.
-- Patched from the live definition with one anchored insert.
-- -----------------------------------------------------------------------------
do $patch$
declare
  v_src text;
  v_old constant text := $a$  -- A child profile must never be turned into a parent.$a$;
  v_new constant text := $a$  -- Migration 105: a STAFF profile must never be turned into a parent
  -- either. Login self-heals a missing parents row after a correct password, so
  -- without this an administrator signing in to the parent web app would
  -- silently gain a parent account beside their staff role.
  if exists (
    select 1
      from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
     where pr.profile_id = v_profile
       and r.code in ('administrator', 'content_manager')
  ) then
    raise exception 'setup_parent: profile % holds a staff role', v_profile
      using errcode = 'check_violation';
  end if;

  -- A child profile must never be turned into a parent.$a$;
begin
  -- CR first: the live body came from a CRLF canonical file.
  v_src := replace(pg_get_functiondef('public.setup_parent(uuid,text)'::regprocedure), chr(13), '');

  if position('Migration 105' in v_src) > 0 then
    raise notice '105: setup_parent already refuses staff profiles — skipping';
  elsif position(v_old in v_src) = 0 then
    raise exception '105: anchor not found in setup_parent — re-derive the patch';
  else
    execute replace(v_src, v_old, v_new);
  end if;
end
$patch$;

revoke all on function public.setup_parent(uuid, text) from public, anon, authenticated;
grant execute on function public.setup_parent(uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Repair the stranded accounts.
--
-- Scope, deliberately narrow — a profile is repaired ONLY when it is
-- unambiguously an incomplete PARENT registration:
--   * it has an auth user (so somebody really signed up),
--   * it has NO roles at all (not staff, not already a parent),
--   * it is NOT a student (a child profile is never a parent),
--   * it has no `parents` row yet.
--
-- Anything else is left untouched: an administrator without a parents row is
-- CORRECT, not broken.
-- -----------------------------------------------------------------------------
do $repair$
declare
  v_ids uuid[];
  v_n   int;
  v_id  uuid;
begin
  select coalesce(array_agg(p.id), '{}')
    into v_ids
  from public.profiles p
  join auth.users u on u.id = p.auth_user_id
  where not exists (select 1 from public.parents pa where pa.profile_id = p.id)
    and not exists (select 1 from public.students s where s.profile_id = p.id)
    and not exists (select 1 from public.profile_roles pr where pr.profile_id = p.id);

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    raise notice '105: no stranded parent accounts to repair';
    return;
  end if;

  foreach v_id in array v_ids loop
    -- Reuse setup_parent rather than hand-writing the same three inserts: it is
    -- the ONE definition of "this profile is a parent", and it stays idempotent.
    perform public.setup_parent(
      (select auth_user_id from public.profiles where id = v_id), null);
  end loop;

  raise notice '105: repaired % stranded parent account(s)', v_n;
end
$repair$;

-- -----------------------------------------------------------------------------
-- 3. Assertions.
-- -----------------------------------------------------------------------------
do $verify$
declare
  v_bad int;
  v_src text;
begin
  v_src := replace(pg_get_functiondef('public.setup_parent(uuid,text)'::regprocedure), chr(13), '');
  if position('Migration 105' in v_src) = 0 then
    raise exception '105: setup_parent was not hardened';
  end if;
  -- The pre-existing student guard must survive.
  if position('is a student' in v_src) = 0 then
    raise exception '105: setup_parent lost its student guard';
  end if;

  -- No auth user may be left in the contradictory state: has a profile, has no
  -- staff role, is not a student, yet has no parents row.
  select count(*) into v_bad
  from public.profiles p
  join auth.users u on u.id = p.auth_user_id
  where not exists (select 1 from public.parents pa where pa.profile_id = p.id)
    and not exists (select 1 from public.students s where s.profile_id = p.id)
    and not exists (
      select 1 from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
      where pr.profile_id = p.id and r.code in ('administrator', 'content_manager'));
  if v_bad <> 0 then
    raise exception '105: % account(s) still stranded', v_bad;
  end if;

  raise notice '105 OK — setup_parent refuses staff; no stranded parent accounts remain';
end
$verify$;

commit;
